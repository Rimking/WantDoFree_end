/**
 * 游记工作台阶段（产品名「游记」= Guide 产出物 + 分享态）
 * 已取消「最少记录数」门槛：0 条记录也可生成/预览游记，故恒为 0；
 * 相应地 phase 不再出现 need_more。
 */
export const HANDBOOK_MIN_RECORDS = 0;

export const HANDBOOK_PHASES = ['ready', 'generated', 'shared'] as const;

export type HandbookPhase = (typeof HANDBOOK_PHASES)[number];

export const GUIDE_TEMPLATE_IDS = [
  'basic',
  'T1',
  'T2',
  'T3',
  'T4',
  'T5',
  'T6',
] as const;

export type GuideTemplateId = (typeof GUIDE_TEMPLATE_IDS)[number];

export function normalizeGuideTemplateId(
  raw?: string | null,
): GuideTemplateId {
  if (!raw) return 'basic';
  const t = String(raw).trim();
  if ((GUIDE_TEMPLATE_IDS as readonly string[]).includes(t)) {
    return t as GuideTemplateId;
  }
  // 兼容旧别名
  const lower = t.toLowerCase();
  if (lower === 'basic' || lower === 'default') return 'basic';
  return 'basic';
}

export function resolveHandbookPhase(input: {
  hasGuide: boolean;
  hasShared: boolean;
}): HandbookPhase {
  if (!input.hasGuide) return 'ready';
  if (!input.hasShared) return 'generated';
  return 'shared';
}
