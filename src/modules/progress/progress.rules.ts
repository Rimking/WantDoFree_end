/** 成长规则唯一来源；不依赖数据库，便于验证边界。 */
export const LEVELS = [
  { level: 1, key: 'sprout', name: '新芽旅人', xp: 0, badges: 0 },
  { level: 2, key: 'explorer', name: '探索者', xp: 120, badges: 0 },
  { level: 3, key: 'trekker', name: '远行者', xp: 450, badges: 0 },
  { level: 4, key: 'balloon', name: '漫游家', xp: 1300, badges: 0 },
  { level: 5, key: 'globe', name: '环球旅行家', xp: 3200, badges: 10 },
  { level: 6, key: 'legend', name: '传奇旅行家', xp: 8000, badges: 18 },
] as const;

export const XP = {
  completed: 60,
  located: 6,
  unlocated: 3,
  recordCap: 300,
  photo: 2,
  photoCap: 60,
  voiceStep: 10,
  voiceCap: 120,
  guide: 40,
  city: 25,
  streak: 4,
  streakCap: 30,
} as const;
export const ANNUAL_BADGES = [{ key: 'explorer-2026', year: 2026 }] as const;
export const PLACE_TYPES = ['山', '海', '湖', '河', '峰', '岛'] as const;

export interface JourneyMetrics {
  completed: number;
  recordCount: number;
  locatedRecordCount: number;
  photoCount: number;
  voiceSeconds: number;
  voiceCount: number;
  textCount: number;
  guideCount: number;
  longestStreak: number;
  annualCompleted: number;
}
export interface GlobalMetrics {
  cityCount: number;
  dawnRecordCount: number;
  dawnRecordDays: number;
  placeTypeCount: number;
  registeredRank: number;
}
export interface ProgressMetrics extends GlobalMetrics {
  journeyCount: number;
  completedJourneyCount: number;
  recordCount: number;
  locatedRecordCount: number;
  photoCount: number;
  voiceSeconds: number;
  guideCount: number;
  longestStreak: number;
  annualCompleted: number;
  hasTextAndMediaInOneJourney: boolean;
}
export interface Requirement {
  metric: string;
  current: number;
  target: number;
  unit: string;
}
export interface BadgeEvaluation {
  key: string;
  description: string;
  earned: boolean;
  progress: Requirement;
  requirements: Requirement[];
}
const amount = (n: number) =>
  Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;

export function journeyXp(row: JourneyMetrics) {
  const located = Math.min(
    amount(row.locatedRecordCount),
    amount(row.recordCount),
  );
  return {
    completed: amount(row.completed) * XP.completed,
    records: Math.min(
      XP.recordCap,
      located * XP.located + (amount(row.recordCount) - located) * XP.unlocated,
    ),
    photos: Math.min(amount(row.photoCount), XP.photoCap) * XP.photo,
    voice: Math.floor(
      Math.min(amount(row.voiceSeconds), XP.voiceCap) / XP.voiceStep,
    ),
    guides: amount(row.guideCount) * XP.guide,
    streak:
      row.longestStreak >= 2
        ? Math.min(amount(row.longestStreak), XP.streakCap) * XP.streak
        : 0,
  };
}

export function calculateGrowth(rows: JourneyMetrics[], global: GlobalMetrics) {
  const metrics: ProgressMetrics = {
    ...global,
    journeyCount: rows.length,
    completedJourneyCount: 0,
    recordCount: 0,
    locatedRecordCount: 0,
    photoCount: 0,
    voiceSeconds: 0,
    guideCount: 0,
    longestStreak: 0,
    annualCompleted: 0,
    hasTextAndMediaInOneJourney: false,
  };
  const totals = {
    completed: 0,
    records: 0,
    photos: 0,
    voice: 0,
    guides: 0,
    streak: 0,
    cities: amount(global.cityCount) * XP.city,
  };
  for (const row of rows) {
    const score = journeyXp(row);
    for (const key of Object.keys(score) as Array<keyof typeof score>)
      totals[key] += score[key];
    metrics.completedJourneyCount += amount(row.completed);
    for (const key of [
      'recordCount',
      'locatedRecordCount',
      'photoCount',
      'voiceSeconds',
      'guideCount',
      'annualCompleted',
    ] as const)
      metrics[key] += amount(row[key]);
    metrics.longestStreak = Math.max(
      metrics.longestStreak,
      amount(row.longestStreak),
    );
    metrics.hasTextAndMediaInOneJourney ||=
      row.textCount > 0 && row.photoCount > 0 && row.voiceCount > 0;
  }
  const rules = {
    completed: ['完成旅程', '完成一段旅程 +60 XP'],
    records: ['旅行记录', '定位记录 +6，无定位 +3；每旅程合计最多 300 XP'],
    photos: ['旅途照片', '每张 +2 XP，每旅程最多 60 张'],
    voice: ['旅途语音', '每旅程总时长每完整 10 秒 +1 XP，最多 120 秒'],
    guides: ['生成游记', '每篇 +40 XP，同旅程重新生成不重复加分'],
    cities: ['城市足迹', '每个不同记录归属城市 +25 XP'],
    streak: [
      '连续记录',
      '每旅程历史最长连续段，至少 2 天，每天 +4 XP，最多 30 天',
    ],
  };
  const xpBreakdown = (Object.keys(totals) as Array<keyof typeof totals>).map(
    (key) => ({
      key,
      label: rules[key][0],
      rule: rules[key][1],
      xp: totals[key],
    }),
  );
  return {
    xp: xpBreakdown.reduce((sum, item) => sum + item.xp, 0),
    xpBreakdown,
    metrics,
  };
}

export const ACTIVE_BADGE_KEYS = [
  'first-trip',
  'perfect-ten',
  'half-hundred',
  'city-hopper',
  'mountain-sea',
  'weaver',
  'sun-chaser',
  ...ANNUAL_BADGES.map((b) => b.key),
  'founder',
];
// 暂不启用省份、天气和整个互动里程碑；恢复时须同时恢复前端定义与对应指标。
export function evaluateBadges(m: ProgressMetrics): BadgeEvaluation[] {
  const requirement = (
    metric: string,
    current: number,
    target: number,
    unit: string,
  ): Requirement => ({ metric, current: amount(current), target, unit });
  const badge = (
    key: string,
    description: string,
    requirements: Requirement[],
  ): BadgeEvaluation => ({
    key,
    description,
    requirements,
    progress: requirements[0],
    earned: requirements.every((r) => r.current >= r.target),
  });
  return [
    badge('first-trip', '完成 1 段旅程', [
      requirement(
        'completedJourneyCount',
        m.completedJourneyCount,
        1,
        '段旅程',
      ),
    ]),
    badge('perfect-ten', '完成 10 段旅程', [
      requirement(
        'completedJourneyCount',
        m.completedJourneyCount,
        10,
        '段旅程',
      ),
    ]),
    badge('half-hundred', '完成 50 段旅程', [
      requirement(
        'completedJourneyCount',
        m.completedJourneyCount,
        50,
        '段旅程',
      ),
    ]),
    badge('city-hopper', '记录归属城市达到 10 个', [
      requirement('cityCount', m.cityCount, 10, '座城市'),
    ]),
    badge('mountain-sea', '定位地点名覆盖山/海/湖/河/峰/岛中的 3 类', [
      requirement('placeTypeCount', m.placeTypeCount, 3, '类地点'),
    ]),
    badge('weaver', '同一旅程内图文声俱全', [
      requirement(
        'hasTextAndMediaInOneJourney',
        Number(m.hasTextAndMediaInOneJourney),
        1,
        '段旅程',
      ),
    ]),
    badge('sun-chaser', '05:00—07:30 记录至少 5 条，且跨至少 3 天', [
      requirement('dawnRecordCount', m.dawnRecordCount, 5, '条记录'),
      requirement('dawnRecordDays', m.dawnRecordDays, 3, '天'),
    ]),
    ...ANNUAL_BADGES.map(({ key, year }) =>
      badge(key, `完成一段结束日期在 ${year} 年的旅程`, [
        requirement('annualCompleted', m.annualCompleted, 1, '段旅程'),
      ]),
    ),
    badge('founder', '前 1000 名注册用户', [
      requirement(
        'founder',
        Number(m.registeredRank > 0 && m.registeredRank <= 1000),
        1,
        '项条件',
      ),
    ]),
  ];
}

export function calculateLevel(
  highestXp: number,
  badgeCount: number,
  previousLevel = 1,
) {
  let level = Math.max(1, Math.min(6, previousLevel));
  for (const definition of LEVELS) {
    if (highestXp >= definition.xp && badgeCount >= definition.badges)
      level = Math.max(level, definition.level);
  }
  return level;
}

export function levelOverview(
  level: number,
  highestXp: number,
  badgeCount: number,
) {
  const current = LEVELS[level - 1];
  const next = LEVELS[level];
  return {
    level,
    levelName: current.name,
    nextLevel: next?.level ?? null,
    nextLevelName: next?.name ?? null,
    nextLevelXp: next?.xp ?? null,
    remainingXp: next ? Math.max(0, next.xp - highestXp) : 0,
    levelProgress: next
      ? Math.max(
          0,
          Math.min(1, (highestXp - current.xp) / (next.xp - current.xp)),
        )
      : 1,
    badgeCount,
    nextLevelBadgeCount: next?.badges ?? null,
    remainingBadges: next ? Math.max(0, next.badges - badgeCount) : 0,
    levelBadges: LEVELS.map((item) => ({
      key: item.key,
      level: item.level,
      name: item.name,
      unlocked: level >= item.level,
      description:
        item.level === 1
          ? '注册即可获得'
          : `${item.xp} XP${item.badges ? `，并解锁 ${item.badges} 枚成就徽章` : ''}`,
    })),
  };
}
