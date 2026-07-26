import { Injectable } from '@nestjs/common';
import { User } from '../../entities/user.entity';

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

/** 会员配额（激活时联动，降级时回退）。 */
export const PRO_QUOTA_PHOTO = 300;
export const PRO_QUOTA_VOICE_SEC = 10800;
export const FREE_QUOTA_PHOTO = 50;
export const FREE_QUOTA_VOICE_SEC = 1800;

export type MemberStatus = 'FREE' | 'ACTIVE' | 'EXPIRED';

/**
 * 会员权益联动的共享幂等服务（T3.3）。
 *
 * 设计要点：
 * - 纯函数式 mutator——只修改传入的 `User` 实体，不查库，因此无状态、可注入任意模块。
 * - 作为「激活/降级」写路径（membership 模块下单/退款）与「读取时惰性降级」读路径
 *   （/me、/me/quota 等）的**单一来源**，避免配额联动逻辑散落多份导致不一致。
 * - 幂等：同值复写无害；`reconcileExpiry` 仅在「pro 且过期」时变更并返回 true。
 */
@Injectable()
export class MemberBenefitService {
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

  /** 计算会员展示状态（FREE / ACTIVE / EXPIRED）。 */
  computeStatus(u: User): MemberStatus {
    if (u.plan !== 'pro') return 'FREE';
    if (!u.memberExpireAt || u.memberExpireAt.getTime() >= Date.now())
      return 'ACTIVE';
    return 'EXPIRED';
  }
}
