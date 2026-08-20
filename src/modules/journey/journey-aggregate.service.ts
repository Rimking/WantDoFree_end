import { Injectable } from '@nestjs/common';
import { JourneyService } from './journey.service';
import { RecordingService } from '../recording/recording.service';
import { ExpenseService } from '../expense/expense.service';
import { GuideService } from '../guide/guide.service';
import {
  JourneyDetailInclude,
  JourneyListBodyDto,
} from './journey-api.dto';
import { formatDateTime } from '../../common/datetime.util';

const DEFAULT_INCLUDE: JourneyDetailInclude[] = [
  'entries',
  'plan',
  'expense',
];

/**
 * 聚合 / 模块化响应（与盘点文档 §3 对齐）。
 * 单查接口返回的模块对象与此处同构。
 */
@Injectable()
export class JourneyAggregateService {
  constructor(
    private readonly journey: JourneyService,
    private readonly recording: RecordingService,
    private readonly expense: ExpenseService,
    private readonly guide: GuideService,
  ) {}

  /** 列表：扁平卡片项 + 分页（type/keyword/时间区间筛选） */
  async listModular(userId: string, body: JourneyListBodyDto) {
    const page = body.page ?? 1;
    const pageSize = body.pageSize ?? 20;
    const all = await this.journey.listFiltered(userId, {
      status: body.status,
      displayStatus: body.displayStatus,
      type: body.type,
      keyword: body.keyword,
      startTime: body.startTime,
      endTime: body.endTime,
      sortBy: body.sortBy,
    });
    const total = all.length;
    const slice = all.slice((page - 1) * pageSize, page * pageSize);
    return {
      list: slice.map((item) => this.journey.toListCardItem(item)),
      total,
      page,
      pageSize,
    };
  }

  /** 详情聚合：根上只有模块 key */
  async detail(
    userId: string,
    journeyId: string,
    include?: JourneyDetailInclude[],
  ) {
    const inc = include?.length ? include : DEFAULT_INCLUDE;
    const set = new Set(inc);

    const flat = await this.journey.detail(userId, journeyId);
    const journey = this.journey.toJourneyModule(flat);
    const journeyStats = this.journey.toJourneyStatsModule(flat);
    const planProgress = this.journey.toPlanProgressModule(flat);
    const handbook = this.journey.toHandbookModule(flat);

    const out: Record<string, unknown> = {
      journey,
      journeyStats,
      planProgress,
      handbook,
    };

    if (set.has('plan')) {
      out.plan = this.journey.toPlanModule(
        await this.journey.getPlan(userId, journeyId),
      );
    }
    if (set.has('entries')) {
      const entries = await this.recording.listByJourney(userId, journeyId);
      out.entries = entries.map((e) =>
        this.recording.toEntryModule(e),
      );
    }
    if (set.has('expense')) {
      const exp = await this.expense.summary(userId, journeyId);
      out.expense = this.expense.toExpenseModule(exp);
    }
    if (set.has('guide')) {
      // 详情聚合不带资格信息：前端走独立 guideApi.check（POST /journeys/guide/get）获取
      out.guide = await this.guide.getForAggregate(userId, journeyId, false);
    }

    return out;
  }

  // ─── 旅程详情页（item/detail）lean 聚合 ───────────────────────────

  async itemDetail(userId: string, journeyId: string) {
    const [j, plan, records, expenseRaw] = await Promise.all([
      this.journey.getJourneyEntity(userId, journeyId),
      this.journey.getPlan(userId, journeyId),
      this.recording.listByJourney(userId, journeyId),
      this.expense.summary(userId, journeyId),
    ]);

    const placeCount = (plan.places ?? []).length;

    return {
      journey: this.journey.toItemJourney(j, placeCount),
      records: records.map((r) => this.toItemRecord(r)),
      expense: this.toItemExpense(expenseRaw),
      placesByDay: this.buildPlacesByDay(
        plan.places ?? [],
        records,
        j.startDate,
      ),
    };
  }

  /** 记录 → 轻量时间轴项（不碰 toEntryModule 共享序列化器） */
  private toItemRecord(raw: Record<string, any>) {
    return {
      id: raw.id,
      clientId: raw.clientId ?? null,
      title: raw.content ?? '',
      recordedAt: raw.recordedAt ?? formatDateTime(raw.createdAt),
      dayIndex: raw.dayIndex ?? null,
      location: raw.location
        ? {
            name: raw.location.name ?? null,
            lat: raw.location.lat ?? null,
            lng: raw.location.lng ?? null,
          }
        : null,
      images: raw.images ?? [],
      tags: raw.payload?.tags ?? [],
      voices: (raw.voices ?? []).map((v: any) => ({
        url: v.url,
        durationSec: v.durationSec ?? null,
      })),
      expenseAmountCent: raw.expense?.amountCent ?? 0,
      source: raw.payload?.source ?? null,
      placeClientId: raw.payload?.placeClientId ?? null,
    };
  }

  /** 花费 → 轻量统计 */
  private toItemExpense(raw: Record<string, any>) {
    return {
      totalCent: raw.totalCent ?? raw.total ?? 0,
      count: raw.count ?? 0,
      byCategory: (raw.byCategory ?? []).map((r: any) => ({
        category: r.category,
        amountCent: r.amountCent,
        count: r.count ?? 0,
      })),
    };
  }

  /**
   * 按天地点：合并预定点 + 自由记录定位点（去重），只含有坐标的天。
   * - 预定点：plan.places 中有坐标的点
   * - 自由记录定位点：records 中 location 存在且非 plan_place 占位
   */
  private buildPlacesByDay(
    planPlaces: Record<string, any>[],
    records: Record<string, any>[],
    startDate: string,
  ) {
    const items: Array<{
      dayIndex: number;
      sortKey: string;
      item: Record<string, any>;
    }> = [];

    // 1. 预定点（有坐标才进入地图）
    for (const p of planPlaces) {
      const lat = p.lat ?? p.latitude;
      const lng = p.lng ?? p.longitude;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const di = p.dayIndex ?? this.deriveDayIndex(p.recordedAt, startDate);
      if (di == null) continue;
      items.push({
        dayIndex: di,
        sortKey: p.recordedAt ?? '',
        item: {
          id: p.clientId ?? p.id,
          source: 'plan_place',
          name: p.name ?? '',
          lat,
          lng,
          dayIndex: di,
          recordedAt: p.recordedAt
            ? formatDateTime(p.recordedAt)
            : null,
          category: p.category ?? null,
          intent: p.intent ?? null,
          locationName: p.locationName ?? null,
          note: p.note ?? null,
          coverUrl: p.coverUrl ?? p.cover ?? p.images?.[0] ?? null,
          images: p.images ?? (p.coverUrl ? [p.coverUrl] : []),
        },
      });
    }

    // 2. 自由记录定位点（非 plan_place 且有坐标）
    for (const r of records) {
      const source = r.payload?.source;
      if (source === 'plan_place') continue;
      const loc = r.location;
      if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) continue;
      const di = r.dayIndex ?? this.deriveDayIndex(r.recordedAt, startDate);
      if (di == null) continue;
      const recordedAt = r.recordedAt ?? null;
      items.push({
        dayIndex: di,
        sortKey: recordedAt ?? '',
        item: {
          id: r.id,
          source: 'entry',
          name: loc.name ?? '',
          lat: loc.lat,
          lng: loc.lng,
          dayIndex: di,
          recordedAt,
          category: null,
          intent: null,
          locationName: loc.name ?? null,
          note: null,
          coverUrl: (r.images?.[0]) ?? null,
          images: r.images ?? [],
        },
      });
    }

    // 3. 按 dayIndex → sortKey 排序后分组
    items.sort((a, b) => {
      if (a.dayIndex !== b.dayIndex) return a.dayIndex - b.dayIndex;
      return (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0);
    });

    const groups: Array<{ day: number; daysList: Record<string, any>[] }> = [];
    let currentDay = -1;
    for (const entry of items) {
      if (entry.dayIndex !== currentDay) {
        currentDay = entry.dayIndex;
        groups.push({ day: currentDay, daysList: [] });
      }
      groups[groups.length - 1].daysList.push(entry.item);
    }

    return groups;
  }

  /** 根据 recordedAt 与旅程 startDate 推导 dayIndex（1-based） */
  private deriveDayIndex(
    recordedAt: string | null | undefined,
    startDate: string,
  ): number | null {
    if (!recordedAt) return null;
    const ts = new Date(recordedAt).getTime();
    const ss = new Date(startDate + 'T00:00:00').getTime();
    if (Number.isNaN(ts) || Number.isNaN(ss)) return null;
    const diff = Math.floor((ts - ss) / 86400000);
    return diff >= 0 ? diff + 1 : null;
  }

  // ─── 游记预览页（handbook/detail）lean 聚合 ───────────────────────

  async handbookDetail(userId: string, journeyId: string) {
    const [j, plan, records] = await Promise.all([
      this.journey.getJourneyEntity(userId, journeyId),
      this.journey.getPlan(userId, journeyId),
      this.recording.listByJourney(userId, journeyId),
    ]);

    return {
      journey: this.journey.toHandbookJourney(j),
      records: records.map((r) => this.toHandbookRecord(r, j.startDate)),
      planPlaces: this.toHandbookPlaces(plan.places ?? [], j.startDate),
    };
  }

  /** 记录 → 游记预览轻量时间轴项（content/时间/地点名/图片/花费分类） */
  private toHandbookRecord(raw: Record<string, any>, startDate: string) {
    return {
      id: raw.id,
      content: raw.content ?? '',
      recordedAt: raw.recordedAt ?? formatDateTime(raw.createdAt),
      dayIndex:
        raw.dayIndex ?? this.deriveDayIndex(raw.recordedAt, startDate) ?? null,
      location: raw.location?.name ? { name: raw.location.name } : null,
      images: raw.images ?? [],
      expenses: (raw.expenses ?? []).map((x: any) => ({
        amountCent: x.amountCent,
        category: x.category,
      })),
    };
  }

  /**
   * 预定点 → 游记站点列表（无 name 的点不进网格）。
   * 排序：dayIndex 升序 → name 字典序（null dayIndex 排最后）。
   */
  private toHandbookPlaces(places: Record<string, any>[], startDate: string) {
    return places
      .filter((p) => String(p.name ?? '').trim())
      .map((p) => ({
        id: p.clientId ?? p.id,
        name: String(p.name).trim(),
        dayIndex:
          p.dayIndex ?? this.deriveDayIndex(p.recordedAt, startDate) ?? null,
        lat: p.lat ?? p.latitude ?? null,
        lng: p.lng ?? p.longitude ?? null,
        coverUrl: p.coverUrl ?? p.cover ?? p.images?.[0] ?? null,
        images: p.images ?? (p.coverUrl ? [p.coverUrl] : []),
        locationName: p.locationName ?? null,
      }))
      .sort((a, b) => {
        const da = a.dayIndex ?? Number.MAX_SAFE_INTEGER;
        const db = b.dayIndex ?? Number.MAX_SAFE_INTEGER;
        if (da !== db) return da - db;
        return String(a.name).localeCompare(String(b.name), 'zh-Hans-CN');
      });
  }

  async getModular(userId: string, id: string) {
    const flat = await this.journey.detail(userId, id);
    return {
      journey: this.journey.toJourneyModule(flat),
      journeyStats: this.journey.toJourneyStatsModule(flat),
      planProgress: this.journey.toPlanProgressModule(flat),
      handbook: this.journey.toHandbookModule(flat),
    };
  }
}
