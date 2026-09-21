import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import {
  ACTIVE_BADGE_KEYS,
  LEVELS,
  calculateGrowth,
  calculateLevel,
  evaluateBadges,
  journeyXp,
  levelOverview,
  JourneyMetrics,
  GlobalMetrics,
} from '../src/modules/progress/progress.rules';
import { beijingDateTime } from '../src/common/progress-sql';

const journey = (patch: Partial<JourneyMetrics> = {}): JourneyMetrics => ({
  completed: 0,
  recordCount: 0,
  locatedRecordCount: 0,
  photoCount: 0,
  voiceSeconds: 0,
  voiceCount: 0,
  textCount: 0,
  guideCount: 0,
  longestStreak: 0,
  annualCompleted: 0,
  ...patch,
});
const global: GlobalMetrics = {
  cityCount: 0,
  dawnRecordCount: 0,
  dawnRecordDays: 0,
  placeTypeCount: 0,
  registeredRank: 1001,
};

test('新用户与单日首旅画像 153 XP', () => {
  assert.equal(calculateGrowth([], global).xp, 0);
  const growth = calculateGrowth(
    [
      journey({
        completed: 1,
        recordCount: 8,
        locatedRecordCount: 8,
        photoCount: 10,
        longestStreak: 1,
      }),
    ],
    { ...global, cityCount: 1 },
  );
  assert.equal(growth.xp, 153);
  assert.equal(calculateLevel(growth.xp, 1), 2);
});

test('定位与非定位互斥，合计 300 XP；封顶按旅程而非全局', () => {
  assert.equal(
    journeyXp(journey({ recordCount: 2, locatedRecordCount: 1 })).records,
    9,
  );
  assert.equal(
    journeyXp(journey({ recordCount: 50, locatedRecordCount: 49 })).records,
    297,
  );
  const row = journey({ recordCount: 100, locatedRecordCount: 50 });
  assert.equal(journeyXp(row).records, 300);
  assert.equal(calculateGrowth([row, row], global).xp, 600);
});

test('照片、语音与连续天数封顶及取整', () => {
  for (const [count, score] of [
    [59, 118],
    [60, 120],
    [61, 120],
  ])
    assert.equal(journeyXp(journey({ photoCount: count })).photos, score);
  for (const [seconds, score] of [
    [0, 0],
    [9, 0],
    [10, 1],
    [119, 11],
    [120, 12],
    [121, 12],
  ])
    assert.equal(journeyXp(journey({ voiceSeconds: seconds })).voice, score);
  for (const [days, score] of [
    [0, 0],
    [1, 0],
    [2, 8],
    [3, 12],
    [30, 120],
    [31, 120],
  ])
    assert.equal(journeyXp(journey({ longestStreak: days })).streak, score);
});

test('所有等级边界、双门槛、历史等级不降级', () => {
  for (const level of LEVELS.slice(1)) {
    assert.equal(calculateLevel(level.xp - 1, 100), level.level - 1);
    assert.equal(calculateLevel(level.xp, 100), level.level);
  }
  assert.equal(calculateLevel(3200, 9), 4);
  assert.equal(calculateLevel(3200, 10), 5);
  assert.equal(calculateLevel(8000, 17), 5);
  assert.equal(calculateLevel(8000, 18), 6);
  assert.equal(calculateLevel(99999, ACTIVE_BADGE_KEYS.length), 4);
  assert.equal(calculateLevel(0, 0, 6), 6);
});

test('等级进度、缺徽章提示及满级边界', () => {
  const middle = levelOverview(2, 285, 2);
  assert.equal(middle.levelProgress, 0.5);
  assert.equal(middle.remainingXp, 165);
  const blocked = levelOverview(4, 8000, 9);
  assert.equal(blocked.levelProgress, 1);
  assert.equal(blocked.remainingBadges, 1);
  assert.equal(blocked.remainingXp, 0);
  const max = levelOverview(6, 9000, 18);
  assert.equal(max.nextLevel, null);
  assert.equal(max.nextLevelXp, null);
  assert.equal(max.remainingXp, 0);
});

test('9 枚成就逐项边界和复合条件', () => {
  const baseline = calculateGrowth([], global).metrics;
  const rules = [
    ['first-trip', 'completedJourneyCount', 1],
    ['perfect-ten', 'completedJourneyCount', 10],
    ['half-hundred', 'completedJourneyCount', 50],
    ['city-hopper', 'cityCount', 10],
    ['mountain-sea', 'placeTypeCount', 3],
    ['explorer-2026', 'annualCompleted', 1],
  ] as const;
  for (const [key, metric, target] of rules) {
    assert.equal(
      evaluateBadges({ ...baseline, [metric]: target - 1 }).find(
        (b) => b.key === key,
      )!.earned,
      false,
    );
    assert.equal(
      evaluateBadges({ ...baseline, [metric]: target }).find(
        (b) => b.key === key,
      )!.earned,
      true,
    );
  }
  const dawn = (count: number, days: number) =>
    evaluateBadges({
      ...baseline,
      dawnRecordCount: count,
      dawnRecordDays: days,
    }).find((b) => b.key === 'sun-chaser')!;
  assert.equal(dawn(5, 2).earned, false);
  assert.equal(dawn(4, 3).earned, false);
  assert.equal(dawn(5, 3).earned, true);
  assert.equal(dawn(5, 2).requirements.length, 2);
  for (const [rank, earned] of [
    [1000, true],
    [1001, false],
    [0, false],
  ] as const) {
    assert.equal(
      evaluateBadges({ ...baseline, registeredRank: rank }).find(
        (b) => b.key === 'founder',
      )!.earned,
      earned,
    );
  }
});

test('旅程织者必须在同一旅程含图文声', () => {
  const split = calculateGrowth(
    [journey({ textCount: 1 }), journey({ photoCount: 1, voiceCount: 1 })],
    global,
  );
  assert.equal(split.metrics.hasTextAndMediaInOneJourney, false);
  const same = calculateGrowth(
    [journey({ textCount: 1, photoCount: 1, voiceCount: 1 })],
    global,
  );
  assert.equal(
    evaluateBadges(same.metrics).find((b) => b.key === 'weaver')!.earned,
    true,
  );
});

test('北京时间跨日与跨年', () => {
  assert.equal(
    beijingDateTime(new Date('2026-12-31T16:00:00Z')),
    '2027-01-01 00:00:00',
  );
});

test('前端可见徽章 key 与服务端启用列表一致（忽略已注释定义）', () => {
  const path = resolve(__dirname, '../../mini/src/pages/BadgeWall/badges.ts');
  const file = ts.createSourceFile(
    path,
    readFileSync(path, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const keys: string[] = [];
  function visit(node: ts.Node) {
    if (
      ts.isPropertyAssignment(node) &&
      node.name.getText(file) === 'key' &&
      ts.isStringLiteral(node.initializer)
    )
      keys.push(node.initializer.text);
    ts.forEachChild(node, visit);
  }
  visit(file);
  assert.deepEqual(
    keys.sort(),
    [...LEVELS.map((l) => l.key), ...ACTIVE_BADGE_KEYS].sort(),
  );
});
