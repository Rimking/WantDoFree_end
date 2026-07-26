import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Order } from '../../entities/order.entity';
import { User } from '../../entities/user.entity';
import {
  CreateOrderDto,
  PRODUCT_PRICES,
  ProductCode,
} from './payment.dto';
import { WechatPayService } from './wechat-pay.service';

@Injectable()
export class PaymentService {
  constructor(
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly pay: WechatPayService,
    private readonly dataSource: DataSource,
  ) {}

  async createOrder(userId: string, dto: CreateOrderDto) {
    const amountCent = PRODUCT_PRICES[dto.product as ProductCode];
    if (!amountCent) {
      throw new BadRequestException(`unknown product: ${dto.product}`);
    }

    const order = await this.orders.save(
      this.orders.create({
        userId,
        product: dto.product,
        amountCent,
        status: 'pending',
      }),
    );
    const prepay = await this.pay.createPrepay(userId, dto.product, amountCent);
    return { orderId: order.id, ...prepay };
  }

  /**
   * 本地联调完成支付：仅在未配置真实商户号时可用，且需携带 DEV_PAY_NOTIFY_SECRET。
   * 已支付订单幂等返回，不会重复发放配额。
   */
  async completeMockPayment(
    orderId: string,
    secret: string | undefined,
    transactionId?: string,
  ) {
    if (this.pay.isConfigured()) {
      throw new ForbiddenException('真实商户已配置，禁止使用 mock 支付回调');
    }
    const expected = process.env.DEV_PAY_NOTIFY_SECRET ?? 'tuji_dev_pay';
    if (!secret || secret !== expected) {
      throw new ForbiddenException('invalid DEV_PAY_NOTIFY_SECRET');
    }
    return this.fulfillOrder(orderId, transactionId ?? `mock_tx_${Date.now()}`);
  }

  /** 微信平台正式回调入口（验签通过后调用）。当前未接证书时拒绝。 */
  async handlePlatformNotify(
    headers: Record<string, string>,
    rawBody: string,
    orderId: string,
    transactionId: string,
  ) {
    if (!this.pay.verifyNotifySignature(headers, rawBody)) {
      throw new ForbiddenException('payment notify signature invalid or not configured');
    }
    return this.fulfillOrder(orderId, transactionId);
  }

  private async fulfillOrder(orderId: string, transactionId: string) {
    return this.dataSource.transaction(async (manager) => {
      const order = await manager.findOne(Order, {
        where: { id: orderId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) throw new NotFoundException('order not found');

      if (order.status === 'paid') {
        return { ok: true, alreadyPaid: true };
      }
      if (order.status !== 'pending') {
        throw new BadRequestException(`order status is ${order.status}`);
      }

      order.status = 'paid';
      order.transactionId = transactionId;
      order.paidAt = new Date();
      await manager.save(order);

      const user = await manager.findOne(User, {
        where: { id: order.userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user) throw new NotFoundException('user not found');

      if (order.product === 'capacity_pack') {
        user.quotaPhoto += 500;
        user.quotaVoiceSec += 18000;
      }
      if (order.product === 'pro_monthly') {
        user.plan = 'pro';
      }
      await manager.save(user);

      return { ok: true, alreadyPaid: false };
    });
  }
}
