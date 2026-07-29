import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, In } from 'typeorm';
import { User } from '../../entities/user.entity';
import { Order } from '../../entities/order.entity';
import { MemberPlan } from '../../entities/member-plan.entity';
import {
  CreateMembershipOrderDto,
  RefundDto,
  SetRenewalDto,
} from './membership.dto';
import {
  MEMBER_BENEFITS_PRO,
  MEMBER_BENEFITS_FREE,
  MemberBenefitService,
} from './member-benefit.service';
import { InviteService } from '../invite/invite.service';

/** 未支付订单的关单时限（分钟）。 */
const ORDER_EXPIRE_MINUTES = 15;
const MEMBERSHIP_PLAN_CODES = ['monthly', 'yearly', 'yearly_once'];

@Injectable()
export class MembershipService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(MemberPlan)
    private readonly plans: Repository<MemberPlan>,
    private readonly benefit: MemberBenefitService,
    private readonly dataSource: DataSource,
    @Optional()
    @Inject(forwardRef(() => InviteService))
    private readonly invite?: InviteService,
  ) {}

  async listPlans(userId?: string) {
    const rows = await this.plans.find({
      where: { active: true },
      order: { sort: 'ASC' },
    });
    const firstMonthEligible = userId
      ? await this.isFirstMonthEligible(userId)
      : true;

    return rows.map((p) => {
      const useFirst =
        p.code === 'monthly' &&
        firstMonthEligible &&
        p.firstMonthDiscountCent != null;
      const effectivePriceCent = useFirst
        ? (p.firstMonthDiscountCent as number)
        : p.priceCent;
      return {
        code: p.code,
        name: p.name,
        priceCent: p.priceCent,
        /** 未登录时按「可享首月」展示；下单以服务端 createOrder 为准 */
        effectivePriceCent,
        periodDays: p.periodDays,
        autoRenew: p.autoRenew,
        tag: p.tag ?? null,
        originalPriceCent: p.originalPriceCent ?? null,
        firstMonthDiscountCent: p.firstMonthDiscountCent ?? null,
      };
    });
  }

  async isFirstMonthEligible(userId: string) {
    const paid = await this.orders.count({
      where: {
        userId,
        status: 'paid',
        planCode: In(MEMBERSHIP_PLAN_CODES),
      },
    });
    return paid === 0;
  }

  /** 我的会员状态（含惰性降级、导出策略、配额摘要）。 */
  async getMe(userId: string) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('user not found');

    const changed = this.benefit.reconcileExpiry(user);
    if (changed) await this.users.save(user);

    const status = this.benefit.computeStatus(user);
    const expireAt = user.memberExpireAt ?? null;
    const daysLeft =
      status === 'ACTIVE' && expireAt
        ? Math.max(
            0,
            Math.ceil((expireAt.getTime() - Date.now()) / 86_400_000),
          )
        : null;
    const nearExpire = daysLeft != null && daysLeft <= 7;

    const pending = await this.orders.findOne({
      where: { userId, status: 'pending' },
      order: { createdAt: 'DESC' },
    });

    const firstMonthEligible = await this.isFirstMonthEligible(userId);
    const exportPolicy = this.benefit.exportPolicyOf(user);

    return {
      plan: user.plan,
      status,
      displayStatus: status,
      expireAt,
      autoRenew: user.autoRenew,
      memberSinceAt: user.memberSinceAt ?? null,
      daysLeft,
      nearExpire,
      benefits: user.plan === 'pro' ? MEMBER_BENEFITS_PRO : MEMBER_BENEFITS_FREE,
      firstMonthEligible,
      exportPolicy,
      quota: {
        photo: {
          used: user.usedPhoto,
          quota: user.quotaPhoto,
          remaining: Math.max(0, user.quotaPhoto - user.usedPhoto),
        },
        voiceSec: {
          used: user.usedVoiceSec,
          quota: user.quotaVoiceSec,
          remaining: Math.max(0, user.quotaVoiceSec - user.usedVoiceSec),
          unit: 'second' as const,
        },
      },
      pendingOrderNo: pending?.id ?? null,
    };
  }

  /** 流失挽回 stub：过期 ≥3 天返回展示用召回券（不实扣）。 */
  async getWinback(userId: string) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('user not found');
    this.benefit.reconcileExpiry(user);
    await this.users.save(user);

    const since = user.memberExpireAt ?? user.updatedAt;
    const expiredDays = since
      ? Math.floor((Date.now() - new Date(since).getTime()) / 86_400_000)
      : 0;
    const available =
      !!user.memberSinceAt &&
      user.plan === 'free' &&
      expiredDays >= 3;

    return {
      available,
      expiredDays: available ? expiredDays : 0,
      journeyHint: available
        ? '回忆这一年的旅程，用召回券续费更划算'
        : null,
      coupon: available
        ? {
            id: 'winback_stub',
            planCode: 'yearly_once',
            amountOffCent: 6900,
            title: '老友召回 · 续费立减 ¥69',
            validDays: 7,
            note: '展示用 stub，正式核销 P1 落地',
          }
        : null,
    };
  }

  async createOrder(userId: string, dto: CreateMembershipOrderDto) {
    const plan = await this.plans.findOne({
      where: { code: dto.planCode, active: true },
    });
    if (!plan) throw new BadRequestException(`unknown plan: ${dto.planCode}`);

    const firstMonthEligible = await this.isFirstMonthEligible(userId);
    const useFirst =
      plan.code === 'monthly' &&
      firstMonthEligible &&
      plan.firstMonthDiscountCent != null;
    const effectivePriceCent = useFirst
      ? (plan.firstMonthDiscountCent as number)
      : plan.priceCent;
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
        couponId: dto.couponId ?? null,
      }),
    );
    return {
      orderNo: order.id,
      mockPayToken: `mock_${order.id}`,
      amountCent: effectivePriceCent,
      planCode: plan.code,
      periodDays: plan.periodDays,
      autoRenew: plan.autoRenew,
      firstMonthApplied: useFirst,
      expireAt: order.expireAt,
    };
  }

  async payOrder(orderNo: string, userId: string) {
    const result = await this.dataSource.transaction(async (manager) => {
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

      if (order.expireAt && order.expireAt.getTime() < Date.now()) {
        order.status = 'expired';
        await manager.save(order);
        throw new BadRequestException('order expired');
      }

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

      this.benefit.applyBenefits(
        user,
        'pro',
        order.periodDays ?? 30,
        order.autoRenew,
      );
      await manager.save(user);

      return {
        ok: true,
        alreadyPaid: false,
        status: 'paid',
        plan: user.plan,
        expireAt: user.memberExpireAt ?? null,
      };
    });

    // 邀请发奖放事务外，避免循环依赖死锁；失败不影响支付成功
    if (!result.alreadyPaid && this.invite) {
      try {
        await this.invite.onInviteeActivated(userId);
      } catch {
        /* ignore */
      }
    }
    return result;
  }

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
      periodDays: order.periodDays ?? null,
      autoRenew: order.autoRenew,
    };
  }

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

  async setRenewal(userId: string, dto: SetRenewalDto) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('user not found');
    user.autoRenew = dto.autoRenew;
    await this.users.save(user);
    return { autoRenew: user.autoRenew };
  }

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
          where: {
            userId,
            status: 'paid',
            planCode: In(MEMBERSHIP_PLAN_CODES),
          },
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
      this.benefit.applyBenefits(user, 'free');
      await manager.save(user);

      return { refundId: order.refundId, status: 'refunded', plan: user.plan };
    });
  }
}
