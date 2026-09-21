/** 仅连接本机，创建随机隔离库并在 finally 清理；绝不使用业务库。 */
import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { mock } from 'node:test';
import { config } from 'dotenv';
import { createConnection, Connection } from 'mysql2/promise';
import { DataSource } from 'typeorm';
import {
  Module,
  ValidationPipe,
  VersioningType,
  INestApplication,
} from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from '../src/modules/auth/jwt.strategy';
import { ResponseWrapInterceptor } from '../src/common/interceptors/response-wrap.interceptor';
import { ProgressService } from '../src/modules/progress/progress.service';
import { ProgressMetricsService } from '../src/modules/progress/progress.metrics';
import { ProgressController } from '../src/modules/progress/progress.controller';
import { AddUserProgress1790000000000 } from '../src/migrations/1790000000000-AddUserProgress';
import { User } from '../src/entities/user.entity';
import { Journey } from '../src/entities/journey.entity';
import { Entry } from '../src/entities/entry.entity';
import { Location } from '../src/entities/location.entity';
import { Media } from '../src/entities/media.entity';
import { Guide } from '../src/entities/guide.entity';
import { Expense } from '../src/entities/expense.entity';
import { UserBadge } from '../src/entities/user-badge.entity';
import { UserProgress } from '../src/entities/user-progress.entity';
import { ChecklistItem } from '../src/entities/checklist-item.entity';
import { UserStatsSnapshot } from '../src/entities/user-stats-snapshot.entity';
import { FootprintService } from '../src/modules/footprint/footprint.service';
import { StatsService } from '../src/modules/stats/stats.service';

config({ path: resolve(__dirname, '../.env') });
const host = process.env.DB_HOST || 'localhost';
const database = `progress_test_${Date.now()}_${randomBytes(3).toString('hex')}`;

async function main() {
  assert.ok(
    ['localhost', '127.0.0.1', '::1'].includes(host),
    '拒绝在非本机数据库运行集成测试',
  );
  assert.match(database, /^progress_test_\d+_[a-f0-9]+$/);
  let admin: Connection | undefined;
  let source: DataSource | undefined;
  let app: INestApplication | undefined;
  let created = false;
  try {
    const credentials = {
      host,
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USERNAME || 'root',
      password: process.env.DB_PASSWORD || '',
      timezone: '+08:00',
    };
    admin = await createConnection(credentials);
    const [versionRows] = await admin.query<any[]>(
      'SELECT VERSION() AS version',
    );
    assert.match(
      versionRows[0].version,
      /^(8|9)\./,
      '本测试需要 MySQL 8 或更新版本',
    );
    await admin.query(
      `CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    created = true;
    source = new DataSource({
      type: 'mysql',
      host,
      port: credentials.port,
      username: credentials.user,
      password: credentials.password,
      database,
      timezone: '+08:00',
      charset: 'utf8mb4',
      synchronize: false,
      entities: [resolve(__dirname, '../src/entities/*.entity.ts')],
      extra: { connectionLimit: 10 },
    });
    await source.initialize();
    await source.synchronize();
    const migration = new AddUserProgress1790000000000();
    const runner = source.createQueryRunner();
    try {
      await migration.down(runner);
      await migration.up(runner);
      await migration.up(runner);
    } finally {
      await runner.release();
    }
    console.log('通过：隔离库迁移 up/down/up 与重复执行');

    const service = new ProgressService(source, new ProgressMetricsService());
    const clockUser = await source
      .getRepository(User)
      .save({ id: randomUUID(), openid: randomUUID() });
    const clock = mock.method(Date, 'now', () =>
      Date.parse('2026-12-31T23:59:59.999+08:00'),
    );
    try {
      const atBoundary = await service.overview(clockUser.id);
      const replay = await service.overview(clockUser.id);
      assert.equal(atBoundary.levelReachedAt, '2026-12-31 23:59:59');
      assert.equal(replay.levelReachedAt, atBoundary.levelReachedAt);
      assert.equal(
        atBoundary.badges.find((b) => b.key === 'founder')!.unlockedAt,
        '2026-12-31 23:59:59',
      );
      assert.deepEqual(replay.badges, atBoundary.badges);
    } finally {
      clock.mock.restore();
    }
    console.log('通过：毫秒跨年边界首次响应与数据库回读时间完全一致');

    const user = await source
      .getRepository(User)
      .save({ id: randomUUID(), openid: randomUUID() });
    const other = await source
      .getRepository(User)
      .save({ id: randomUUID(), openid: randomUUID() });
    const empty = await service.overview(user.id);
    assert.equal(empty.xp, 0);
    assert.equal(empty.level, 1);
    assert.equal(empty.pendingCelebrationLevel, null);
    const journey = await source.getRepository(Journey).save({
      userId: user.id,
      title: '成长测试',
      startDate: '2026-01-01',
      endDate: '2026-01-01',
      status: 'finished',
    });
    const addEntry = async (time: string, extra: Partial<Entry> = {}) =>
      source!.getRepository(Entry).save({
        journeyId: journey.id,
        type: 'text',
        clientId: randomUUID(),
        recordedAt: new Date(`${time.replace(' ', 'T')}+08:00`),
        ...extra,
      });
    const addMedia = async (
      ownerId: string,
      kind: string,
      extra: Partial<Media> = {},
    ) =>
      source!.getRepository(Media).save({
        ownerType: 'entry',
        ownerId,
        kind,
        url: 'test-only',
        status: 'active',
        ...extra,
      });
    const ids: string[] = [];
    for (let i = 0; i < 8; i++) {
      const row = await addEntry('2026-01-01 12:00:00', {
        city: i % 2 ? '杭州' : ' 杭州 ',
        content: '旅途文字',
      });
      ids.push(row.id);
      await source.getRepository(Location).save({
        entryId: row.id,
        lat: 30,
        lng: 120,
        name: i % 2 ? '灵隐寺' : '西湖',
      });
    }
    for (let i = 0; i < 10; i++)
      await addMedia(ids[0], i % 2 ? 'photo' : 'image');
    const first = await service.overview(user.id);
    assert.equal(first.xp, 153);
    assert.equal(first.level, 2);
    assert.equal(first.pendingCelebrationLevel, 2);
    assert.equal(first.metrics.cityCount, 1);
    assert.equal(first.metrics.recordCount, 8);
    assert.equal(first.metrics.photoCount, 10);
    assert.equal(
      first.badges.find((b) => b.key === 'explorer-2026')!.unlocked,
      true,
    );
    await service.acknowledge(user.id, 2);
    await service.acknowledge(user.id, 1);
    assert.equal(
      (await service.overview(user.id)).pendingCelebrationLevel,
      null,
    );
    await assert.rejects(service.acknowledge(user.id, 6));
    await assert.rejects(service.acknowledge(user.id, 1.5));
    await assert.rejects(service.acknowledge(other.id, 2));
    console.log('通过：首旅 153 XP、升级、确认幂等及用户隔离');

    const plan = await addEntry('2026-01-01 06:00:00', {
      payload: { source: 'plan_place' },
      city: '北京',
    });
    const future = await addEntry('2099-01-01 06:00:00', { city: '上海' });
    await addMedia(plan.id, 'image');
    await addMedia(future.id, 'image');
    await addMedia(ids[0], 'image', { status: 'pending' });
    await addMedia(ids[0], 'image', { deletedAt: new Date() });
    await addMedia(ids[0], 'image', { ownerType: 'avatar' });
    await addMedia(randomUUID(), 'image');
    const excluded = await service.overview(user.id);
    assert.equal(excluded.xp, 153);
    assert.equal(excluded.metrics.cityCount, 1);
    const zeroPoint = await addEntry('2026-01-01 12:00:00');
    await source
      .getRepository(Location)
      .save({ entryId: zeroPoint.id, lat: 0, lng: 0, name: '山海' });
    const invalidPoint = await addEntry('2026-01-01 12:00:00');
    await source
      .getRepository(Location)
      .save({ entryId: invalidPoint.id, lat: 91, lng: 200, name: '峰岛' });
    const points = await service.overview(user.id);
    assert.equal(points.metrics.locatedRecordCount, 9);
    assert.equal(points.metrics.placeTypeCount, 3);
    assert.equal(
      points.badges.find((b) => b.key === 'mountain-sea')!.unlocked,
      true,
    );
    console.log(
      '通过：占位、未来、无效素材排除，坐标零值与越界校验，地点类别去重',
    );

    for (const time of [
      '2026-01-02 05:00:00',
      '2026-01-02 07:30:00',
      '2026-01-03 06:00:00',
      '2026-01-05 06:00:00',
      '2026-01-06 06:00:00',
    ])
      await addEntry(time);
    await addEntry('2026-01-02 04:59:59');
    await addEntry('2026-01-02 07:30:01');
    const dawn = await service.overview(user.id);
    assert.equal(dawn.metrics.dawnRecordCount, 5);
    assert.equal(dawn.metrics.dawnRecordDays, 4);
    assert.equal(dawn.metrics.longestStreak, 3);
    assert.equal(dawn.xpBreakdown.find((b) => b.key === 'streak')!.xp, 12);
    assert.equal(
      dawn.badges.find((b) => b.key === 'sun-chaser')!.unlocked,
      true,
    );
    await addMedia(ids[0], 'audio', { durationSec: 6 });
    await addMedia(ids[0], 'voice', { durationSec: 6 });
    const guide = await source
      .getRepository(Guide)
      .save({ journeyId: journey.id });
    await source
      .getRepository(Guide)
      .save({ id: guide.id, journeyId: journey.id, template: 'updated' });
    const composed = await service.overview(user.id);
    assert.equal(composed.xpBreakdown.find((b) => b.key === 'voice')!.xp, 1);
    assert.equal(composed.xpBreakdown.find((b) => b.key === 'guides')!.xp, 40);
    assert.equal(
      composed.badges.find((b) => b.key === 'weaver')!.unlocked,
      true,
    );
    console.log('通过：清晨边界、最长连续段、语音先求和再取整、同旅程游记幂等');

    const footprints = new FootprintService(
      source.getRepository(Journey),
      source.getRepository(Entry),
      source.getRepository(Location),
      source.getRepository(Media),
    );
    const stats = new StatsService(
      source.getRepository(Journey),
      source.getRepository(Entry),
      source.getRepository(Expense),
      source.getRepository(Location),
      source.getRepository(Media),
      source.getRepository(ChecklistItem),
      source.getRepository(Guide),
      source.getRepository(User),
      source.getRepository(UserStatsSnapshot),
    );
    assert.equal(
      (await footprints.stats(user.id)).cityCount,
      composed.metrics.cityCount,
    );
    const cities = await footprints.detail(user.id, {
      type: 2,
      page: 1,
      pageSize: 20,
    });
    assert.equal(cities.total, 1);
    assert.equal(cities.list[0].name, '杭州');
    const cityStats = await (stats as any).cityStats([journey.id], null, null);
    assert.equal(cityStats.cityFootprint, composed.metrics.cityCount);
    console.log('通过：成长、足迹数量/列表、统计城市口径一致');

    const concurrent = await Promise.all(
      Array.from({ length: 6 }, () => service.overview(user.id)),
    );
    assert.ok(concurrent.every((r) => r.highestXp === composed.highestXp));
    assert.equal(
      await source.getRepository(UserBadge).countBy({ userId: user.id }),
      composed.badgeCount,
    );
    const firstConcurrent = await Promise.all(
      Array.from({ length: 6 }, () => service.overview(other.id)),
    );
    assert.ok(firstConcurrent.every((r) => r.level === 1));
    assert.equal(
      await source.getRepository(UserProgress).countBy({ userId: other.id }),
      1,
    );
    const dates = composed.badges
      .filter((b) => b.unlocked)
      .map((b) => [b.key, b.unlockedAt]);
    await source.getRepository(Journey).delete(journey.id);
    const removed = await service.overview(user.id);
    assert.equal(removed.xp, 0);
    assert.equal(removed.highestXp, composed.highestXp);
    assert.equal(removed.level, composed.level);
    assert.deepEqual(
      removed.badges
        .filter((b) => b.unlocked)
        .map((b) => [b.key, b.unlockedAt]),
      dates,
    );
    console.log('通过：并发初始化、重复查询、删除数据后的峰值/等级/徽章保留');

    // 注册排名包括软删除账号，同秒以 id 稳定排序。
    const rankUser = await source.getRepository(User).save({
      id: 'rank-target',
      openid: randomUUID(),
      createdAt: new Date('2026-03-01T00:00:00+08:00'),
    });
    const oldUsers = Array.from({ length: 999 }, (_, i) => ({
      id: `rank-${String(i).padStart(4, '0')}`,
      openid: randomUUID(),
      createdAt: rankUser.createdAt,
      status: 'deleted',
      deletedAt: new Date(),
    }));
    await source.getRepository(User).insert(oldUsers);
    const rank1000 = await service.overview(rankUser.id);
    assert.equal(rank1000.metrics.registeredRank, 1000);
    assert.equal(
      rank1000.badges.find((b) => b.key === 'founder')!.unlocked,
      true,
    );
    const rankLate = await source.getRepository(User).save({
      id: 'rank-z',
      openid: randomUUID(),
      createdAt: rankUser.createdAt,
    });
    assert.equal(
      (await service.overview(rankLate.id)).metrics.registeredRank,
      1001,
    );
    assert.equal(
      (await service.overview(rankLate.id)).badges.find(
        (b) => b.key === 'founder',
      )!.unlocked,
      false,
    );
    console.log('通过：注册排名并列、1000/1001 边界、注销账号不释放名额');

    const edgeUser = await source
      .getRepository(User)
      .save({ id: randomUUID(), openid: randomUUID() });
    const edgeJourneys = await source.getRepository(Journey).save([
      {
        userId: edgeUser.id,
        title: '上一年',
        startDate: '2025-12-31',
        endDate: '2025-12-31',
        status: 'finished',
      },
      {
        userId: edgeUser.id,
        title: '年度兼容状态',
        startDate: '2025-12-31',
        endDate: '2026-01-01',
        status: 'finished',
      },
      {
        userId: edgeUser.id,
        title: '下一年',
        startDate: '2027-01-01',
        endDate: '2027-01-01',
        status: 'finished',
      },
      {
        userId: edgeUser.id,
        title: '未完成',
        startDate: '2026-01-01',
        endDate: '2026-01-01',
        status: 'ongoing',
      },
    ]);
    // 历史状态不属于当前写入类型，仅用原始 SQL 构造兼容性样本。
    await source.query('UPDATE journeys SET status = ? WHERE id = ?', [
      'ended',
      edgeJourneys[1].id,
    ]);
    await source.getRepository(Entry).save([
      {
        journeyId: edgeJourneys[1].id,
        type: 'text',
        clientId: randomUUID(),
        city: '   ',
        recordedAt: null,
        createdAt: new Date('2025-12-31T23:59:59+08:00'),
      },
      {
        journeyId: edgeJourneys[1].id,
        type: 'text',
        clientId: randomUUID(),
        city: '杭州',
        recordedAt: new Date('2026-01-01T00:00:00+08:00'),
      },
      {
        journeyId: edgeJourneys[1].id,
        type: 'text',
        clientId: randomUUID(),
        city: '上海',
        recordedAt: new Date('2026-01-01T00:00:01+08:00'),
      },
    ]);
    const edge = await new ProgressMetricsService().collect(
      source.manager,
      edgeUser.id,
      '2026-01-01 00:00:00',
    );
    assert.equal(
      edge.journeys.reduce((n, j) => n + j.completed, 0),
      3,
    );
    assert.equal(
      edge.journeys.reduce((n, j) => n + j.annualCompleted, 0),
      1,
    );
    assert.equal(
      edge.journeys.reduce((n, j) => n + j.recordCount, 0),
      2,
    );
    assert.equal(Math.max(...edge.journeys.map((j) => j.longestStreak)), 2);
    assert.equal(edge.global.cityCount, 1);
    const historical = await service.overview(edgeUser.id);
    assert.ok(historical.level >= 2);
    assert.equal(historical.pendingCelebrationLevel, null);
    console.log(
      '通过：年度跨年、北京时间零点、创建时间回退、空城市及老用户首次不庆祝',
    );

    const heavyJourney = await source.getRepository(Journey).save({
      userId: other.id,
      title: '性能测试',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      status: 'finished',
    });
    for (let offset = 0; offset < 5000; offset += 500) {
      await source.getRepository(Entry).insert(
        Array.from({ length: 500 }, (_, i) => ({
          journeyId: heavyJourney.id,
          clientId: randomUUID(),
          type: 'text',
          city: '杭州',
          recordedAt: new Date(
            `2026-01-${String(((offset + i) % 31) + 1).padStart(2, '0')}T12:00:00+08:00`,
          ),
        })),
      );
    }
    const samples: number[] = [];
    for (let i = 0; i < 5; i++) {
      const start = performance.now();
      const heavy = await service.overview(other.id);
      samples.push(performance.now() - start);
      assert.equal(heavy.metrics.recordCount, 5000);
      assert.equal(heavy.metrics.longestStreak, 31);
      assert.equal(heavy.xp, 505);
    }
    console.log(
      '5000 条记录概览耗时（毫秒）:',
      samples.map((n) => n.toFixed(1)).join(', '),
    );
    assert.ok(Math.max(...samples) < 300, '概览耗时未达到 300ms 目标');

    const secret = randomBytes(32).toString('hex');
    @Module({
      imports: [PassportModule],
      controllers: [ProgressController],
      providers: [
        JwtStrategy,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => (key === 'JWT_SECRET' ? secret : undefined),
          },
        },
        { provide: ProgressService, useValue: service },
      ],
    })
    class TestModule {}
    app = await NestFactory.create(TestModule, { logger: false });
    app.setGlobalPrefix('dream');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    app.useGlobalInterceptors(new ResponseWrapInterceptor(new Reflector()));
    await app.listen(0, '127.0.0.1');
    const url = `${await app.getUrl()}/dream/v1/progress`;
    const jwt = new JwtService({ secret });
    const auth = {
      Authorization: `Bearer ${jwt.sign({ sub: other.id })}`,
      'content-type': 'application/json',
    };
    assert.equal((await fetch(`${url}/overview`)).status, 401);
    assert.equal(
      (
        await fetch(`${url}/overview`, {
          headers: { Authorization: 'Bearer invalid' },
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await fetch(`${url}/overview`, {
          headers: {
            Authorization: `Bearer ${jwt.sign({ sub: other.id }, { expiresIn: -1 })}`,
          },
        })
      ).status,
      401,
    );
    const response = await fetch(`${url}/overview?userId=${user.id}`, {
      headers: auth,
    });
    assert.equal(response.status, 200, '合法 JWT 应能访问当前用户概览');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal((await response.json()).data.metrics.recordCount, 5000);
    for (const level of [0, 7, 1.5, '2']) {
      assert.equal(
        (
          await fetch(`${url}/ack-level`, {
            method: 'POST',
            headers: auth,
            body: JSON.stringify({ level }),
          })
        ).status,
        400,
      );
    }
    assert.equal(
      (
        await fetch(`${url}/ack-level`, {
          method: 'POST',
          headers: auth,
          body: JSON.stringify({ level: 6 }),
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await fetch(`${url}/ack-level`, {
          method: 'POST',
          headers: auth,
          body: JSON.stringify({ level: 3, userId: user.id }),
        })
      ).status,
      201,
    );
    await source.getRepository(User).update(other.id, { status: 'deleted' });
    assert.equal(
      (await fetch(`${url}/overview`, { headers: auth })).status,
      401,
    );
    console.log(
      '通过：真实 JWT、失效 token、账号注销、DTO 校验、用户隔离及响应包装',
    );
  } finally {
    try {
      if (app) await app.close();
    } finally {
      try {
        if (source?.isInitialized) await source.destroy();
      } finally {
        if (admin) {
          try {
            if (created) await admin.query(`DROP DATABASE \`${database}\``);
          } finally {
            await admin.end();
          }
        }
      }
    }
  }
}

main().catch((error) => {
  console.error('成长集成测试失败:', error.message);
  process.exitCode = 1;
});
