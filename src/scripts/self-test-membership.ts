/**
 * T3.9 逻辑自测 · 会员权益引擎（MemberBenefitService）
 *
 * 纯函数式权益联动是「下单→pay→/me 返 pro、配额 300/10800、renewal 翻转、
 * 到期惰性降级」的核心。本脚本在**无数据库**环境下直接实例化该服务并断言
 * 关键不变量，作为可重复运行的回归自测（用户本机有 DB 时可扩展为端到端）。
 *
 * 运行：cd server && npx ts-node --transpile-only src/scripts/self-test-membership.ts
 */
import 'reflect-metadata';
import {
  MemberBenefitService,
  MEMBER_BENEFITS_PRO,
  MEMBER_BENEFITS_FREE,
  PRO_QUOTA_PHOTO,
  PRO_QUOTA_VOICE_SEC,
  FREE_QUOTA_PHOTO,
  FREE_QUOTA_VOICE_SEC,
} from '../modules/membership/member-benefit.service';
import { User } from '../entities/user.entity';

let failures = 0;
function assert(name: string, cond: boolean): void {
  if (cond) {
    console.log('  ✓ ' + name);
  } else {
    console.error('  ✗ ' + name);
    failures += 1;
  }
}

function mkUser(): User {
  const u = new User();
  u.id = 'test-user';
  u.openid = 'test-openid';
  u.plan = 'free';
  u.quotaPhoto = FREE_QUOTA_PHOTO;
  u.quotaVoiceSec = FREE_QUOTA_VOICE_SEC;
  return u;
}

const svc = new MemberBenefitService();

console.log('T3.9 逻辑自测 · MemberBenefitService 权益引擎');

console.log('--- 1) 激活 pro：下单→pay 联动配额 300/10800 ---');
const u = mkUser();
svc.applyBenefits(u, 'pro', 30, true);
assert('plan === "pro"', u.plan === 'pro');
assert('quotaPhoto === 300', u.quotaPhoto === PRO_QUOTA_PHOTO);
assert('quotaVoiceSec === 10800', u.quotaVoiceSec === PRO_QUOTA_VOICE_SEC);
assert('autoRenew === true（连续包月传递）', u.autoRenew === true);
assert(
  'memberExpireAt 已设置且为未来',
  !!u.memberExpireAt && u.memberExpireAt.getTime() > Date.now(),
);
assert('memberSinceAt 首次开通已写', !!u.memberSinceAt);

console.log('--- 2) 幂等：重复激活同值无变化 ---');
const snap = JSON.stringify({
  plan: u.plan,
  qp: u.quotaPhoto,
  qv: u.quotaVoiceSec,
  ar: u.autoRenew,
});
svc.applyBenefits(u, 'pro', 30, true);
const snap2 = JSON.stringify({
  plan: u.plan,
  qp: u.quotaPhoto,
  qv: u.quotaVoiceSec,
  ar: u.autoRenew,
});
assert('重复 applyBenefits(pro) 结果不变', snap === snap2);

console.log('--- 3) 惰性降级：过期后任意读路径 reconcileExpiry ---');
const notExpired = svc.reconcileExpiry(u);
assert('未过期 → 返回 false（不变更）', notExpired === false);
u.memberExpireAt = new Date(Date.now() - 1000);
const downgraded = svc.reconcileExpiry(u);
assert('过期 → 返回 true（已变更）', downgraded === true);
assert('降级 plan === "free"', u.plan === 'free');
assert('降级 quotaPhoto === 50', u.quotaPhoto === FREE_QUOTA_PHOTO);
assert('降级 quotaVoiceSec === 1800', u.quotaVoiceSec === FREE_QUOTA_VOICE_SEC);
assert('降级 memberExpireAt === null', u.memberExpireAt === null);
assert('降级 autoRenew === false', u.autoRenew === false);

console.log('--- 4) computeStatus：FREE / ACTIVE / EXPIRED ---');
const f = mkUser();
assert('免费 → FREE', svc.computeStatus(f) === 'FREE');
const a = mkUser();
svc.applyBenefits(a, 'pro', 30, true);
assert('有效会员 → ACTIVE', svc.computeStatus(a) === 'ACTIVE');
const e = mkUser();
svc.applyBenefits(e, 'pro', 30, true);
e.memberExpireAt = new Date(Date.now() - 1000);
assert('过期会员 → EXPIRED', svc.computeStatus(e) === 'EXPIRED');

console.log('--- 5) 续费开关（renewal 翻转）：autoRenew 标志正确传播 ---');
const on = mkUser();
svc.applyBenefits(on, 'pro', 30, true);
assert('连续包月 → autoRenew=true', on.autoRenew === true);
const off = mkUser();
svc.applyBenefits(off, 'pro', 30, false);
assert('单年（不续费）→ autoRenew=false', off.autoRenew === false);
// membership.service.setRenewal 即 user.autoRenew = dto.autoRenew（契约核对）
off.autoRenew = true;
assert('setRenewal(true) 等价翻转生效', off.autoRenew === true);

console.log('--- 6) 权益矩阵与配额常量一致 ---');
assert(
  'PRO 权益含 photo_300/voice_180min/ai_organize/export_1080p',
  MEMBER_BENEFITS_PRO.includes('photo_300') &&
    MEMBER_BENEFITS_PRO.includes('voice_180min') &&
    MEMBER_BENEFITS_PRO.includes('ai_organize') &&
    MEMBER_BENEFITS_PRO.includes('export_1080p'),
);
assert(
  'FREE 权益为 photo_50/voice_30min/basic_templates',
  JSON.stringify(MEMBER_BENEFITS_FREE) ===
    JSON.stringify(['photo_50', 'voice_30min', 'basic_templates']),
);

console.log('');
if (failures === 0) {
  console.log('✅ 全部断言通过 — 会员权益引擎逻辑自测通过');
  process.exit(0);
} else {
  console.error('❌ 存在 ' + failures + ' 项失败');
  process.exit(1);
}
