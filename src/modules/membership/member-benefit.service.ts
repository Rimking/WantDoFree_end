import { Injectable } from '@nestjs/common';
import { User } from '../../entities/user.entity';

/** 会员权益标识（与权益矩阵对齐；前端按 key 解锁功能）。 */
export const MEMBER_BENEFITS_PRO = [
  'photo_300',
  'voice_180min',
  'ai_organize',
  'export_1080p',
  'multi_device',
  'premium_templates',
  'map_style',
  'no_watermark',
];
export const MEMBER_BENEFITS_FREE = [
  'photo_50',
  'voice_30min',
  'basic_templates',
];

/** 会员配额（激活时联动，降级时回退）。 */
export const PRO_QUOTA_PHOTO = 300;
export const PRO_QUOTA_VOICE_SEC = 10800;
export const FREE_QUOTA_PHOTO = 50;
export const FREE_QUOTA_VOICE_SEC = 1800;

export const WATERMARK_TEXT_FREE = '渡清川·免费版';

export type MemberStatus = 'FREE' | 'ACTIVE' | 'EXPIRED';

export type ExportPolicy = {
  watermark: boolean;
  watermarkText: string | null;
  maxResolution: 720 | 1080;
};

/**
 * 会员权益联动的共享幂等服务。
 */
@Injectable()
export class MemberBenefitService {
  /**
   * 激活/降级会员权益。
   * pro：配额升到会员档；expireAt 在 max(now, 原 expireAt) 上顺延 periodDays。
   */
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
      if (periodDays && periodDays > 0) {
        const baseMs = Math.max(
          Date.now(),
          user.memberExpireAt?.getTime() ?? 0,
        );
        user.memberExpireAt = new Date(baseMs + periodDays * 86_400_000);
      }
      if (autoRenew !== undefined) user.autoRenew = !!autoRenew;
      if (!user.memberSinceAt) user.memberSinceAt = new Date();
    } else {
      user.plan = 'free';
      user.quotaPhoto = FREE_QUOTA_PHOTO;
      user.quotaVoiceSec = FREE_QUOTA_VOICE_SEC;
      user.memberExpireAt = null;
      user.autoRenew = false;
    }
  }

  /** 仅顺延天数（邀请奖励等），保持/升为 pro。 */
  extendMembershipDays(user: User, days: number, autoRenew?: boolean): void {
    this.applyBenefits(
      user,
      'pro',
      days,
      autoRenew !== undefined ? autoRenew : user.autoRenew,
    );
  }

  /** 惰性降级：pro 且过期 → free（配额回退，不删数据）。 */
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

  computeStatus(u: User): MemberStatus {
    if (u.plan !== 'pro') {
      if (u.memberSinceAt) return 'EXPIRED';
      return 'FREE';
    }
    if (!u.memberExpireAt || u.memberExpireAt.getTime() >= Date.now()) {
      return 'ACTIVE';
    }
    return 'EXPIRED';
  }

  /** 导出/海报水印策略（以当前用户会员态为准）。 */
  exportPolicyOf(user: User): ExportPolicy {
    if (this.computeStatus(user) === 'ACTIVE') {
      return {
        watermark: false,
        watermarkText: null,
        maxResolution: 1080,
      };
    }
    return {
      watermark: true,
      watermarkText: WATERMARK_TEXT_FREE,
      maxResolution: 720,
    };
  }
}
