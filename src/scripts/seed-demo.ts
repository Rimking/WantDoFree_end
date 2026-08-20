/**
 * 完整联调种子：旅程 ↔ 计划 ↔ 时间线(图文/定位/花费/语音) ↔ 攻略 ↔ 分享
 * 关联按真实业务链写入，时间按旅程日期递进。
 *
 *   npm run seed:demo
 *
 * 登录：POST /dream/v1/auth/wechat-login  {"code":"dev_openid_demo"}
 */
import 'reflect-metadata';
import { DataSource, In } from 'typeorm';
import { config as loadEnv } from 'dotenv';
import { User } from '../entities/user.entity';
import { Journey } from '../entities/journey.entity';
import { JourneyPlan } from '../entities/journey-plan.entity';
import { Entry } from '../entities/entry.entity';
import { Location } from '../entities/location.entity';
import { Expense } from '../entities/expense.entity';
import { Media } from '../entities/media.entity';
import { Guide } from '../entities/guide.entity';
import { ShareEvent } from '../entities/share-event.entity';
import { YearBudget } from '../entities/year-budget.entity';
import { Draft } from '../entities/draft.entity';
import { Order } from '../entities/order.entity';
import { TravelIdentityDict } from '../entities/travel-identity-dict.entity';
import { UserIdentity } from '../entities/user-identity.entity';
import { ChecklistItem } from '../entities/checklist-item.entity';
import { UserStatsSnapshot } from '../entities/user-stats-snapshot.entity';
import { MemberPlan } from '../entities/member-plan.entity';
import {
  normalizeExpenseCategory,
  themeLabelOf,
} from '../common/enums/catalog';

loadEnv();

const USER_ID = 'aaaaaaaa-1111-1111-1111-111111111111';
/** 演示用户已绑定真机 openid；本地仍可用 code=dev_openid_demo 登录 */
const OPENID =
  process.env.DEMO_USER_OPENID || 'oGSAD5cLUWt4wvvHh7G1gyQpyIFE';

const J = {
  /** 即将出发 */
  xiamen: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0001',
  /** 进行中（时间线最全） */
  hangzhou: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0002',
  /** 已完成 · 徒步 */
  zhangjiajie: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0003',
  /** 已完成 · 慢生活 */
  dali: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0004',
  /** 规划中（出发日 > 今天+3） */
  sanya: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0005',
} as const;

function ymdPlus(days: number) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const G = {
  hangzhou: 'dddddddd-dddd-dddd-dddd-dddddddd0002',
  zhangjiajie: 'dddddddd-dddd-dddd-dddd-dddddddd0003',
  dali: 'dddddddd-dddd-dddd-dddd-dddddddd0004',
} as const;

let seq = 0;
const eid = () => {
  seq += 1;
  return `cccccccc-cccc-cccc-cccc-${String(seq).padStart(12, '0')}`;
};

type SeedEntry = {
  clientId: string;
  journeyId: string;
  type: string;
  content?: string;
  /** 与旅程 startDate 对齐的本地时间 */
  at: string;
  location?: { lat: number; lng: number; name: string };
  expense?: { amountCent: number; category: string; note?: string };
  photos?: string[];
  voice?: { url: string; durationSec: number; size?: number };
};

/** 封面图（已校验可访问；失效图勿再用 photo-1474181487882 / photo-1483728642387） */
const IMG = {
  westlake:
    'https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=800&q=70',
  temple:
    'https://images.unsplash.com/photo-1478436127897-769e1b3f0f36?auto=format&fit=crop&w=800&q=70',
  food:
    'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=70',
  mountain:
    'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=800&q=70',
  waterfall:
    'https://images.unsplash.com/photo-1432405972618-c60b0225b8f9?auto=format&fit=crop&w=800&q=70',
  cliff:
    'https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=800&q=70',
  dali:
    'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800&q=70',
  town:
    'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&w=800&q=70',
  gulangyu:
    'https://images.unsplash.com/photo-1508009603885-50cf7c579365?auto=format&fit=crop&w=800&q=70',
  beach:
    'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800&q=70',
  market:
    'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=800&q=70',
};

/** 国内准备清单（无护照/签证） */
const DOMESTIC_CHECKS = (done: [boolean, boolean, boolean, boolean]) => [
  { clientId: 'c1', text: '身份证 / 证件', done: done[0] },
  { clientId: 'c2', text: '高铁票 / 机票', done: done[1] },
  { clientId: 'c3', text: '酒店预订', done: done[2] },
  { clientId: 'c4', text: '流量卡 / 充电宝', done: done[3] },
];

const VOICE =
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';

function nightsBetween(start: string, end: string) {
  const s = new Date(start);
  const e = new Date(end);
  const days = Math.floor((e.getTime() - s.getTime()) / 86400000) + 1;
  return { days: Math.max(1, days), nights: Math.max(0, days - 1) };
}

async function main() {
  const ds = new DataSource({
    type: 'mysql',
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    username: process.env.DB_USERNAME || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || 'tuji',
    charset: 'utf8mb4',
    timezone: '+08:00',
    entities: [
      User,
      Journey,
      JourneyPlan,
      Entry,
      Location,
      Expense,
      Media,
      Guide,
      ShareEvent,
      YearBudget,
      Draft,
      Order,
      TravelIdentityDict,
      UserIdentity,
      ChecklistItem,
      UserStatsSnapshot,
      MemberPlan,
    ],
    synchronize: true,
  });
  await ds.initialize();
  console.log('✓ DB connected + schema synced');

  await wipeDemo(ds);
  await seedUser(ds);
  await seedMemberPlans(ds);
  const ctx = repos(ds);

  await seedJourneys(ctx);
  await seedPlans(ctx);
  await seedChecklist(ctx);
  const entryMap = await seedEntries(ctx, buildAllEntries());
  console.log(`✓ ${entryMap.size} entries with children`);

  await seedGuidesFromDb(ctx);
  await seedShares(ctx);
  await seedBudgetsDraftsOrders(ctx);

  await printSummary(ds);
  await ds.destroy();
}

async function wipeDemo(ds: DataSource) {
  const rows: { id: string }[] = await ds.query(
    `SELECT id FROM journeys WHERE userId = ? OR id IN (?, ?, ?, ?, ?, ?, ?)`,
    [
      USER_ID,
      J.xiamen,
      J.hangzhou,
      J.zhangjiajie,
      J.dali,
      J.sanya,
      'bbbbbbbb-1111-1111-1111-111111111111',
      'bbbbbbbb-2222-2222-2222-222222222222',
    ],
  );
  const jids = [...new Set(rows.map((r) => r.id))];
  if (jids.length) {
    const ph = jids.map(() => '?').join(',');
    await ds.query(`DELETE FROM share_events WHERE journeyId IN (${ph})`, jids);
    await ds.query(`DELETE FROM guides WHERE journeyId IN (${ph})`, jids);
    await ds.query(
      `DELETE FROM media WHERE ownerType='entry' AND ownerId IN (SELECT id FROM entries WHERE journeyId IN (${ph}))`,
      jids,
    );
    await ds.query(
      `DELETE FROM expenses WHERE entryId IN (SELECT id FROM entries WHERE journeyId IN (${ph}))`,
      jids,
    );
    await ds.query(
      `DELETE FROM locations WHERE entryId IN (SELECT id FROM entries WHERE journeyId IN (${ph}))`,
      jids,
    );
    await ds.query(`DELETE FROM entries WHERE journeyId IN (${ph})`, jids);
    await ds.query(`DELETE FROM journey_plans WHERE journeyId IN (${ph})`, jids);
    await ds.query(`DELETE FROM checklist_items WHERE journeyId IN (${ph})`, jids);
    await ds.query(`DELETE FROM journeys WHERE id IN (${ph})`, jids);
  }
  await ds.query(`DELETE FROM share_events WHERE sharerId = ?`, [USER_ID]);
  await ds.query(`DELETE FROM drafts WHERE userId = ?`, [USER_ID]);
  await ds.query(`DELETE FROM year_budgets WHERE userId = ?`, [USER_ID]);
  await ds.query(`DELETE FROM orders WHERE userId = ?`, [USER_ID]);
  await ds.query(`DELETE FROM users WHERE openid = ? OR id = ?`, [
    OPENID,
    USER_ID,
  ]);
}

async function seedUser(ds: DataSource) {
  await ds.query(
    `INSERT INTO users (
       id, openid, nick, avatar, gender, birthday, provinceCode, cityCode,
       departureCity, bio, phone, plan, quotaPhoto, quotaVoiceSec, usedPhoto, usedVoiceSec,
       createdAt, updatedAt
     ) VALUES (
       ?, ?, '途记演示', ?, 'FEMALE', '1995-08-12', '330000', '330100',
       '杭州萧山', '把每一次出发，都藏进清川。', '13812346621', 'free',
       50, 1800, 18, 48, NOW(6), NOW(6)
     )`,
    [
      USER_ID,
      OPENID,
      'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=200&q=70',
    ],
  );

  // 旅行身份字典 + 演示用户身份
  const identities = [
    ['backpacker', '背包客', 1],
    ['foodie', '美食猎人', 2],
    ['vacationer', '度假党', 3],
    ['photo', '摄影控', 4],
    ['culture', '人文探索', 5],
    ['outdoor', '户外徒步', 6],
    ['family', '亲子同游', 7],
  ];
  for (const [code, name, sort] of identities) {
    await ds.query(
      `INSERT INTO travel_identity_dict (code, name, sort) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE name=VALUES(name), sort=VALUES(sort)`,
      [code, name, sort],
    );
  }
  await ds.query(`DELETE FROM user_identities WHERE userId = ?`, [USER_ID]);
  await ds.query(
    `INSERT INTO user_identities (userId, identityCode) VALUES (?, 'backpacker'), (?, 'foodie')`,
    [USER_ID, USER_ID],
  );
  console.log('✓ user + profile + identities');
}

/** 会员套餐种子（运营配置，幂等 upsert，按 code 去重）。 */
async function seedMemberPlans(ds: DataSource) {
  const repo = ds.getRepository(MemberPlan);
  const plans: Partial<MemberPlan>[] = [
    {
      code: 'monthly',
      name: '连续包月',
      priceCent: 1800, // ¥18/月
      periodDays: 30,
      autoRenew: true,
      originalPriceCent: null,
      firstMonthDiscountCent: 900, // 首月特惠 ¥9
      tag: '首月特惠',
      sort: 1,
      active: true,
    },
    {
      code: 'yearly',
      name: '连续包年',
      priceCent: 12800, // ¥128/年（主推）
      periodDays: 365,
      autoRenew: true,
      originalPriceCent: null,
      firstMonthDiscountCent: null,
      tag: '主推',
      sort: 2,
      active: true,
    },
    {
      code: 'yearly_once',
      name: '单年',
      priceCent: 16800, // ¥168/年
      periodDays: 365,
      autoRenew: false,
      originalPriceCent: null,
      firstMonthDiscountCent: null,
      tag: null,
      sort: 3,
      active: true,
    },
  ];
  for (const p of plans) {
    await repo.upsert(repo.create(p), {
      conflictPaths: ['code'],
      skipUpdateIfNoValuesChanged: true,
    });
  }
  console.log('✓ member_plans（连续包月¥18/首月¥9 · 连续包年¥128主推 · 单年¥168）');
}

function repos(ds: DataSource) {
  return {
    ds,
    journeys: ds.getRepository(Journey),
    plans: ds.getRepository(JourneyPlan),
    entries: ds.getRepository(Entry),
    locations: ds.getRepository(Location),
    expenses: ds.getRepository(Expense),
    media: ds.getRepository(Media),
    guides: ds.getRepository(Guide),
    shares: ds.getRepository(ShareEvent),
    budgets: ds.getRepository(YearBudget),
    drafts: ds.getRepository(Draft),
    orders: ds.getRepository(Order),
    checklist: ds.getRepository(ChecklistItem),
  };
}

type Ctx = ReturnType<typeof repos>;

async function seedJourneys(ctx: Ctx) {
  const rows: Partial<Journey>[] = [
    {
      id: J.xiamen,
      userId: USER_ID,
      clientId: 'j_xiamen',
      title: '厦门鼓浪屿周末',
      origin: '杭州',
      destination: '福建 · 厦门',
      coverUrl: IMG.gulangyu,
      // 即将出发：出发日在今天～今天+3
      startDate: ymdPlus(2),
      endDate: ymdPlus(5),
      status: 'planned',
      themeTags: ['island', 'food', 'city_walk'],
      companions: ['friends'],
      budgetAmount: 350000,
      isPublic: false,
      syncVersion: 2,
    },
    {
      id: J.sanya,
      userId: USER_ID,
      clientId: 'j_sanya',
      title: '三亚亚龙湾度假',
      origin: '上海',
      destination: '海南 · 三亚',
      coverUrl: IMG.beach,
      // 规划中：出发日 > 今天+3
      startDate: ymdPlus(14),
      endDate: ymdPlus(18),
      status: 'planned',
      themeTags: ['island', 'relax'],
      companions: ['couple'],
      budgetAmount: 680000,
      isPublic: false,
      syncVersion: 1,
    },
    {
      id: J.hangzhou,
      userId: USER_ID,
      clientId: 'j_hangzhou',
      title: '杭州西湖 · 桂花季',
      origin: '上海',
      destination: '浙江 · 杭州',
      coverUrl: IMG.westlake,
      startDate: '2025-10-18',
      endDate: '2025-10-25',
      status: 'ongoing',
      themeTags: ['culture', 'city_walk', 'food'],
      companions: ['couple'],
      budgetAmount: 420000,
      isPublic: true,
      syncVersion: 8,
    },
    {
      id: J.zhangjiajie,
      userId: USER_ID,
      clientId: 'j_zhangjiajie',
      title: '张家界武陵源 6 日',
      origin: '长沙',
      destination: '湖南 · 张家界',
      coverUrl: IMG.mountain,
      startDate: '2025-09-02',
      endDate: '2025-09-07',
      status: 'finished',
      themeTags: ['hiking', 'relax'],
      companions: ['friends'],
      budgetAmount: 550000,
      isPublic: false,
      syncVersion: 12,
    },
    {
      id: J.dali,
      userId: USER_ID,
      clientId: 'j_dali',
      title: '大理慢生活',
      origin: '成都',
      destination: '云南 · 大理',
      coverUrl: IMG.dali,
      startDate: '2025-08-11',
      endDate: '2025-08-16',
      status: 'finished',
      themeTags: ['relax', 'food'],
      companions: ['couple', 'pet'],
      budgetAmount: 500000,
      isPublic: false,
      syncVersion: 9,
    },
  ];
  for (const r of rows) await ctx.journeys.save(ctx.journeys.create(r));
  console.log('✓ 5 journeys（国内景点 · planning / departing）');
}

async function seedPlans(ctx: Ctx) {
  await ctx.plans.save(
    ctx.plans.create({
      journeyId: J.xiamen,
      places: [
        {
          clientId: 'xm_p1',
          name: '鼓浪屿',
          note: '坐轮渡过去，逛日光岩',
          coverUrl: IMG.gulangyu,
        },
        {
          clientId: 'xm_p2',
          name: '南普陀寺',
          note: '早上去，避开人潮',
          coverUrl: IMG.temple,
        },
        {
          clientId: 'xm_p3',
          name: '曾厝垵',
          note: '海鲜大排档',
          coverUrl: IMG.market,
        },
      ],
      // 2/4 → planProgress=50
      checks: DOMESTIC_CHECKS([true, true, false, false]),
      budgetEstimate: 350000,
    }),
  );
  await ctx.plans.save(
    ctx.plans.create({
      journeyId: J.sanya,
      places: [
        {
          clientId: 'sy_p1',
          name: '亚龙湾',
          note: '潜水 / 躺沙滩',
          coverUrl: IMG.beach,
        },
        {
          clientId: 'sy_p2',
          name: '天涯海角',
          note: '经典打卡',
        },
      ],
      checks: DOMESTIC_CHECKS([true, false, false, false]),
      budgetEstimate: 680000,
    }),
  );
  await ctx.plans.save(
    ctx.plans.create({
      journeyId: J.hangzhou,
      places: [
        {
          clientId: 'hz_p1',
          name: '断桥残雪',
          note: '清晨人少，拍西湖倒影',
          coverUrl: IMG.westlake,
        },
        {
          clientId: 'hz_p2',
          name: '灵隐寺',
          note: '飞来峰一线天',
          coverUrl: IMG.temple,
        },
        {
          clientId: 'hz_p3',
          name: '雷峰塔',
          note: '傍晚登塔看夕阳',
          coverUrl: IMG.temple,
        },
        {
          clientId: 'hz_p4',
          name: '龙井村',
          note: 'Day4 喝茶',
        },
      ],
      checks: DOMESTIC_CHECKS([true, true, true, true]),
      budgetEstimate: 420000,
    }),
  );
  await ctx.plans.save(
    ctx.plans.create({
      journeyId: J.zhangjiajie,
      places: [
        {
          clientId: 'zj_p1',
          name: '天门山',
          note: '玻璃栈道',
          coverUrl: IMG.cliff,
        },
        {
          clientId: 'zj_p2',
          name: '袁家界',
          note: '阿凡达取景地',
          coverUrl: IMG.mountain,
        },
        {
          clientId: 'zj_p3',
          name: '金鞭溪',
          note: '峡谷徒步',
          coverUrl: IMG.waterfall,
        },
        {
          clientId: 'zj_p4',
          name: '黄石寨',
          note: '看云海',
        },
      ],
      checks: DOMESTIC_CHECKS([true, true, true, true]),
      budgetEstimate: 550000,
    }),
  );
  await ctx.plans.save(
    ctx.plans.create({
      journeyId: J.dali,
      places: [
        { clientId: 'dl_p1', name: '洱海', note: '骑行环湖', coverUrl: IMG.dali },
        { clientId: 'dl_p2', name: '喜洲古镇', note: '小吃', coverUrl: IMG.town },
        { clientId: 'dl_p3', name: '双廊', note: '看日出' },
      ],
      checks: DOMESTIC_CHECKS([true, true, true, true]),
      budgetEstimate: 500000,
    }),
  );
  console.log('✓ plans（国内景点 places + checklist）');
}

/** 国内景点坐标（便于小程序地图预览） */
const POI_COORDS: Record<string, { lat: number; lng: number; address?: string }> = {
  鼓浪屿: { lat: 24.4478, lng: 118.0665, address: '福建省厦门市思明区' },
  南普陀寺: { lat: 24.4412, lng: 118.0925, address: '福建省厦门市思明区' },
  曾厝垵: { lat: 24.4325, lng: 118.1048, address: '福建省厦门市思明区' },
  亚龙湾: { lat: 18.2205, lng: 109.6395, address: '海南省三亚市吉阳区' },
  天涯海角: { lat: 18.2965, lng: 109.3548, address: '海南省三亚市天涯区' },
  断桥残雪: { lat: 30.2588, lng: 120.149, address: '浙江省杭州市西湖区' },
  灵隐寺: { lat: 30.2428, lng: 120.1005, address: '浙江省杭州市西湖区' },
  雷峰塔: { lat: 30.2312, lng: 120.1488, address: '浙江省杭州市西湖区' },
  龙井村: { lat: 30.2195, lng: 120.1165, address: '浙江省杭州市西湖区' },
  天门山: { lat: 29.0505, lng: 110.479, address: '湖南省张家界市永定区' },
  袁家界: { lat: 29.3435, lng: 110.4795, address: '湖南省张家界市武陵源区' },
  金鞭溪: { lat: 29.325, lng: 110.445, address: '湖南省张家界市武陵源区' },
  黄石寨: { lat: 29.35, lng: 110.43, address: '湖南省张家界市武陵源区' },
  洱海: { lat: 25.69, lng: 100.19, address: '云南省大理白族自治州' },
  喜洲古镇: { lat: 25.825, lng: 100.131, address: '云南省大理市喜洲镇' },
  双廊: { lat: 25.909, lng: 100.197, address: '云南省大理市双廊镇' },
};

/** 从 plan JSON 同步 checklist_items 正式表；并回写 plan.places 坐标供地图打点 */
async function seedChecklist(ctx: Ctx) {
  const plans = await ctx.plans.find();
  for (const plan of plans) {
    // 回写 plan.places 坐标（POI 表仅含具体景点，不含城市级无坐标意图）
    for (const p of plan.places ?? []) {
      const poi = POI_COORDS[p.name];
      if (!poi) continue;
      (p as any).lat = poi.lat ?? null;
      (p as any).lng = poi.lng ?? null;
      (p as any).locationName = poi.address ?? p.name;
      (p as any).category = 'SIGHT';
    }
    await ctx.plans.save(plan);
    let cOrder = 0;
    for (const c of plan.checks ?? []) {
      await ctx.checklist.save(
        ctx.checklist.create({
          journeyId: plan.journeyId,
          title: c.text,
          isDefaultChecked: false,
          isChecked: !!c.done,
          remindBeforeDays: null,
          sortOrder: cOrder++,
        }),
      );
    }
  }
  console.log('✓ checklist_items（含 plan 坐标回写）');
}

function buildAllEntries(): SeedEntry[] {
  return [
    // ══════ 杭州西湖 Day1 2025-10-18（进行中，内容最全）══════
    {
      clientId: 'r_hz_d1_photo',
      journeyId: J.hangzhou,
      type: 'photo',
      content: '清晨的断桥没什么人，湖面倒映着柳树。',
      at: '2025-10-18 07:24:00',
      location: { lat: 30.2588, lng: 120.149, name: '断桥残雪' },
      photos: [IMG.westlake, IMG.temple],
    },
    {
      clientId: 'r_hz_d1_food',
      journeyId: J.hangzhou,
      type: 'photo',
      content: '河坊街的片儿川，汤汁很鲜。',
      at: '2025-10-18 11:30:00',
      location: { lat: 30.2455, lng: 120.1695, name: '河坊街' },
      expense: { amountCent: 4800, category: 'food', note: '片儿川' },
      photos: [IMG.food],
      voice: { url: VOICE, durationSec: 12, size: 102400 },
    },
    {
      clientId: 'r_hz_d1_voice',
      journeyId: J.hangzhou,
      type: 'voice',
      content: '灵隐寺香火很旺，飞来峰一线天挤了会儿。',
      at: '2025-10-18 15:02:00',
      location: { lat: 30.2428, lng: 120.1005, name: '灵隐寺' },
      voice: { url: VOICE, durationSec: 18, size: 150000 },
    },
    {
      clientId: 'r_hz_d1_stay',
      journeyId: J.hangzhou,
      type: 'expense',
      content: '湖滨酒店一晚',
      at: '2025-10-18 20:00:00',
      expense: { amountCent: 58000, category: 'stay', note: '湖滨住宿' },
    },
    {
      clientId: 'r_hz_d2_metro',
      journeyId: J.hangzhou,
      type: 'expense',
      content: '地铁一日票',
      at: '2025-10-19 09:10:00',
      expense: { amountCent: 1800, category: 'transport', note: '地铁' },
    },
    {
      clientId: 'r_hz_d2_leifeng',
      journeyId: J.hangzhou,
      type: 'photo',
      content: '雷峰塔上风很大，钱塘江隐约可见。',
      at: '2025-10-19 11:20:00',
      location: { lat: 30.2312, lng: 120.1488, name: '雷峰塔' },
      expense: { amountCent: 4000, category: 'ticket', note: '雷峰塔门票' },
      photos: [IMG.temple],
    },
    {
      clientId: 'r_hz_d2_shop',
      journeyId: J.hangzhou,
      type: 'expense',
      content: '买了两盒龙井茶带回家',
      at: '2025-10-19 14:40:00',
      location: { lat: 30.251, lng: 120.163, name: '湖滨银泰' },
      expense: { amountCent: 16800, category: 'shopping', note: '龙井茶' },
    },
    {
      clientId: 'r_hz_d2_text',
      journeyId: J.hangzhou,
      type: 'text',
      content: '傍晚坐在苏堤看夕阳，桂花香一阵一阵的。',
      at: '2025-10-19 17:40:00',
      location: { lat: 30.243, lng: 120.1405, name: '苏堤' },
    },
    {
      clientId: 'r_hz_d3_breakfast',
      journeyId: J.hangzhou,
      type: 'expense',
      content: '豆浆油条',
      at: '2025-10-20 08:30:00',
      expense: { amountCent: 1200, category: 'food', note: '早餐' },
    },
    {
      clientId: 'r_hz_d3_longjing',
      journeyId: J.hangzhou,
      type: 'photo',
      content: '龙井村茶园一层一层，茶农在采秋茶。',
      at: '2025-10-20 10:50:00',
      location: { lat: 30.2195, lng: 120.1165, name: '龙井村' },
      photos: [IMG.westlake],
      expense: { amountCent: 3500, category: 'transport', note: '打车去龙井' },
    },
    {
      clientId: 'r_hz_d3_dinner',
      journeyId: J.hangzhou,
      type: 'expense',
      content: '知味观东坡肉',
      at: '2025-10-20 19:10:00',
      location: { lat: 30.2535, lng: 120.1605, name: '知味观' },
      expense: { amountCent: 18600, category: 'food', note: '杭帮菜双人' },
      photos: [IMG.food],
    },

    // ══════ 张家界（已结束）══════
    {
      clientId: 'r_zj_d1_car',
      journeyId: J.zhangjiajie,
      type: 'expense',
      content: '长沙到张家界高铁',
      at: '2025-09-02 10:00:00',
      location: { lat: 29.127, lng: 110.479, name: '张家界站' },
      expense: { amountCent: 28600, category: 'transport', note: '高铁往返' },
    },
    {
      clientId: 'r_zj_d1_tianmen',
      journeyId: J.zhangjiajie,
      type: 'photo',
      content: '天门山玻璃栈道，腿有点软。',
      at: '2025-09-02 15:20:00',
      location: { lat: 29.0505, lng: 110.479, name: '天门山' },
      expense: { amountCent: 25800, category: 'ticket', note: '天门山门票' },
      photos: [IMG.cliff],
    },
    {
      clientId: 'r_zj_d1_stay',
      journeyId: J.zhangjiajie,
      type: 'expense',
      content: '武陵源首晚',
      at: '2025-09-02 21:00:00',
      expense: { amountCent: 32000, category: 'stay', note: '景区酒店' },
    },
    {
      clientId: 'r_zj_d3_yuanjiajie',
      journeyId: J.zhangjiajie,
      type: 'photo',
      content: '袁家界云海翻涌，像阿凡达里的悬浮山。',
      at: '2025-09-04 11:30:00',
      location: { lat: 29.3435, lng: 110.4795, name: '袁家界' },
      photos: [IMG.mountain],
    },
    {
      clientId: 'r_zj_d3_bus',
      journeyId: J.zhangjiajie,
      type: 'expense',
      content: '景区环保车',
      at: '2025-09-04 16:00:00',
      expense: { amountCent: 4000, category: 'transport', note: '环保车' },
    },
    {
      clientId: 'r_zj_d3_stay',
      journeyId: J.zhangjiajie,
      type: 'expense',
      content: '景区客栈',
      at: '2025-09-04 20:00:00',
      expense: { amountCent: 28000, category: 'stay', note: '客栈' },
    },
    {
      clientId: 'r_zj_d5_jinbian',
      journeyId: J.zhangjiajie,
      type: 'photo',
      content: '金鞭溪峡谷徒步，溪水很清。',
      at: '2025-09-06 13:00:00',
      location: { lat: 29.325, lng: 110.445, name: '金鞭溪' },
      photos: [IMG.waterfall, IMG.mountain],
      voice: { url: VOICE, durationSec: 22, size: 180000 },
    },
    {
      clientId: 'r_zj_d5_food',
      journeyId: J.zhangjiajie,
      type: 'expense',
      content: '土家三下锅',
      at: '2025-09-06 19:00:00',
      expense: { amountCent: 16800, category: 'food', note: '土家菜' },
    },
    {
      clientId: 'r_zj_d6_shop',
      journeyId: J.zhangjiajie,
      type: 'expense',
      content: '买了葛根粉',
      at: '2025-09-07 14:00:00',
      location: { lat: 29.35, lng: 110.43, name: '黄石寨' },
      expense: { amountCent: 6800, category: 'shopping', note: '特产' },
    },
    {
      clientId: 'r_zj_d6_text',
      journeyId: J.zhangjiajie,
      type: 'text',
      content: '峰林看完了，腿酸但值得。',
      at: '2025-09-07 18:00:00',
      location: { lat: 29.127, lng: 110.479, name: '张家界站' },
    },

    // ══════ 大理（已结束）══════
    {
      clientId: 'r_dl_d1_stay',
      journeyId: J.dali,
      type: 'expense',
      content: '海景客栈入住',
      at: '2025-08-11 16:00:00',
      location: { lat: 25.692, lng: 100.194, name: '才村码头' },
      expense: { amountCent: 180000, category: 'stay', note: '客栈 5 晚' },
    },
    {
      clientId: 'r_dl_d2_bike',
      journeyId: J.dali,
      type: 'photo',
      content: '风很大，洱海比想象中蓝。',
      at: '2025-08-12 10:20:00',
      location: { lat: 25.69, lng: 100.19, name: '洱海' },
      expense: { amountCent: 80000, category: 'transport', note: '电动车租赁' },
      photos: [IMG.dali],
    },
    {
      clientId: 'r_dl_d2_lunch',
      journeyId: J.dali,
      type: 'expense',
      content: '烤乳扇+乳饼',
      at: '2025-08-12 12:40:00',
      expense: { amountCent: 6800, category: 'food', note: '路边摊' },
    },
    {
      clientId: 'r_dl_d3_xizhou',
      journeyId: J.dali,
      type: 'photo',
      content: '喜洲古镇的巷子里全是小吃味。',
      at: '2025-08-13 11:00:00',
      location: { lat: 25.825, lng: 100.131, name: '喜洲古镇' },
      expense: { amountCent: 52000, category: 'food', note: '喜洲小吃' },
      photos: [IMG.town, IMG.food],
    },
    {
      clientId: 'r_dl_d4_shuanglang',
      journeyId: J.dali,
      type: 'location',
      content: '双廊看日出，云把山切开了。',
      at: '2025-08-14 06:10:00',
      location: { lat: 25.909, lng: 100.197, name: '双廊' },
    },
    {
      clientId: 'r_dl_d4_ticket',
      journeyId: J.dali,
      type: 'expense',
      content: '苍山索道',
      at: '2025-08-14 14:00:00',
      expense: { amountCent: 21000, category: 'ticket', note: '索道' },
    },
    {
      clientId: 'r_dl_d5_shop',
      journeyId: J.dali,
      type: 'expense',
      content: '扎染围巾',
      at: '2025-08-15 15:30:00',
      expense: { amountCent: 12800, category: 'shopping', note: '手作' },
    },
    {
      clientId: 'r_dl_d6_text',
      journeyId: J.dali,
      type: 'text',
      content: '慢下来的五天，下次还带狗来。',
      at: '2025-08-16 10:00:00',
      location: { lat: 25.606, lng: 100.267, name: '大理古城' },
    },

    // ══════ 厦门（即将出发：少量预消费）══════
    {
      clientId: 'r_xm_prep_hotel',
      journeyId: J.xiamen,
      type: 'expense',
      content: '鼓浪屿客栈订金',
      at: '2026-03-20 14:00:00',
      expense: { amountCent: 20000, category: 'stay', note: '订金' },
    },
    {
      clientId: 'r_xm_prep_train',
      journeyId: J.xiamen,
      type: 'expense',
      content: '杭州—厦门高铁订妥',
      at: '2026-03-22 09:00:00',
      expense: { amountCent: 56800, category: 'transport', note: '往返高铁' },
    },
  ];
}

async function seedEntries(ctx: Ctx, list: SeedEntry[]) {
  const map = new Map<string, string>(); // clientId -> entryId
  for (const s of list) {
    const id = eid();
    const payload = s.voice
      ? { durationSec: s.voice.durationSec }
      : undefined;
    await ctx.entries.save(
      ctx.entries.create({
        id,
        journeyId: s.journeyId,
        clientId: s.clientId,
        type: s.type,
        content: s.content,
        payload,
        syncVersion: 1,
        status: 'synced',
        recordedAt: new Date(s.at.replace(' ', 'T') + '+08:00'),
      }),
    );
    await ctx.ds.query(`UPDATE entries SET createdAt = ?, recordedAt = ? WHERE id = ?`, [
      s.at,
      s.at,
      id,
    ]);
    map.set(s.clientId, id);

    if (s.location) {
      await ctx.locations.save(
        ctx.locations.create({
          entryId: id,
          lat: s.location.lat,
          lng: s.location.lng,
          name: s.location.name,
        }),
      );
    }
    if (s.expense) {
      await ctx.expenses.save(
        ctx.expenses.create({
          entryId: id,
          amountCent: s.expense.amountCent,
          category: s.expense.category,
          currency: 'CNY',
          note: s.expense.note,
        }),
      );
    }
    for (const url of s.photos ?? []) {
      await ctx.media.save(
        ctx.media.create({
          ownerType: 'entry',
          ownerId: id,
          kind: 'image',
          url,
          mime: 'image/jpeg',
          sizeBytes: 220000,
          status: 'active',
          driver: 'local',
          createdBy: USER_ID,
        }),
      );
    }
    if (s.voice) {
      await ctx.media.save(
        ctx.media.create({
          ownerType: 'entry',
          ownerId: id,
          kind: 'audio',
          url: s.voice.url,
          mime: 'audio/m4a',
          sizeBytes: s.voice.size ?? 120000,
          status: 'active',
          driver: 'local',
          createdBy: USER_ID,
        }),
      );
    }
  }
  return map;
}

async function seedGuidesFromDb(ctx: Ctx) {
  // 从真实 entries 聚合，保证 guide.payload 与时间线一致
  for (const [journeyId, guideId, favorited, channels] of [
    [J.hangzhou, G.hangzhou, true, ['moments', 'friend']] as const,
    [J.zhangjiajie, G.zhangjiajie, false, ['image']] as const,
    [J.dali, G.dali, true, ['moments']] as const,
  ]) {
    const journey = await ctx.journeys.findOneByOrFail({ id: journeyId });
    const entries = await ctx.entries.find({
      where: { journeyId },
      relations: ['location', 'expenses'],
      order: { createdAt: 'ASC' },
    });
    const mediaRows = entries.length
      ? await ctx.media.find({
          where: {
            ownerType: 'entry',
            ownerId: In(entries.map((e) => e.id)),
            status: 'active',
          },
        })
      : [];
    const mediaByEntry = new Map<string | null, typeof mediaRows>();
    for (const m of mediaRows) {
      const list = mediaByEntry.get(m.ownerId) ?? [];
      list.push(m);
      mediaByEntry.set(m.ownerId, list);
    }
    for (const e of entries) {
      (e as any).media = mediaByEntry.get(e.id) ?? [];
    }
    const payload = buildGuidePayload(journey, entries);
    await ctx.guides.save(
      ctx.guides.create({
        id: guideId,
        journeyId,
        template: 'basic',
        payload,
        coverUrl:
          journey.coverUrl ??
          payload.highlights.find((h) => h.cover)?.cover ??
          undefined,
        isFavorited: favorited,
        totalCost: payload.expense.totalCent,
      }),
    );
    void channels; // share 在下一步挂
  }
  console.log('✓ guides（由 entries 实时聚合，与时间线一致）');
}

function buildGuidePayload(journey: Journey, entries: Entry[]) {
  const { days, nights } = nightsBetween(journey.startDate, journey.endDate);
  const themeTags = journey.themeTags ?? [];
  const publicLoc = journey.isPublic;

  const withPhoto = entries.filter(
    (e) =>
      e.type === 'photo' ||
      (e.media ?? []).some(
        (m) => m.kind === 'photo' || m.kind === 'image',
      ),
  );
  const rest = entries.filter((e) => !withPhoto.includes(e));
  const ordered = [...withPhoto, ...rest];

  const highlights = ordered.slice(0, 12).map((e) => {
    const photo = (e.media ?? []).find(
      (m) => m.kind === 'photo' || m.kind === 'image',
    );
    const mediaUrl = photo?.url;
    const locName = e.location?.name;
    const note = e.content?.trim()
      ? e.content
      : locName
        ? `📍 ${locName}`
        : undefined;
    return {
      entryId: e.id,
      recordingId: e.id,
      type: e.type,
      title: (e.content || locName || e.type).slice(0, 32),
      note,
      content: e.content,
      cover: mediaUrl,
      mediaUrl,
      createdAt: e.createdAt,
    };
  });

  const places = entries
    .filter((e) => e.location)
    .map((e) => {
      const loc = e.location!;
      return publicLoc
        ? { name: loc.name, lat: loc.lat, lng: loc.lng }
        : { name: loc.name };
    });
  const route = places.map((p) => p.name).filter(Boolean) as string[];
  const cities = [...new Set(route)];

  const categoryMap = new Map<string, number>();
  let totalCent = 0;
  for (const e of entries) {
    for (const exp of e.expenses ?? []) {
      totalCent += exp.amountCent;
      const cat =
        normalizeExpenseCategory(exp.category) ?? exp.category;
      categoryMap.set(cat, (categoryMap.get(cat) ?? 0) + exp.amountCent);
    }
  }
  const byCategory = [...categoryMap.entries()].map(([category, amountCent]) => ({
    category,
    amountCent,
    ratio: totalCent ? Number((amountCent / totalCent).toFixed(4)) : 0,
  }));

  return {
    highlights,
    places,
    cities,
    route,
    expense: { totalCent, byCategory },
    meta: {
      title: journey.title,
      origin: journey.origin,
      destination: journey.destination ?? null,
      startDate: journey.startDate,
      endDate: journey.endDate,
      days,
      nights,
      themeTags,
      themeLabel: themeLabelOf(themeTags),
      isPublic: journey.isPublic,
      template: 'basic',
    },
  };
}

async function seedShares(ctx: Ctx) {
  const rows: Array<{
    journeyId: string;
    guideId: string;
    channel: 'friend' | 'moments' | 'image';
  }> = [
    { journeyId: J.hangzhou, guideId: G.hangzhou, channel: 'moments' },
    { journeyId: J.hangzhou, guideId: G.hangzhou, channel: 'friend' },
    { journeyId: J.zhangjiajie, guideId: G.zhangjiajie, channel: 'image' },
    { journeyId: J.dali, guideId: G.dali, channel: 'moments' },
  ];
  for (const r of rows) {
    await ctx.shares.save(
      ctx.shares.create({
        journeyId: r.journeyId,
        guideId: r.guideId,
        channel: r.channel,
        sharerId: USER_ID,
      }),
    );
  }
  console.log('✓ share_events → guides');
}

async function seedBudgetsDraftsOrders(ctx: Ctx) {
  await ctx.budgets.save(
    ctx.budgets.create({ userId: USER_ID, year: 2025, amountCent: 5000000 }),
  );
  await ctx.budgets.save(
    ctx.budgets.create({ userId: USER_ID, year: 2026, amountCent: 3000000 }),
  );

  await ctx.drafts.save(
    ctx.drafts.create({
      userId: USER_ID,
      kind: 'entry',
      journeyId: J.xiamen,
      payload: {
        content: '鼓浪屿日光岩还没写完…',
        type: 'text',
        location: { name: '鼓浪屿', lat: 24.4478, lng: 118.0665 },
      },
    }),
  );
  await ctx.drafts.save(
    ctx.drafts.create({
      userId: USER_ID,
      kind: 'journey',
      payload: {
        title: '成都宽窄巷子周末（草稿）',
        origin: '重庆',
        destination: '四川 · 成都',
        themeTags: ['food', 'city_walk'],
      },
    }),
  );

  await ctx.orders.save(
    ctx.orders.create({
      userId: USER_ID,
      product: 'capacity_pack',
      amountCent: 990,
      status: 'pending',
    }),
  );
  console.log('✓ budgets / drafts / pending order');
}

async function printSummary(ds: DataSource) {
  const stats = await ds.query(`
    SELECT j.title, j.status, j.clientId,
      (SELECT COUNT(*) FROM entries e WHERE e.journeyId=j.id) AS entries,
      (SELECT COUNT(*) FROM locations l JOIN entries e ON l.entryId=e.id WHERE e.journeyId=j.id) AS locs,
      (SELECT COUNT(*) FROM expenses x JOIN entries e ON x.entryId=e.id WHERE e.journeyId=j.id) AS expenses,
      (SELECT COUNT(*) FROM media m JOIN entries e ON m.ownerType='entry' AND m.ownerId=e.id WHERE e.journeyId=j.id) AS media,
      (SELECT COALESCE(SUM(x.amountCent),0) FROM expenses x JOIN entries e ON x.entryId=e.id WHERE e.journeyId=j.id) AS spent,
      (SELECT COUNT(*) FROM guides g WHERE g.journeyId=j.id) AS guides,
      (SELECT places FROM journey_plans p WHERE p.journeyId=j.id) AS planPlaces
    FROM journeys j WHERE j.userId=? ORDER BY j.startDate
  `, [USER_ID]);

  console.log('\n========== 种子完成（联调样本）==========');
  console.log(`用户: ${USER_ID} / openid=${OPENID} / 途记演示`);
  for (const s of stats) {
    const places = typeof s.planPlaces === 'string'
      ? JSON.parse(s.planPlaces)
      : s.planPlaces;
    console.log(
      `· ${s.title} [${s.status}] ${s.clientId}` +
        `\n  entries=${s.entries} loc=${s.locs} expense=${s.expenses} media=${s.media}` +
        ` spent=${s.spent}分 guide=${s.guides} planPlaces=${places?.length ?? 0}`,
    );
  }
  console.log('\n登录: POST /dream/v1/auth/wechat-login {"code":"dev_openid_demo"}');
  console.log('杭州攻略: GET /dream/v1/journeys/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0002/guide');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
