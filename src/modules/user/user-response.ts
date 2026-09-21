import { formatDateTime } from '../../common/datetime.util';
import { maskPhone } from './profile.catalog';
import { User } from '../../entities/user.entity';

export function memberLevelOf(plan: string) {
  return plan === 'pro' ? 'PRO' : 'FREE';
}

/**
 * 用户响应白名单序列化（/me、登录响应共用）。
 * 禁止 `...u` 展开：User 实体含 openid/unionid/phone 明文与 role/status 等
 * 内部字段，历史上曾被整包返回给前端（安全审计项）。前端需要新字段时在此显式补充。
 */
export function toUserResponse(
  u: User,
  extra?: {
    footprintCities?: number;
    tripCount?: number;
  },
) {
  const base = {
    id: u.id,
    nick: u.nick ?? null,
    nickname: u.nick ?? null,
    avatar: u.avatar ?? null,
    avatarUrl: u.avatar ?? null,
    gender: u.gender ?? 'FEMALE',
    bio: u.bio ?? null,
    phoneMasked: maskPhone(u.phone),
    plan: u.plan,
    memberLevel: memberLevelOf(u.plan),
    memberExpireAt: u.memberExpireAt ?? null,
    memberSinceAt: u.memberSinceAt ?? null,
    autoRenew: u.autoRenew,
    quotaPhoto: u.quotaPhoto,
    usedPhoto: u.usedPhoto,
    quotaVoiceSec: u.quotaVoiceSec,
    usedVoiceSec: u.usedVoiceSec,
    createdAt: formatDateTime(u.createdAt),
    updatedAt: formatDateTime(u.updatedAt),
  };
  if (!extra) return base;
  return {
    ...base,
    stats: {
      footprintCities: extra.footprintCities ?? 0,
      tripCount: extra.tripCount ?? 0,
    },
  };
}
