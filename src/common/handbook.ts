/** 游记工作台阶段（产品名「游记」= Guide 产出物 + 分享态） */
export const HANDBOOK_MIN_RECORDS = 3;

export const HANDBOOK_PHASES = [
  'need_more',
  'ready',
  'generated',
  'shared',
] as const;

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
  recordCount: number;
  hasGuide: boolean;
  hasShared: boolean;
  minRecords?: number;
}): HandbookPhase {
  const min = input.minRecords ?? HANDBOOK_MIN_RECORDS;
  if (input.recordCount < min) return 'need_more';
  if (!input.hasGuide) return 'ready';
  if (!input.hasShared) return 'generated';
  return 'shared';
}
