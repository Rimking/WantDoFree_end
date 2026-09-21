/** 前后端统一的英文 key 目录；写入时兼容中文别名，读出一律英文 key。 */

export const JOURNEY_STATUSES = ['planned', 'ongoing', 'finished'] as const;
export type JourneyStatus = (typeof JOURNEY_STATUSES)[number];

const STATUS_ALIASES: Record<string, JourneyStatus> = {
  planned: 'planned',
  planning: 'planned',
  ongoing: 'ongoing',
  finished: 'finished',
  ended: 'finished',
};

export function normalizeStatus(raw: string): JourneyStatus | null {
  return STATUS_ALIASES[raw] ?? null;
}

export const EXPENSE_CATEGORIES = [
  'food',
  'stay',
  'transport',
  'ticket',
  'shopping',
  'other',
] as const;

const EXPENSE_ALIASES: Record<string, (typeof EXPENSE_CATEGORIES)[number]> = {
  food: 'food',
  stay: 'stay',
  hotel: 'stay',
  transport: 'transport',
  ticket: 'ticket',
  shopping: 'shopping',
  other: 'other',
  餐饮: 'food',
  住宿: 'stay',
  交通: 'transport',
  门票: 'ticket',
  购物: 'shopping',
  其他: 'other',
};

export function normalizeExpenseCategory(raw: string): string | null {
  return EXPENSE_ALIASES[raw] ?? null;
}

export const SHARE_CHANNELS = [
  'friend',
  'moments',
  'image',
  'view',
  'link',
  'poster',
] as const;
export type ShareChannel = (typeof SHARE_CHANNELS)[number];

const SHARE_ALIASES: Record<string, ShareChannel> = {
  friend: 'friend',
  moments: 'moments',
  timeline: 'moments',
  image: 'image',
  view: 'view',
  link: 'link',
  poster: 'poster',
};

export function normalizeShareChannel(raw: string): ShareChannel | null {
  return SHARE_ALIASES[raw] ?? null;
}

export const ENTRY_TYPES = [
  'text',
  'photo',
  'voice',
  'location',
  'expense',
] as const;

export type EntryType = (typeof ENTRY_TYPES)[number];

export function inferRecordType(input: {
  type?: string;
  content?: string;
  media?: Array<{ kind?: string }>;
  url?: string;
  kind?: string;
  location?: unknown;
  expense?: unknown;
  expenses?: unknown[] | null;
  voice?: unknown;
  voices?: unknown[] | null;
  audios?: unknown[] | null;
}): EntryType {
  if (input.type && (ENTRY_TYPES as readonly string[]).includes(input.type)) {
    return input.type as EntryType;
  }
  const media = input.media ?? [];
  const hasPhoto =
    media.some(
      (m) => m.kind === 'photo' || m.kind === 'image',
    ) ||
    input.kind === 'photo' ||
    input.kind === 'image' ||
    Boolean(input.url && (input.kind === 'photo' || input.kind === 'image'));
  const hasVoice =
    media.some(
      (m) => m.kind === 'voice' || m.kind === 'audio',
    ) ||
    input.kind === 'voice' ||
    input.kind === 'audio' ||
    Boolean(input.voice) ||
    Boolean(input.voices?.length) ||
    Boolean(input.audios?.length) ||
    Boolean(input.url && (input.kind === 'voice' || input.kind === 'audio'));
  const hasLoc = Boolean(input.location);
  const hasExp =
    Boolean(input.expense) ||
    Boolean(input.expenses && input.expenses.length > 0);
  const hasText = Boolean(input.content?.trim());

  if (hasPhoto) return 'photo';
  if (hasVoice) return 'voice';
  if (hasLoc && !hasText && !hasExp) return 'location';
  if (hasExp && !hasText && !hasLoc && !hasPhoto && !hasVoice) return 'expense';
  if (hasText) return 'text';
  if (hasLoc) return 'location';
  if (hasExp) return 'expense';
  return 'text';
}

/** 与前端 DEMO 默认清单文案一致 */
export const DEFAULT_PLAN_CHECKS = [
  { clientId: 'default-passport', text: '护照 / 签证', done: false },
  { clientId: 'default-flight', text: '机票', done: false },
  { clientId: 'default-hotel', text: '酒店预订', done: false },
  { clientId: 'default-fx', text: '换汇 / 流量卡', done: false },
];
