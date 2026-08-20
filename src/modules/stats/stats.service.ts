import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Journey } from '../../entities/journey.entity';
import { Entry } from '../../entities/entry.entity';
import { Expense } from '../../entities/expense.entity';
import { Location } from '../../entities/location.entity';
import { Media } from '../../entities/media.entity';
import { ChecklistItem } from '../../entities/checklist-item.entity';
import { Guide } from '../../entities/guide.entity';
import { User } from '../../entities/user.entity';
import { UserStatsSnapshot } from '../../entities/user-stats-snapshot.entity';
import {
  normalizeExpenseCategory,
  normalizeStatus,
} from '../../common/enums/catalog';
import { StatsRange, StatsRangeQueryDto, RangeType } from './stats.dto';

@Injectable()
export class StatsService {
  constructor(
    @InjectRepository(Journey) private readonly journeys: Repository<Journey>,
    @InjectRepository(Entry) private readonly entries: Repository<Entry>,
    @InjectRepository(Expense) private readonly expenses: Repository<Expense>,
    @InjectRepository(Location) private readonly locations: Repository<Location>,
    @InjectRepository(Media) private readonly media: Repository<Media>,
    @InjectRepository(ChecklistItem)
    private readonly checklist: Repository<ChecklistItem>,
    @InjectRepository(Guide) private readonly guides: Repository<Guide>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(UserStatsSnapshot)
    private readonly snapshots: Repository<UserStatsSnapshot>,
  ) {}

  private ok<T>(data: T, range: StatsRange) {
    return { code: 0 as const, message: 'ok', data, range };
  }

  private todayYmd() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  /** 解析 range → [startYmd, endYmd]；all 时两端为 null */
  resolveRange(q: StatsRangeQueryDto): StatsRange & {
    startAt: string | null;
    endAt: string | null;
  } {
    const type = (q.rangeType ?? 'all') as RangeType;
    const today = this.todayYmd();

    if (type === 'all') {
      return { type, start: null, end: null, startAt: null, endAt: null };
    }

    if (type === 'year') {
      const year = q.start?.slice(0, 4) || String(new Date().getFullYear());
      if (!/^\d{4}$/.test(year)) {
        throw new BadRequestException({
          code: 400,
          message: 'year 范围需提供 start=YYYY 或合法年份',
        });
      }
      return {
        type,
        start: `${year}-01-01`,
        end: `${year}-12-31`,
        startAt: `${year}-01-01 00:00:00`,
        endAt: `${year}-12-31 23:59:59`,
      };
    }

    if (type === 'month') {
      const ym = q.start?.slice(0, 7) || today.slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(ym)) {
        throw new BadRequestException({
          code: 400,
          message: 'month 范围需提供 start=YYYY-MM',
        });
      }
      const [y, m] = ym.split('-').map(Number);
      const last = new Date(y, m, 0).getDate();
      const end = `${ym}-${String(last).padStart(2, '0')}`;
      return {
        type,
        start: `${ym}-01`,
        end,
        startAt: `${ym}-01 00:00:00`,
        endAt: `${end} 23:59:59`,
      };
    }

    // custom
    if (!q.start || !q.end) {
      throw new BadRequestException({
        code: 400,
        message: 'custom 范围必须同时提供 start 与 end（YYYY-MM-DD）',
      });
    }
    if (q.end < q.start) {
      throw new BadRequestException({
        code: 400,
        message: 'end 不能早于 start',
      });
    }
    const startMs = new Date(q.start + 'T00:00:00').getTime();
    const endMs = new Date(q.end + 'T00:00:00').getTime();
    const days = Math.floor((endMs - startMs) / 86400000) + 1;
    if (days > 366 * 2) {
      throw new BadRequestException({
        code: 400,
        message: '自定义时间跨度不能超过 2 年',
      });
    }
    return {
      type,
      start: q.start,
      end: q.end,
      startAt: `${q.start} 00:00:00`,
      endAt: `${q.end} 23:59:59`,
    };
  }

  private async assertJourney(userId: string, journeyId?: string) {
    if (!journeyId) return null;
    const j = await this.journeys.findOne({
      where: { id: journeyId, userId },
    });
    if (!j) {
      throw new NotFoundException({
        code: 404,
        message: '旅程不存在或无权访问',
      });
    }
    return j;
  }

  private journeyDays(startDate: string, endDate: string) {
    const s = new Date(startDate + 'T00:00:00');
    const e = new Date(endDate + 'T00:00:00');
    const days =
      Math.floor((e.getTime() - s.getTime()) / 86400000) + 1;
    return Math.max(1, days);
  }

  private async userJourneyIds(userId: string, journeyId?: string | null) {
    if (journeyId) return [journeyId];
    const rows = await this.journeys.find({
      where: { userId },
      select: ['id'],
    });
    return rows.map((r) => r.id);
  }

  private applyEntryTime(
    qb: ReturnType<Repository<Entry>['createQueryBuilder']>,
    alias: string,
    startAt: string | null,
    endAt: string | null,
  ) {
    // 优先 recordedAt，空则 createdAt
    const ts = `COALESCE(${alias}.recordedAt, ${alias}.createdAt)`;
    if (startAt) qb.andWhere(`${ts} >= :startAt`, { startAt });
    if (endAt) qb.andWhere(`${ts} <= :endAt`, { endAt });
  }

  private async journeysInScope(
    userId: string,
    range: { start: string | null; end: string | null },
    journeyId?: string,
    statusFilter?: string,
  ) {
    const qb = this.journeys
      .createQueryBuilder('j')
      .where('j.userId = :userId', { userId });
    if (journeyId) qb.andWhere('j.id = :journeyId', { journeyId });
    if (range.start && range.end) {
      qb.andWhere('j.startDate <= :rend', { rend: range.end }).andWhere(
        'j.endDate >= :rstart',
        { rstart: range.start },
      );
    }
    const rows = await qb.getMany();
    if (!statusFilter) return rows;

    return rows.filter((j) => {
      const st = normalizeStatus(j.status) ?? j.status;
      if (statusFilter === 'ongoing') return st === 'ongoing';
      if (statusFilter === 'planning') return st === 'planned';
      if (statusFilter === 'completed') return st === 'finished';
      if (statusFilter === 'draft') return false;
      return true;
    });
  }

  private async distinctPlaceNames(
    userId: string,
    journeyIds: string[],
    startAt: string | null,
    endAt: string | null,
  ) {
    if (!journeyIds.length) return [];
    const qb = this.locations
      .createQueryBuilder('loc')
      .innerJoin('loc.entry', 'entry')
      .innerJoin('entry.journey', 'journey')
      .select('DISTINCT loc.name', 'name')
      .where('journey.userId = :userId', { userId })
      .andWhere('entry.journeyId IN (:...journeyIds)', { journeyIds })
      .andWhere('loc.name IS NOT NULL')
      .andWhere("loc.name != ''");
    this.applyEntryTime(qb as any, 'entry', startAt, endAt);
    const raw = await qb.getRawMany();
    return raw.map((r) => String(r.name).trim()).filter(Boolean);
  }

  /** 城市足迹 + 定位占比：entry.city 去重城市数 / 带 location 的 entry 占比（含时间范围） */
  private async cityStats(
    journeyIds: string[],
    startAt: string | null,
    endAt: string | null,
  ) {
    if (!journeyIds.length) {
      return { cityFootprint: 0, locatedRatio: 0, recordCount: 0 };
    }
    const qb = this.entries
      .createQueryBuilder('e')
      .leftJoin('e.location', 'loc')
      .select('e.city', 'city')
      .addSelect('COUNT(DISTINCT e.id)', 'cnt')
      .addSelect(
        'COUNT(DISTINCT CASE WHEN loc.id IS NOT NULL THEN e.id END)',
        'locatedCnt',
      )
      .where('e.journeyId IN (:...journeyIds)', { journeyIds })
      .groupBy('e.city');
    this.applyEntryTime(qb, 'e', startAt, endAt);
    const rows = await qb.getRawMany();
    const cities = new Set<string>();
    let recordCount = 0;
    let locatedCount = 0;
    for (const r of rows) {
      recordCount += Number(r.cnt) || 0;
      locatedCount += Number(r.locatedCnt) || 0;
      if (r.city != null && String(r.city).trim()) {
        cities.add(String(r.city).trim());
      }
    }
    return {
      cityFootprint: cities.size,
      locatedRatio:
        recordCount > 0 ? Number((locatedCount / recordCount).toFixed(4)) : 0,
      recordCount,
    };
  }

  /** 各旅程 entry.city 去重城市集合（含时间范围） */
  private async cityByJourney(
    journeyIds: string[],
    startAt: string | null,
    endAt: string | null,
  ) {
    const map = new Map<string, Set<string>>();
    if (!journeyIds.length) return map;
    const qb = this.entries
      .createQueryBuilder('e')
      .select('e.journeyId', 'journeyId')
      .addSelect('e.city', 'city')
      .where('e.journeyId IN (:...journeyIds)', { journeyIds })
      .andWhere("e.city IS NOT NULL AND TRIM(e.city) != ''")
      .groupBy('e.journeyId')
      .addGroupBy('e.city');
    this.applyEntryTime(qb, 'e', startAt, endAt);
    const raw = await qb.getRawMany();
    for (const r of raw) {
      const id = String(r.journeyId);
      if (!map.has(id)) map.set(id, new Set());
      map.get(id)!.add(String(r.city).trim());
    }
    return map;
  }

  private async computeStreak(userId: string, journeyIds: string[]) {
    if (!journeyIds.length) return 0;
    const raw = await this.entries
      .createQueryBuilder('e')
      .select('DATE(COALESCE(e.recordedAt, e.createdAt))', 'd')
      .where('e.journeyId IN (:...journeyIds)', { journeyIds })
      .groupBy('DATE(COALESCE(e.recordedAt, e.createdAt))')
      .orderBy('d', 'DESC')
      .getRawMany();
    const days = raw.map((r) => String(r.d).slice(0, 10)).filter(Boolean);
    if (!days.length) return 0;

    const today = this.todayYmd();
    // 从今天或最近有记录的一天往前连
    let cursor = days[0] <= today ? days[0] : today;
    if (!days.includes(cursor) && days[0] < today) {
      // 最近一天不是今天，从最近一天开始算 streak
      cursor = days[0];
    } else if (!days.includes(today) && days[0] !== today) {
      // 今天没记，streak 仍从最近一天算（含断档当天为 0 的产品选择：从最近一天）
      cursor = days[0];
    }

    const set = new Set(days);
    let streak = 0;
    let d = cursor;
    while (set.has(d)) {
      streak += 1;
      const dt = new Date(d + 'T00:00:00');
      dt.setDate(dt.getDate() - 1);
      const y = dt.getFullYear();
      const m = String(dt.getMonth() + 1).padStart(2, '0');
      const day = String(dt.getDate()).padStart(2, '0');
      d = `${y}-${m}-${day}`;
    }
    return streak;
  }

  /** 写入 / 刷新当日快照（overview 后调用） */
  async refreshSnapshot(userId: string) {
    const range = this.resolveRange({ rangeType: 'all' });
    const overview = await this.buildOverview(userId, range, undefined);
    const date = this.todayYmd();
    let row = await this.snapshots.findOne({ where: { userId, date } });
    if (!row) {
      row = this.snapshots.create({ userId, date });
    }
    row.totalRecords = overview.totalRecords;
    row.totalDays = overview.totalDays;
    row.totalPlaces = overview.totalPlaces;
    row.streakDays = overview.streakDays ?? 0;
    row.totalExpense = String(overview.totalExpense);
    await this.snapshots.save(row);
    return row;
  }

  private async buildOverview(
    userId: string,
    range: ReturnType<StatsService['resolveRange']>,
    journeyId?: string,
  ) {
    await this.assertJourney(userId, journeyId);
    const journeys = await this.journeysInScope(
      userId,
      range,
      journeyId,
    );
    const journeyIds = journeys.map((j) => j.id);

    let totalRecords = 0;
    if (journeyIds.length) {
      const qb = this.entries
        .createQueryBuilder('e')
        .where('e.journeyId IN (:...journeyIds)', { journeyIds });
      this.applyEntryTime(qb, 'e', range.startAt, range.endAt);
      totalRecords = await qb.getCount();
    }

    const totalDays = journeys.reduce(
      (s, j) => s + this.journeyDays(j.startDate, j.endDate),
      0,
    );

    let totalExpense = 0;
    if (journeyIds.length) {
      const qb = this.expenses
        .createQueryBuilder('x')
        .innerJoin('x.entry', 'e')
        .select('COALESCE(SUM(x.amountCent),0)', 'sum')
        .where('e.journeyId IN (:...journeyIds)', { journeyIds });
      this.applyEntryTime(qb as any, 'e', range.startAt, range.endAt);
      const raw = await qb.getRawOne();
      totalExpense = Number(raw?.sum ?? 0);
    }

    const places = await this.distinctPlaceNames(
      userId,
      journeyIds,
      range.startAt,
      range.endAt,
    );
    const streakDays = await this.computeStreak(userId, journeyIds);

    const insight = `你已记录 ${totalRecords} 条，走过 ${places.length} 个地方`;

    return {
      totalRecords,
      totalDays,
      totalExpense,
      totalPlaces: places.length,
      /** 足迹城市数：自由打卡 location.name 去重（非 journey.destination） */
      footprintCities: places.length,
      streakDays,
      insight,
    };
  }

  async overview(userId: string, q: StatsRangeQueryDto) {
    const range = this.resolveRange(q);
    const data = await this.buildOverview(userId, range, q.journeyId);
    // all 范围时刷新当日快照
    if (range.type === 'all' && !q.journeyId) {
      void this.refreshSnapshot(userId).catch(() => undefined);
    }
    return this.ok(data, {
      type: range.type,
      start: range.start,
      end: range.end,
    });
  }

  async expenseStats(userId: string, q: StatsRangeQueryDto) {
    const range = this.resolveRange(q);
    await this.assertJourney(userId, q.journeyId);
    const journeyIds = await this.userJourneyIds(userId, q.journeyId);
    if (!journeyIds.length) {
      return this.ok(
        {
          total: 0,
          totalCent: 0,
          count: 0,
          currency: 'CNY',
          byCategory: [],
          trend: [],
          byJourney: [],
        },
        { type: range.type, start: range.start, end: range.end },
      );
    }

    const base = () => {
      const qb = this.expenses
        .createQueryBuilder('x')
        .innerJoin('x.entry', 'e')
        .innerJoin('e.journey', 'j')
        .where('j.userId = :userId', { userId })
        .andWhere('e.journeyId IN (:...journeyIds)', { journeyIds });
      this.applyEntryTime(qb as any, 'e', range.startAt, range.endAt);
      return qb;
    };

    const byCatRaw = await base()
      .select('x.category', 'category')
      .addSelect('SUM(x.amountCent)', 'amountCent')
      .addSelect('COUNT(*)', 'cnt')
      .groupBy('x.category')
      .getRawMany();

    const trendRaw = await base()
      .select('DATE(COALESCE(e.recordedAt, e.createdAt))', 'date')
      .addSelect('SUM(x.amountCent)', 'amountCent')
      .groupBy('DATE(COALESCE(e.recordedAt, e.createdAt))')
      .orderBy('date', 'ASC')
      .getRawMany();

    const byJourneyRaw = await base()
      .select('j.id', 'journeyId')
      .addSelect('j.title', 'name')
      .addSelect('SUM(x.amountCent)', 'amountCent')
      .addSelect('COUNT(*)', 'cnt')
      .groupBy('j.id')
      .addGroupBy('j.title')
      .getRawMany();

    const totalCent = byCatRaw.reduce((s, r) => s + Number(r.amountCent), 0);
    const count = byCatRaw.reduce((s, r) => s + Number(r.cnt), 0);

    const byCategory = byCatRaw.map((r) => {
      const amountCent = Number(r.amountCent);
      let category = normalizeExpenseCategory(r.category) ?? r.category;
      // 文档 hotel → 规范 stay
      if (category === 'hotel') category = 'stay';
      return {
        category,
        amountCent,
        amount: amountCent,
        count: Number(r.cnt),
        ratio: totalCent ? Number((amountCent / totalCent).toFixed(4)) : 0,
      };
    });

    return this.ok(
      {
        totalCent,
        total: totalCent,
        count,
        currency: 'CNY',
        byCategory,
        trend: trendRaw.map((r) => {
          const amountCent = Number(r.amountCent);
          return {
            date: String(r.date).slice(0, 10),
            amountCent,
            amount: amountCent,
          };
        }),
        byJourney: byJourneyRaw.map((r) => {
          const amountCent = Number(r.amountCent);
          return {
            journeyId: r.journeyId,
            name: r.name,
            amountCent,
            amount: amountCent,
            count: Number(r.cnt),
          };
        }),
      },
      { type: range.type, start: range.start, end: range.end },
    );
  }

  async plans(userId: string, q: StatsRangeQueryDto) {
    const range = this.resolveRange(q);
    await this.assertJourney(userId, q.journeyId);
    const journeys = await this.journeysInScope(
      userId,
      range,
      q.journeyId,
    );
    const journeyIds = journeys.map((j) => j.id);

    if (!journeyIds.length) {
      return this.ok(
        {
          preTripDoneRate: 0,
          cityFootprint: 0,
          locatedRatio: 0,
          recordCount: 0,
          budgetExecutionRate: null,
          journeyRows: [],
        },
        { type: range.type, start: range.start, end: range.end },
      );
    }

    const checkRows = await this.checklist
      .createQueryBuilder('c')
      .where('c.journeyId IN (:...journeyIds)', { journeyIds })
      .andWhere('c.deletedAt IS NULL')
      .getMany();

    const checked = checkRows.filter((c) => c.isChecked).length;
    const preTripDoneRate = checkRows.length
      ? Number((checked / checkRows.length).toFixed(4))
      : 0;

    const city = await this.cityStats(
      journeyIds,
      range.startAt,
      range.endAt,
    );
    const cityMap = await this.cityByJourney(
      journeyIds,
      range.startAt,
      range.endAt,
    );

    let spent = 0;
    const qb = this.expenses
      .createQueryBuilder('x')
      .innerJoin('x.entry', 'e')
      .select('COALESCE(SUM(x.amountCent),0)', 'sum')
      .where('e.journeyId IN (:...journeyIds)', { journeyIds });
    this.applyEntryTime(qb as any, 'e', range.startAt, range.endAt);
    spent = Number((await qb.getRawOne())?.sum ?? 0);

    const budgetSum = journeys.reduce(
      (s, j) => s + (j.budgetAmount != null ? Number(j.budgetAmount) : 0),
      0,
    );
    const budgetExecutionRate =
      budgetSum > 0 ? Number((spent / budgetSum).toFixed(4)) : null;

    const journeyRows: Array<{
      journeyId: string;
      name: string;
      prepDone: number;
      prepTotal: number;
      cityCount: number;
      score: number;
    }> = [];

    for (const j of journeys) {
      const checkItems = checkRows.filter((c) => c.journeyId === j.id);
      const prepTotal = checkItems.length;
      const prepDone = checkItems.filter((c) => c.isChecked).length;
      const cityCount = cityMap.get(j.id)?.size ?? 0;
      const prepRate = prepTotal > 0 ? prepDone / prepTotal : 1;
      const score = Math.round(prepRate * 100);
      journeyRows.push({
        journeyId: j.id,
        name: j.title,
        prepDone,
        prepTotal,
        cityCount,
        score,
      });
    }

    return this.ok(
      {
        preTripDoneRate,
        cityFootprint: city.cityFootprint,
        locatedRatio: city.locatedRatio,
        recordCount: city.recordCount,
        budgetExecutionRate,
        journeyRows,
      },
      { type: range.type, start: range.start, end: range.end },
    );
  }

  async journeysStats(userId: string, q: StatsRangeQueryDto) {
    const range = this.resolveRange(q);
    const journeys = await this.journeysInScope(
      userId,
      range,
      undefined,
      q.status,
    );

    const totalByStatus = {
      ongoing: 0,
      planning: 0,
      completed: 0,
      draft: 0,
    };
    // 状态计数用范围内全部旅程（不受 status 筛选影响展示分布）
    const allInRange = q.status
      ? await this.journeysInScope(userId, range)
      : journeys;
    for (const j of allInRange) {
      const st = normalizeStatus(j.status) ?? j.status;
      if (st === 'ongoing') totalByStatus.ongoing += 1;
      else if (st === 'planned') totalByStatus.planning += 1;
      else if (st === 'finished') totalByStatus.completed += 1;
    }

    const scoped = journeys;
    const totalDays = scoped.reduce(
      (s, j) => s + this.journeyDays(j.startDate, j.endDate),
      0,
    );
    const journeyIds = scoped.map((j) => j.id);
    const places = await this.distinctPlaceNames(
      userId,
      journeyIds,
      range.startAt,
      range.endAt,
    );

    // 完成度分桶：0-25 / 25-50 / 50-75 / 75-100（基于 checklist）+ 分旅程明细
    let completionDist: number[] | null = [0, 0, 0, 0];
    const journeyItems: Array<{
      id: string;
      title: string;
      status: string;
      startDate: string;
      endDate: string;
      completionPct: number;
    }> = [];

    if (scoped.length) {
      for (const j of scoped) {
        const items = await this.checklist.find({
          where: { journeyId: j.id, deletedAt: IsNull() },
        });
        const rate = items.length
          ? items.filter((i) => i.isChecked).length / items.length
          : 0;
        const pct = Math.round(rate * 100);
        journeyItems.push({
          id: j.id,
          title: j.title,
          status: normalizeStatus(j.status) ?? j.status,
          startDate: j.startDate,
          endDate: j.endDate,
          completionPct: pct,
        });
        if (pct < 25) completionDist[0] += 1;
        else if (pct < 50) completionDist[1] += 1;
        else if (pct < 75) completionDist[2] += 1;
        else completionDist[3] += 1;
      }
    } else {
      completionDist = [0, 0, 0, 0];
    }

    return this.ok(
      {
        totalByStatus,
        totalDays,
        totalPlaces: places.length,
        completionDist,
        journeys: journeyItems,
      },
      { type: range.type, start: range.start, end: range.end },
    );
  }

  async content(userId: string, q: StatsRangeQueryDto) {
    const range = this.resolveRange(q);
    const journeyIds = await this.userJourneyIds(userId, undefined);
    if (!journeyIds.length) {
      return this.ok(
        {
          recordCount: 0,
          avgPerDay: 0,
          photoCount: 0,
          voiceSeconds: 0,
          wordCount: 0,
          handbookCount: 0,
        },
        { type: range.type, start: range.start, end: range.end },
      );
    }

    const qb = this.entries
      .createQueryBuilder('e')
      .where('e.journeyId IN (:...journeyIds)', { journeyIds });
    this.applyEntryTime(qb, 'e', range.startAt, range.endAt);
    const entries = await qb.getMany();
    const recordCount = entries.length;

    const daySet = new Set(
      entries.map((e) => {
        const at = e.recordedAt ?? e.createdAt;
        return new Date(at).toISOString().slice(0, 10);
      }),
    );
    const avgPerDay = daySet.size
      ? Number((recordCount / daySet.size).toFixed(2))
      : 0;

    const entryIds = entries.map((e) => e.id);
    let photoCount = 0;
    let voiceSeconds = 0;
    if (entryIds.length) {
      photoCount = await this.media
        .createQueryBuilder('m')
        .where('m.ownerType = :ot', { ot: 'entry' })
        .andWhere('m.ownerId IN (:...entryIds)', { entryIds })
        .andWhere('m.kind IN (:...kinds)', { kinds: ['image', 'photo'] })
        .andWhere('m.status = :st', { st: 'active' })
        .getCount();

      const voiceRows = await this.media
        .createQueryBuilder('m')
        .where('m.ownerType = :ot', { ot: 'entry' })
        .andWhere('m.ownerId IN (:...entryIds)', { entryIds })
        .andWhere('m.kind IN (:...kinds)', { kinds: ['audio', 'voice'] })
        .andWhere('m.status = :st', { st: 'active' })
        .getMany();
      const entryMap = new Map(entries.map((e) => [e.id, e]));
      for (const v of voiceRows) {
        const e = entryMap.get(v.ownerId!);
        const sec = Number(
          v.durationSec ?? (e?.payload as any)?.durationSec ?? 0,
        );
        const bytes =
          typeof v.sizeBytes === 'number'
            ? v.sizeBytes
            : Number(v.sizeBytes) || 0;
        voiceSeconds += sec > 0 ? sec : Math.max(1, Math.ceil(bytes / 1024));
      }
    }

    const wordCount = entries.reduce(
      (s, e) => s + (e.content ? [...e.content].length : 0),
      0,
    );

    const handbookCount = await this.guides
      .createQueryBuilder('g')
      .innerJoin('g.journey', 'j')
      .where('j.userId = :userId', { userId })
      .getCount();

    return this.ok(
      {
        recordCount,
        avgPerDay,
        photoCount,
        voiceSeconds,
        wordCount,
        handbookCount,
      },
      { type: range.type, start: range.start, end: range.end },
    );
  }

  async storage(userId: string) {
    const u = await this.users.findOne({ where: { id: userId } });
    if (!u) {
      throw new NotFoundException({ code: 404, message: '用户不存在' });
    }
    const photoUsed = u.usedPhoto ?? 0;
    const photoLimit = u.quotaPhoto ?? 0;
    const voiceUsed = u.usedVoiceSec ?? 0;
    const voiceLimit = u.quotaVoiceSec ?? 0;
    return this.ok(
      {
        photo: {
          used: photoUsed,
          limit: photoLimit,
          ratio: photoLimit
            ? Number((photoUsed / photoLimit).toFixed(4))
            : 0,
        },
        voice: {
          usedSeconds: voiceUsed,
          limitSeconds: voiceLimit,
          ratio: voiceLimit
            ? Number((voiceUsed / voiceLimit).toFixed(4))
            : 0,
        },
      },
      { type: 'all', start: null, end: null },
    );
  }
}
