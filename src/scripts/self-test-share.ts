/**
 * T4.7 逻辑自测 · 分享体系（ShareService）
 *
 * 分享流程（创建票据 → 免登录取脱敏内容 → 浏览归因 → owner 统计）触达多个仓储，
 * 无法直接用纯函数断言。本脚本用**内存仓储 mock**（不依赖真实 MySQL）注入 ShareService，
 * 跑通完整链路并断言关键不变量，作为可重复回归自测（用户本机有 DB 时可扩展为端到端）。
 *
 * 覆盖：createShare 票据化 + 短链、getShare 脱敏（不含经纬度）/ 404 / 410、viewShare
 * 归因幂等、getShareStats 计数（stats+1）、owner 校验。
 *
 * 运行：cd server && npx ts-node --transpile-only src/scripts/self-test-share.ts
 */
import 'reflect-metadata';
import { Repository, FindOperator, In } from 'typeorm';
import { NotFoundException, GoneException } from '@nestjs/common';
import { ShareService } from '../modules/share/share.service';
import { Share } from '../entities/share.entity';
import { Journey } from '../entities/journey.entity';
import { Guide } from '../entities/guide.entity';
import { User } from '../entities/user.entity';
import { ShareEvent } from '../entities/share-event.entity';

let failures = 0;
function assert(name: string, cond: boolean): void {
  if (cond) {
    console.log('  ✓ ' + name);
  } else {
    console.error('  ✗ ' + name);
    failures += 1;
  }
}

/** 极简内存仓储：实现 ShareService 实际用到的 findOne/find/save/create。 */
class InMemoryRepository<T extends Record<string, any>> {
  rows: T[] = [];
  private seq = 0;

  create(partial: Partial<T>): T {
    return { ...(partial as object) } as unknown as T;
  }

  async save(entity: T): Promise<T> {
    const e = entity as Record<string, any>;
    if (!e.id) e.id = `gen-${++this.seq}`;
    if (!e.createdAt && !e.sharedAt) e.createdAt = new Date();
    const idx = this.rows.findIndex((r) => r.id === e.id);
    if (idx >= 0) {
      this.rows[idx] = { ...this.rows[idx], ...e } as unknown as T;
      return { ...this.rows[idx] } as unknown as T;
    }
    this.rows.push({ ...e } as unknown as T);
    return { ...e } as unknown as T;
  }

  async findOne(
    opts: { where?: Record<string, any>; order?: Record<string, 'ASC' | 'DESC'> } = {},
  ): Promise<T | null> {
    let res = this.match(this.rows, opts.where);
    if (opts.order) {
      const [field, dir] = Object.entries(opts.order)[0];
      res = [...res].sort((a, b) => {
        const av = new Date(a[field]).getTime();
        const bv = new Date(b[field]).getTime();
        return dir === 'DESC' ? bv - av : av - bv;
      });
    }
    return res[0] ?? null;
  }

  async find(opts: { where?: Record<string, any> } = {}): Promise<T[]> {
    return this.match(this.rows, opts.where);
  }

  private match(rows: T[], where?: Record<string, any>): T[] {
    if (!where) return [...rows];
    return rows.filter((r) => {
      for (const [k, v] of Object.entries(where)) {
        if (v instanceof FindOperator) {
          if (v.type === 'in') {
            if (!Array.isArray(v.value) || !v.value.includes((r as any)[k])) {
              return false;
            }
          }
          continue;
        }
        if ((r as any)[k] !== v) return false;
      }
      return true;
    });
  }
}

const shareRepo = new InMemoryRepository<Share>();
const journeyRepo = new InMemoryRepository<Journey>();
const guideRepo = new InMemoryRepository<Guide>();
const userRepo = new InMemoryRepository<User>();
const shareEventRepo = new InMemoryRepository<ShareEvent>();

// 注入内存仓储 + 假 ConfigService（APP_PUBLIC_BASE_URL 留空 → 走默认短链域名）
const svc = new ShareService(
  shareRepo as unknown as Repository<Share>,
  journeyRepo as unknown as Repository<Journey>,
  guideRepo as unknown as Repository<Guide>,
  userRepo as unknown as Repository<User>,
  shareEventRepo as unknown as Repository<ShareEvent>,
  { get: () => undefined } as unknown as any,
);

console.log('T4.7 逻辑自测 · ShareService 分享全链路');

async function main(): Promise<void> {
  console.log('--- 0) 种子数据 ---');
  userRepo.rows.push(
    Object.assign(new User(), { id: 'u1', openid: 'o1', nick: '旅人A', avatar: null, plan: 'free' }),
    Object.assign(new User(), { id: 'viewer-1', openid: 'ov1', nick: 'V1', avatar: null, plan: 'pro' }),
    Object.assign(new User(), { id: 'viewer-2', openid: 'ov2', nick: 'V2', avatar: null, plan: 'free' }),
  );
  journeyRepo.rows.push(
    Object.assign(new Journey(), {
      id: 'j1',
      userId: 'u1',
      title: '川西环线',
      origin: '成都',
      destination: '稻城',
      startDate: '2026-08-01',
      endDate: '2026-08-05',
      themeTags: ['nature'],
      coverUrl: 'j.jpg',
    }),
  );
  // 两篇攻略（g2 更早，g1 最新），测试缺省取最新 + 显式 guideId
  guideRepo.rows.push(
    Object.assign(new Guide(), {
      id: 'g2',
      journeyId: 'j1',
      coverUrl: 'g2.jpg',
      totalCost: 300000,
      payload: {
        highlights: [{ type: 'stay', title: '民宿', note: '老宅' }],
        cities: ['成都', '康定'],
        route: ['成都', '康定'],
        expense: { totalCent: 300000 },
      },
      createdAt: new Date('2026-07-01'),
    }),
    Object.assign(new Guide(), {
      id: 'g1',
      journeyId: 'j1',
      coverUrl: 'g1.jpg',
      totalCost: 320000,
      payload: {
        highlights: [{ type: 'food', title: '牦牛火锅', note: '必吃' }],
        cities: ['成都', '康定', '稻城'],
        route: ['成都', '康定', '稻城'],
        expense: { totalCent: 320000 },
      },
      createdAt: new Date('2026-07-10'),
    }),
  );

  console.log('--- 1) createShare：票据化 + 短链 + 缺省取最新攻略 ---');
  const created = await svc.createShare('u1', { journeyId: 'j1' });
  assert('返回 12 位 token', typeof created.token === 'string' && created.token.length === 12);
  assert('sharePath 指向 ShareView', created.sharePath.startsWith('/pages/ShareView/ShareView?t='));
  assert('channels.link.url 含 token 短链', created.channels.link.url.includes(created.token));
  assert('visibility 默认 unlisted', created.visibility === 'unlisted');

  const createdExplicit = await svc.createShare('u1', { journeyId: 'j1', guideId: 'g2' });
  assert('显式 guideId 写入 share.guideId', (await svc.getShare(createdExplicit.token)).guide.id === 'g2');

  console.log('--- 2) getShare：免登录取脱敏内容 + 隐私合规 ---');
  const got = await svc.getShare(created.token);
  assert('返回旅程标题', got.journey.title === '川西环线');
  assert('返回分享者 nick', got.sharer?.nick === '旅人A');
  assert('返回最新攻略亮点', Array.isArray(got.guide.highlights) && got.guide.highlights.length === 1);
  assert('总花费正确(320000)', got.guide.totalCostCent === 320000);
  assert('含城市路线链', Array.isArray(got.guide.route) && got.guide.route.length >= 2);
  assert(
    '隐私合规：不含经纬度字段',
    !('lat' in got.journey) && !('lng' in got.journey) && !('latitude' in got.journey) && !('longitude' in got.journey),
  );

  console.log('--- 3) viewShare：匿名 + 归因幂等 ---');
  const vAnon = await svc.viewShare(created.token);
  assert('匿名观看也归因 attributed=true', vAnon.attributed === true);
  const v1 = await svc.viewShare(created.token, 'viewer-1');
  assert('首次 viewer-1 归因 attributed=true', v1.attributed === true);
  const v1again = await svc.viewShare(created.token, 'viewer-1');
  assert('同 viewer-1 幂等 attributed=false', v1again.attributed === false);
  const v2 = await svc.viewShare(created.token, 'viewer-2');
  assert('新 viewer-2 归因 attributed=true', v2.attributed === true);

  console.log('--- 4) getShareStats：计数正确（stats+1） ---');
  const stats = await svc.getShareStats('u1');
  assert('totalShares = 2（含显式 guideId 一篇）', stats.totalShares === 2);
  assert('views = 3（匿名 + viewer-1 + viewer-2）', stats.views === 3);
  assert('uniqueViewers = 2', stats.uniqueViewers === 2);
  assert('broughtRegistrations = 2', stats.broughtRegistrations === 2);
  assert('proConversions = 1（viewer-1 为 pro）', stats.proConversions === 1);
  const main = stats.shares.find((s) => s.token === created.token)!;
  assert('主篇 views = 3', main.views === 3);
  assert('主篇 journeyTitle 正确', main.journeyTitle === '川西环线');

  console.log('--- 5) 异常路径：404 / 410 / owner 校验 ---');
  let threw404 = false;
  try {
    await svc.getShare('no-such-token');
  } catch (e) {
    threw404 = e instanceof NotFoundException;
  }
  assert('未知 token 抛 NotFound', threw404);

  const expired = await svc.createShare('u1', { journeyId: 'j1' });
  const exRow = shareRepo.rows.find((r) => r.token === expired.token)!;
  exRow.expireAt = new Date(Date.now() - 1000);
  let threw410 = false;
  try {
    await svc.getShare(expired.token);
  } catch (e) {
    threw410 = e instanceof GoneException;
  }
  assert('过期 token 抛 Gone', threw410);

  let threwOwner = false;
  try {
    await svc.createShare('stranger', { journeyId: 'j1' });
  } catch (e) {
    threwOwner = e instanceof NotFoundException;
  }
  assert('非 owner 旅程 抛 NotFound', threwOwner);
}

main()
  .then(() => {
    console.log('');
    if (failures === 0) {
      console.log('✅ 全部断言通过 — 分享全链路逻辑自测通过');
      process.exit(0);
    } else {
      console.error('❌ 存在 ' + failures + ' 项失败');
      process.exit(1);
    }
  })
  .catch((e) => {
    console.error('❌ 自测运行异常：', e);
    process.exit(1);
  });
