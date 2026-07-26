import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { User } from '../../entities/user.entity';
import { Order } from '../../entities/order.entity';
import { MemberPlan } from '../../entities/member-plan.entity';
import {
  CreateMembershipOrderDto,
  RefundDto,
  SetRenewalDto,
} from './membership.dto';

/** 会员权益标识（与权益矩阵 §1 对齐；前端按 key 解锁功能）。 */
export const MEMBER_BENEFITS_PRO = [
  'photo_300',
  'voice_180min',
  'ai_organize',
  'export_1080p',
  'multi_device',
  'premium_templates',
  'map_style',
];
export const MEMBER_BENEFITS_FREE = ['photo_50', 'voice_30min', 'basic_templates'];

/** 未支付订单的关单时限（分钟）。 */
const ORDER_EXPIRE_MINUTES = 15;
/** 会员配额（激活时联动，降级时回退）。 */
const PRO_QUOTA_PHOTO = 300;
const PRO_QUOTA_VOICE_SEC = 10800;
const FREE_QUOTA_PHOTO = 50;
const FREE_QUOTA_VOICE_SEC = 1800;

@Injectable()
export class MembershipService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(MemberPlan)
    private readonly plans: Repository<MemberPlan>,
    private readonly dataSource: DataSource,
  ) {}

  /** 套餐列表（运营配置驱动，按 sort 升序；仅上架）。 */
  async listPlans() {
    const rows = await this.plans.find({
      where: { active: true },
      order: { sort: 'ASC' },
    });
    return rows.map((p) => ({
      code: p.code,
      name: p.name,
      priceCent: p.priceCent,
      periodDays: p.periodDays,
      autoRenew: p.autoRenew,
      tag: p.tag ?? null,
      originalPriceCent: p.originalPriceCent ?? null,
      firstMonthDiscountCent: p.firstMonthDiscountCent ?? null,
    }));
  }

  /** 我的会员状态（含惰性降级判定）。 */
  async getMe(userId: string) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('user not found');

    // 先按原始状态算 status（过期则一次性返回 EXPIRED），再惰性降级落库。
    const status = this.computeStatus(user);
    const changed = this.reconcileExpiry(user);
    if (changed) await this.users.save(user);

    return {
      plan: user.plan,
      status,
      expireAt: user.memberExpireAt ?? null,
      autoRenew: user.autoRenew,
      benefits: user.plan === 'pro' ? MEMBER_BENEFITS_PRO : MEMBER_BENEFITS_FREE,
    };
  }

  /** 创建会员订单（不调微信，返回 orderNo + mockPayToken 占位）。 */
  async createOrder(userId: string, dto: CreateMembershipOrderDto) {
    const plan = await this.plans.findOne({
      where: { code: dto.planCode, active: true },
    });
    if (!plan) throw new BadRequestException(`unknown plan: ${dto.planCode}`);

    const effectivePriceCent = plan.firstMonthDiscountCent ?? plan.priceCent;
    const expireAt = new Date(Date.now() + ORDER_EXPIRE_MINUTES * 60_000);

    const order = await this.orders.save(
      this.orders.create({
        userId,
        product: 'pro_monthly',
        amountCent: effectivePriceCent,
        status: 'pending',
        planCode: plan.code,
        periodDays: plan.periodDays,
        autoRenew: plan.autoRenew,
        expireAt,
      }),
    );
    return {
      orderNo: order.id,
      mockPayToken: `mock_${order.id}`,
      amountCent: effectivePriceCent,
      planCode: plan.code,
      expireAt: order.expireAt,
    };
  }

  /** Mock 确认支付：订单置 paid → 激活会员 → 联动配额。幂等（已 paid 直接返回）。 */
  async payOrder(orderNo: string, userId: string) {
    return this.dataSource.transaction(async (manager) => {
      const order = await manager.findOne(Order, {
        where: { id: orderNo },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) throw new NotFoundException('order not found');
      if (order.userId !== userId)
        throw new ForbiddenException('order not owned by current user');

      if (order.status === 'paid') {
        const u = await manager.findOne(User, { where: { id: userId } });
        return {
          ok: true,
          alreadyPaid: true,
          status: 'paid',
          plan: u?.plan,
          expireAt: u?.memberExpireAt ?? null,
        };
      }
      if (order.status !== 'pending')
        throw new BadRequestException(`order status is ${order.status}`);

      order.status = 'paid';
      order.transactionId = `mock_tx_${Date.now()}`;
      order.paidAt = new Date();
      order.expireAt = null;
      await manager.save(order);

      const user = await manager.findOne(User, {
        where: { id: userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user) throw new NotFoundException('user not found');

      this.applyBenefits(user, 'pro', order.periodDays ?? 30, order.autoRenew);
      await manager.save(user);

      return {
        ok: true,
        alreadyPaid: false,
        status: 'paid',
        plan: user.plan,
        expireAt: user.memberExpireAt ?? null,
      };
    });
  }

  /** 订单状态查询（轮询兜底）。 */
  async getOrder(orderNo: string, userId: string) {
    const order = await this.orders.findOne({ where: { id: orderNo } });
    if (!order) throw new NotFoundException('order not found');
    if (order.userId !== userId)
      throw new ForbiddenException('order not owned by current user');
    return {
      orderNo: order.id,
      status: order.status,
      paidAt: order.paidAt ?? null,
      planCode: order.planCode ?? null,
      amountCent: order.amountCent,
    };
  }

  /** 取消未支付订单。 */
  async cancelOrder(orderNo: string, userId: string) {
    return this.dataSource.transaction(async (manager) => {
      const order = await manager.findOne(Order, {
        where: { id: orderNo },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) throw new NotFoundException('order not found');
      if (order.userId !== userId)
        throw new ForbiddenException('order not owned by current user');
      if (order.status !== 'pending')
        throw new BadRequestException(
          `cannot cancel order with status ${order.status}`,
        );
      order.status = 'closed';
      await manager.save(order);
      return { status: 'closed' };
    });
  }

  /** 开关自动续费。 */
  async setRenewal(userId: string, dto: SetRenewalDto) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('user not found');
    user.autoRenew = dto.autoRenew;
    await this.users.save(user);
    return { autoRenew: user.autoRenew };
  }

  /** 申请退款（mock）：置 refunded + 降级 free（配额回退，不删数据）。 */
  async refund(userId: string, dto: RefundDto) {
    return this.dataSource.transaction(async (manager) => {
      let order: Order | null = null;
      if (dto.orderNo) {
        order = await manager.findOne(Order, {
          where: { id: dto.orderNo },
          lock: { mode: 'pessimistic_write' },
        });
        if (!order) throw new NotFoundException('order not found');
        if (order.userId !== userId)
          throw new ForbiddenException('order not owned by current user');
      } else {
        order = await manager.findOne(Order, {
          where: { userId, product: 'pro_monthly', status: 'paid' },
          order: { createdAt: 'DESC' },
        });
        if (!order)
          throw new BadRequestException('no paid membership order to refund');
      }
      if (order.status !== 'paid')
        throw new BadRequestException(
          `cannot refund order with status ${order.status}`,
        );

      order.status = 'refunded';
      order.refundId = `ref_${Date.now()}`;
      await manager.save(order);

      const user = await manager.findOne(User, {
        where: { id: userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user) throw new NotFoundException('user not found');
      this.applyBenefits(user, 'free');
      await manager.save(user);

      return { refundId: order.refundId, status: 'refunded', plan: user.plan };
    });
  }

  // ---- 权益联动（applyBenefits，T3.3 抽为共享幂等服务） ----

  /** 激活/降级会员权益：直接改 user.plan + 配额；幂等（同值复写无害）。 */
  applyBenefits(
    user: User,
    plan: 'free' | 'pro',
    periodDays?: number,
    autoRenew?: boolean,
  ): void {
    if (plan === 'pro') {
      user.plan = 'pro';
      user.quotaPhoto = PRO_QUOTA_PHOTO;
      user.quotaVoiceSec = PRO_QUOTA_VOICE_SEC;
      user.memberExpireAt = periodDays
        ? new Date(Date.now() + periodDays * 86_400_000)
        : null;
      user.autoRenew = !!autoRenew;
      if (!user.memberSinceAt) user.memberSinceAt = new Date();
    } else {
      user.plan = 'free';
      user.quotaPhoto = FREE_QUOTA_PHOTO;
      user.quotaVoiceSec = FREE_QUOTA_VOICE_SEC;
      user.memberExpireAt = null;
      user.autoRenew = false;
    }
  }

  /** 惰性降级：pro 且过期 → free（配额回退，不删数据）。返回是否发生变更。 */
  reconcileExpiry(user: User): boolean {
    if (
      user.plan === 'pro' &&
      user.memberExpireAt &&
      user.memberExpireAt.getTime() < Date.now()
    ) {
      this.applyBenefits(user, 'free');
      return true;
    }
    return false;
  }

  private computeStatus(
    u: User,
  ): 'FREE' | 'ACTIVE' | 'EXPIRED' {
    if (u.plan !== 'pro') return 'FREE';
    if (!u.memberExpireAt || u.memberExpireAt.getTime() >= Date.now())
      return 'ACTIVE';
    return 'EXPIRED';
  }
}
