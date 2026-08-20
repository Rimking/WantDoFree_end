import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Repository } from 'typeorm';
import { createHash } from 'crypto';
import { Journey } from '../../entities/journey.entity';
import { JourneyPlan } from '../../entities/journey-plan.entity';
import type { PlanPlace, PlanPlaceIntent } from '../../entities/journey-plan.entity';
import { Expense } from '../../entities/expense.entity';
import { Entry } from '../../entities/entry.entity';
import { Location } from '../../entities/location.entity';
import { ChecklistItem } from '../../entities/checklist-item.entity';
import { Guide } from '../../entities/guide.entity';
import { Share } from '../../entities/share.entity';
import { ShareEvent } from '../../entities/share-event.entity';
import {
  CreateJourneyDto,
  PatchPlanDto,
  UpdateJourneyDto,
  UpdateStatusDto,
  UpsertPlanDto,
} from './journey.dto';
import { PlanPlaceCreateBodyDto } from './journey-api.dto';
import {
  DEFAULT_PLAN_CHECKS,
  JourneyStatus,
  normalizeCompanion,
  normalizeStatus,
  normalizeThemeTag,
} from '../../common/enums/catalog';
import { formatDateTime } from '../../common/datetime.util';
import {
  HANDBOOK_MIN_RECORDS,
  HandbookPhase,
  resolveHandbookPhase,
} from '../../common/handbook';
import { ChecklistService } from '../checklist/checklist.service';

/** 相邻双向跃迁（规范值 planned/ongoing/finished） */
const ALLOWED: Record<JourneyStatus, JourneyStatus[]> = {
  planned: ['ongoing'],
  ongoing: ['planned', 'finished'],
  finished: ['ongoing'],
};

@Injectable()
export class JourneyService {
  private readonly logger = new Logger(JourneyService.name);

  constructor(
    @InjectRepository(Journey) private readonly journeys: Repository<Journey>,
    @InjectRepository(JourneyPlan)
    private readonly plans: Repository<JourneyPlan>,
    @InjectRepository(Expense) private readonly expenses: Repository<Expense>,
    @InjectRepository(Entry) private readonly entries: Repository<Entry>,
    @InjectRepository(ChecklistItem)
    private readonly checklistItems: Repository<ChecklistItem>,
    @InjectRepository(Guide) private readonly guides: Repository<Guide>,
    @InjectRepository(Share) private readonly shares: Repository<Share>,
    @InjectRepository(ShareEvent)
    private readonly shareEvents: Repository<ShareEvent>,
    private readonly checklist: ChecklistService,
    private readonly dataSource: DataSource,
  ) {}

  private async owned(userId: string, id: string) {
    const j = await this.journeys.findOne({ where: { id, userId } });
    if (!j) throw new NotFoundException('journey not found');
    return j;
  }

  /** 公开的 owned 封装，供 aggregate 层用 */
  async getJourneyEntity(userId: string, id: string): Promise<Journey> {
    return this.owned(userId, id);
  }

  private normalizeTags(raw?: string[]) {
    if (!raw) return undefined;
    return [...new Set(raw.map((t) => normalizeThemeTag(t)!))];
  }

  private normalizeCompanions(raw?: string[]) {
    if (!raw) return undefined;
    return [...new Set(raw.map((c) => normalizeCompanion(c)!))];
  }

  private normalizeWrite(
    dto: CreateJourneyDto | UpdateJourneyDto,
  ): Partial<Journey> {
    const coverUrl = dto.coverUrl ?? dto.cover;
    const budgetAmount = dto.budgetAmount ?? dto.budgetLimit;
    const themeTags = this.normalizeTags(dto.themeTags ?? dto.themes);
    const companions = this.normalizeCompanions(dto.companions);

    const out: Partial<Journey> = {};
    if ('title' in dto && dto.title !== undefined) out.title = dto.title;
    if ('origin' in dto && dto.origin !== undefined) out.origin = dto.origin;
    if ('startDate' in dto && dto.startDate !== undefined) {
      out.startDate = dto.startDate;
    }
    if ('endDate' in dto && dto.endDate !== undefined) out.endDate = dto.endDate;
    if (coverUrl !== undefined) out.coverUrl = coverUrl;
    if (themeTags !== undefined) out.themeTags = themeTags;
    if (companions !== undefined) out.companions = companions;
    if (budgetAmount !== undefined) out.budgetAmount = budgetAmount;
    if ('isPublic' in dto && dto.isPublic !== undefined) {
      out.isPublic = dto.isPublic;
    }
    return out;
  }

  private nightsBetween(start: string, end: string) {
    const s = new Date(start);
    const e = new Date(end);
    const ms = e.getTime() - s.getTime();
    if (Number.isNaN(ms) || ms < 0) return { days: 0, nights: 0 };
    const days = Math.floor(ms / 86400000) + 1;
    const nights = Math.max(0, days - 1);
    return { days, nights };
  }

  private async expenseSnapshot(journeyId: string) {
    const raw = await this.expenses
      .createQueryBuilder('e')
      .leftJoin('e.entry', 'entry')
      .select('COALESCE(SUM(e.amountCent), 0)', 'totalCent')
      .where('entry.journeyId = :journeyId', { journeyId })
      .getRawOne();
    const total = Number(raw?.totalCent ?? 0);
    return { totalExpenseCent: total, expenseTotal: total };
  }

  private async entryCount(journeyId: string) {
    return this.entries.count({ where: { journeyId } });
  }

  /** placeCount = plan.places.length（预定点；不含自由打卡） */
  private async placeCount(journeyId: string, plan?: JourneyPlan | null) {
    const p = plan ?? (await this.plans.findOne({ where: { journeyId } }));
    return (p?.places ?? []).length;
  }

  private async planProgressOf(journeyId: string, plan?: JourneyPlan | null) {
    const items = await this.checklistItems.find({
      where: { journeyId, deletedAt: IsNull() },
    });
    if (items.length) {
      const confirmedCount = items.filter((c) => c.isChecked).length;
      return {
        planProgress: Math.round((confirmedCount / items.length) * 100),
        confirmedCount,
        checkTotal: items.length,
      };
    }
    const checks = plan?.checks ?? [];
    if (!checks.length) {
      return { planProgress: 0, confirmedCount: 0, checkTotal: 0 };
    }
    const confirmedCount = checks.filter((c) => c.done).length;
    return {
      planProgress: Math.round((confirmedCount / checks.length) * 100),
      confirmedCount,
      checkTotal: checks.length,
    };
  }

  /** 本地日历日 YYYY-MM-DD（按服务器本地时区） */
  private todayYmd() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private addDaysYmd(ymd: string, days: number) {
    const d = new Date(ymd + 'T00:00:00');
    d.setDate(d.getDate() + days);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  /**
   * 卡片展示态（只读派生，不落库）
   * planning | departing | ongoing | finished | draft
   */
  private resolveDisplayStatus(
    status: JourneyStatus,
    startDate: string,
    endDate: string,
  ): 'planning' | 'departing' | 'ongoing' | 'finished' | 'draft' {
    if (status === 'finished') return 'finished';
    if (status === 'ongoing') return 'ongoing';
    // planned → planning / departing
    const today = this.todayYmd();
    const limit = this.addDaysYmd(today, 3);
    if (startDate >= today && startDate <= limit && today <= endDate) {
      return 'departing';
    }
    return 'planning';
  }

  private emptyHandbook(recordCount = 0) {
    return {
      phase: resolveHandbookPhase({
        recordCount,
        hasGuide: false,
        hasShared: false,
      }) as HandbookPhase,
      recordCount,
      minRecords: HANDBOOK_MIN_RECORDS,
      hasGuide: false,
      guideId: null as string | null,
      templateId: null as string | null,
      shareSummary: {
        ticketCount: 0,
        eventCount: 0,
        viewCount: 0,
        latestToken: null as string | null,
      },
    };
  }

  /** 批量挂载游记四态（工作台用，避免 N+1） */
  async enrichHandbook(
    items: Array<Record<string, any>>,
  ): Promise<Array<Record<string, any>>> {
    if (!items.length) return items;
    const ids = items.map((i) => i.id as string);
    const [guides, tickets, events] = await Promise.all([
      this.guides.find({ where: { journeyId: In(ids) } }),
      this.shares.find({
        where: { journeyId: In(ids) },
        order: { createdAt: 'DESC' },
      }),
      this.shareEvents.find({ where: { journeyId: In(ids) } }),
    ]);
    const guideOf = new Map(
      guides.filter((g) => g.payload).map((g) => [g.journeyId, g]),
    );
    const ticketsOf = new Map<string, Share[]>();
    for (const s of tickets) {
      const list = ticketsOf.get(s.journeyId) ?? [];
      list.push(s);
      ticketsOf.set(s.journeyId, list);
    }
    const eventsOf = new Map<string, ShareEvent[]>();
    for (const e of events) {
      const list = eventsOf.get(e.journeyId) ?? [];
      list.push(e);
      eventsOf.set(e.journeyId, list);
    }

    for (const item of items) {
      const jid = item.id as string;
      const guide = guideOf.get(jid);
      const shareTickets = ticketsOf.get(jid) ?? [];
      const shareEvents = eventsOf.get(jid) ?? [];
      const eventCount = shareEvents.filter((e) => e.channel !== 'view').length;
      const viewCount = shareEvents.filter((e) => e.channel === 'view').length;
      const hasGuide = Boolean(guide?.payload);
      const hasShared = shareTickets.length > 0 || eventCount > 0;
      const recordCount = Number(item.recordCount ?? item.entryCount ?? 0);
      const phase = resolveHandbookPhase({ recordCount, hasGuide, hasShared });
      item.handbookPhase = phase;
      item.hasGuide = hasGuide;
      item.handbook = {
        phase,
        recordCount,
        minRecords: HANDBOOK_MIN_RECORDS,
        hasGuide,
        guideId: guide?.id ?? null,
        templateId: guide?.template ?? null,
        shareSummary: {
          ticketCount: shareTickets.length,
          eventCount,
          viewCount,
          latestToken: shareTickets[0]?.token ?? null,
        },
      };
    }
    return items;
  }

  /** 单条旅程列表项（含游记四态） */
  private async finalizeItem(j: Journey) {
    const item = await this.toListItem(j);
    await this.enrichHandbook([item]);
    return item;
  }

  private async toListItem(j: Journey) {
    const snap = await this.expenseSnapshot(j.id);
    const { days, nights } = this.nightsBetween(j.startDate, j.endDate);
    const recordCount = await this.entryCount(j.id);
    const plan = await this.ensurePlan(j.id);
    const placeCount = await this.placeCount(j.id, plan);
    const { planProgress, confirmedCount, checkTotal } =
      await this.planProgressOf(j.id, plan);
    const themeTags = (j.themeTags ?? [])
      .map((t) => normalizeThemeTag(t) ?? t)
      .filter(Boolean);
    const companions = (j.companions ?? [])
      .map((c) => normalizeCompanion(c) ?? c)
      .filter(Boolean);
    const status = normalizeStatus(j.status) ?? j.status;
    const displayStatus = this.resolveDisplayStatus(
      status,
      j.startDate,
      j.endDate,
    );
    const handbook = this.emptyHandbook(recordCount);
    return {
      ...j,
      status,
      displayStatus,
      destination: j.destination ?? null,
      themeTags,
      themes: themeTags,
      companions,
      budgetAmount: j.budgetAmount ?? null,
      budgetLimit: j.budgetAmount ?? null,
      coverUrl: j.coverUrl ?? null,
      cover: j.coverUrl ?? null,
      createdAt: formatDateTime(j.createdAt),
      updatedAt: formatDateTime(j.updatedAt),
      days,
      nights,
      entryCount: recordCount,
      recordCount,
      placeCount,
      planProgress,
      confirmedCount,
      checkTotal,
      handbookPhase: handbook.phase,
      hasGuide: handbook.hasGuide,
      handbook,
      ...snap,
    };
  }

  /** 旅程本体模块（单查 / 聚合同构） */
  toJourneyModule(item: Record<string, any>) {
    return {
      id: item.id,
      clientId: item.clientId ?? null,
      title: item.title,
      origin: item.origin,
      destination: item.destination ?? null,
      coverUrl: item.coverUrl ?? null,
      startDate: item.startDate,
      endDate: item.endDate,
      status: item.status,
      displayStatus: item.displayStatus,
      themeTags: item.themeTags ?? [],
      companions: item.companions ?? [],
      budgetAmount: item.budgetAmount ?? null,
      createdAt: formatDateTime(item.createdAt),
      updatedAt: formatDateTime(item.updatedAt),
    };
  }

  /** 旅程详情页（item/detail）轻量旅程信息 */
  toItemJourney(j: Journey, placeCount: number) {
    const status = normalizeStatus(j.status) ?? (j.status as JourneyStatus);
    const displayStatus = this.resolveDisplayStatus(
      status, j.startDate, j.endDate,
    );
    return {
      id: j.id,
      title: j.title,
      coverUrl: j.coverUrl ?? null,
      origin: j.origin ?? null,
      startDate: j.startDate,
      endDate: j.endDate,
      status,
      displayStatus,
      budgetAmount: j.budgetAmount ?? null,
      themeTags: (j.themeTags ?? []).map((t) => normalizeThemeTag(t) ?? t).filter(Boolean),
      placeCount,
    };
  }

  /** 游记预览页（handbook/detail）轻量旅程信息 */
  toHandbookJourney(j: Journey) {
    const status = normalizeStatus(j.status) ?? (j.status as JourneyStatus);
    return {
      id: j.id,
      title: j.title,
      coverUrl: j.coverUrl ?? null,
      origin: j.origin ?? null,
      destination: j.destination ?? null,
      startDate: j.startDate,
      endDate: j.endDate,
      status,
      displayStatus: this.resolveDisplayStatus(status, j.startDate, j.endDate),
      companions: (j.companions ?? [])
        .map((c) => normalizeCompanion(c) ?? c)
        .filter(Boolean),
    };
  }

  toJourneyStatsModule(item: Record<string, any>) {
    return {
      placeCount: item.placeCount ?? 0,
      recordCount: item.recordCount ?? item.entryCount ?? 0,
      expenseTotalCent:
        item.expenseTotalCent ?? item.totalExpenseCent ?? item.expenseTotal ?? 0,
    };
  }

  toHandbookModule(item: Record<string, any>) {
    const hb = item.handbook ?? this.emptyHandbook(item.recordCount ?? 0);
    return {
      phase: hb.phase ?? item.handbookPhase ?? 'need_more',
      recordCount: hb.recordCount ?? item.recordCount ?? 0,
      minRecords: hb.minRecords ?? HANDBOOK_MIN_RECORDS,
      hasGuide: hb.hasGuide ?? item.hasGuide ?? false,
      guideId: hb.guideId ?? null,
      templateId: hb.templateId ?? null,
      shareSummary: hb.shareSummary ?? {
        ticketCount: 0,
        eventCount: 0,
        viewCount: 0,
        latestToken: null,
      },
    };
  }

  toPlanProgressModule(item: Record<string, any>) {
    const checkDone = item.confirmedCount ?? 0;
    const checkTotal = item.checkTotal ?? 0;
    const pct =
      item.planProgress != null
        ? item.planProgress
        : checkTotal > 0
          ? Math.round((checkDone / checkTotal) * 100)
          : 0;
    // 进度真源为 checklist；勿用 plan.checks / toggleCheck 驱动卡片
    return {
      checkDone,
      checkTotal,
      pct,
    };
  }

  toPlanModule(plan: Record<string, any>) {
    return {
      places: plan.places ?? [],
      /** @deprecated 只读兼容；进度真源为 /checklist */
      checks: plan.checks ?? [],
      checksDeprecated: true,
      budgetEstimate: plan.budgetEstimate ?? 0,
      updatedAt: formatDateTime(plan.updatedAt),
    };
  }

  /** 列表项：journey + journeyStats + planProgress + handbook（详情/写接口仍用） */
  toModularListItem(item: Record<string, any>) {
    return {
      journey: this.toJourneyModule(item),
      journeyStats: this.toJourneyStatsModule(item),
      planProgress: this.toPlanProgressModule(item),
      handbook: this.toHandbookModule(item),
    };
  }

  /**
   * 列表卡片扁平项：聚合卡片所需字段为单对象，不返回 handbook / 多余模块。
   * 见 docs/前端对接_旅程列表卡片扁平化_2026-08-09.md
   */
  toListCardItem(item: Record<string, any>) {
    const progress = this.toPlanProgressModule(item);
    const stats = this.toJourneyStatsModule(item);
    return {
      id: item.id,
      title: item.title,
      coverUrl: item.coverUrl ?? item.cover ?? null,
      origin: item.origin ?? null,
      destination: item.destination ?? null,
      startDate: item.startDate,
      endDate: item.endDate,
      status: item.status,
      displayStatus: item.displayStatus,
      companions: item.companions ?? [],
      createdAt: formatDateTime(item.createdAt),
      /** 首页「最近攻略」排序与 30 天空态判断 */
      updatedAt: formatDateTime(item.updatedAt),
      placeCount: stats.placeCount,
      recordCount: stats.recordCount,
      expenseTotalCent: stats.expenseTotalCent,
      checkDone: progress.checkDone,
      checkTotal: progress.checkTotal,
      pct: progress.pct,
    };
  }

  async togglePlanCheck(userId: string, journeyId: string, checkId: string) {
    return this.patchPlan(userId, journeyId, {
      toggleCheckClientId: checkId,
    } as PatchPlanDto);
  }

  private async ensurePlan(journeyId: string) {
    let plan = await this.plans.findOne({ where: { journeyId } });
    if (!plan) {
      plan = await this.plans.save(
        this.plans.create({
          journeyId,
          places: [],
          checks: DEFAULT_PLAN_CHECKS.map((c) => ({ ...c })),
          budgetEstimate: 0,
        }),
      );
    }
    await this.checklist.seedDefaults(journeyId);
    return plan;
  }

  private normalizePlaceCategory(raw?: string | null): string | null {
    if (!raw) return null;
    const s = String(raw).trim();
    const map: Record<string, string> = {
      SIGHT: 'SIGHT',
      FOOD: 'FOOD',
      STAY: 'STAY',
      SHOPPING: 'SHOPPING',
      OTHER: 'OTHER',
      attraction: 'SIGHT',
      sight: 'SIGHT',
      food: 'FOOD',
      stay: 'STAY',
      hotel: 'STAY',
      shopping: 'SHOPPING',
      other: 'OTHER',
      景点: 'SIGHT',
      餐饮: 'FOOD',
      住宿: 'STAY',
      购物: 'SHOPPING',
    };
    return map[s] ?? map[s.toUpperCase()] ?? map[s.toLowerCase()] ?? 'OTHER';
  }

  private normalizePlaceIntent(
    raw: unknown,
    dayIndex: number | null,
  ): PlanPlaceIntent {
    const v = String(raw ?? '')
      .trim()
      .toLowerCase();
    if (v === 'wish' || v === 'planned' || v === 'must') return v;
    if (dayIndex != null && dayIndex > 0) return 'planned';
    return 'wish';
  }

  /**
   * 关联日期 + 预计时间：仅 `YYYY-MM-DD HH:mm:ss`。
   * 空值清除。
   */
  private normalizeVisitTime(raw: unknown): string | null {
    if (raw == null) return null;
    const s = String(raw).trim();
    if (!s) return null;
    const m = s.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
    if (!m) {
      throw new BadRequestException({
        code: '40001',
        message: 'recordedAt 格式应为 YYYY-MM-DD HH:mm:ss',
      });
    }
    const hh = Number(m[2]);
    const mm = Number(m[3]);
    const ss = Number(m[4]);
    if (hh > 23 || mm > 59 || ss > 59) {
      throw new BadRequestException({
        code: '40001',
        message: 'recordedAt 格式应为 YYYY-MM-DD HH:mm:ss',
      });
    }
    return s;
  }

  /** visitTime 日期相对旅程 startDate 的第几天（1-based） */
  private deriveDayIndex(
    visitTime: string | null,
    startDate?: string | null,
  ): number | null {
    if (!visitTime || !startDate) return null;
    const ymd = visitTime.slice(0, 10);
    const start = String(startDate).slice(0, 10);
    const a = new Date(`${ymd}T00:00:00`);
    const b = new Date(`${start}T00:00:00`);
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
    return Math.floor((a.getTime() - b.getTime()) / 86400000) + 1;
  }

  private normalizePlaceInput(
    p: Record<string, any>,
    index = 0,
    startDate?: string,
  ): PlanPlace {
    const clientId = String(p.clientId ?? p.id ?? `p_${Date.now()}_${index}`);
    const latRaw = p.lat ?? p.latitude;
    const lngRaw = p.lng ?? p.longitude;
    const lat =
      latRaw != null && latRaw !== '' ? Number(latRaw) : undefined;
    const lng =
      lngRaw != null && lngRaw !== '' ? Number(lngRaw) : undefined;
    const images = Array.isArray(p.images)
      ? p.images.map(String).slice(0, 9)
      : p.coverUrl || p.cover
        ? [String(p.coverUrl ?? p.cover)]
        : undefined;
    const visitTime = this.normalizeVisitTime(p.recordedAt ?? p.visitTime);
    const dayFromTime = this.deriveDayIndex(visitTime, startDate);
    const dayIndexRaw =
      p.dayIndex != null && p.dayIndex !== '' ? Number(p.dayIndex) : null;
    const day =
      dayFromTime ??
      (Number.isFinite(dayIndexRaw as number) ? (dayIndexRaw as number) : null);
    return {
      clientId,
      name: String(p.name ?? p.locationName ?? '').trim(),
      note: p.note,
      coverUrl: p.coverUrl ?? p.cover ?? images?.[0],
      lat: Number.isFinite(lat as number) ? (lat as number) : null,
      lng: Number.isFinite(lng as number) ? (lng as number) : null,
      locationName: p.locationName ?? p.address ?? null,
      category: this.normalizePlaceCategory(p.category),
      dayIndex: day,
      visitTime,
      intent: this.normalizePlaceIntent(p.intent, day),
      images: images ?? [],
      tags: Array.isArray(p.tags) ? p.tags : undefined,
      mediaIds: Array.isArray(p.mediaIds) ? p.mediaIds : undefined,
      sortOrder: p.sortOrder != null ? Number(p.sortOrder) : index,
    };
  }

  /** 按 clientId 幂等合并：同 id 更新；新 id 追加；按输入序 */
  private mergePlacesByClientId(
    existing: PlanPlace[],
    incoming: PlanPlace[],
  ): PlanPlace[] {
    if (!incoming.length && existing.length) {
      // 显式传空数组 = 清空
      return [];
    }
    const byId = new Map(existing.map((p) => [p.clientId, p]));
    const seen = new Set<string>();
    const out: PlanPlace[] = [];
    for (const p of incoming) {
      if (!p.clientId || seen.has(p.clientId)) {
        // 无 clientId 或重复：跳过重复，无 id 仍保留一条
        if (!p.clientId) {
          out.push({ ...p, clientId: `p_anon_${out.length}` });
        }
        continue;
      }
      seen.add(p.clientId);
      const prev = byId.get(p.clientId);
      out.push(prev ? { ...prev, ...p, clientId: p.clientId } : p);
    }
    return out.map((p, i) => ({ ...p, sortOrder: i }));
  }

  /**
   * 单点 upsert 的字段合并：只覆盖请求里显式出现的字段。
   * normalizePlaceInput 会把缺省字段规范化为 null/[]/undefined，
   * 直接展开会清空已有点的旧值（如更新名称时丢掉 category/坐标/图片），
   * 故先按原始请求键过滤出「本次要改」的字段。
   */
  private mergeSinglePlacePatch(
    prev: PlanPlace,
    incoming: PlanPlace,
    raw: Record<string, any>,
  ): PlanPlace {
    const keys = new Set(Object.keys(raw ?? {}));
    const has = (...ks: string[]) => ks.some((k) => keys.has(k));
    const patch: Partial<PlanPlace> = {};
    if (has('name', 'locationName')) patch.name = incoming.name;
    if (has('note')) patch.note = incoming.note;
    if (has('coverUrl', 'cover')) patch.coverUrl = incoming.coverUrl;
    if (has('category')) patch.category = incoming.category;
    if (has('locationName', 'address')) patch.locationName = incoming.locationName;
    if (has('recordedAt', 'visitTime')) {
      patch.visitTime = incoming.visitTime;
      patch.dayIndex = incoming.dayIndex;
    }
    if (has('lat', 'latitude')) patch.lat = incoming.lat;
    if (has('lng', 'longitude')) patch.lng = incoming.lng;
    if (has('dayIndex')) patch.dayIndex = incoming.dayIndex;
    if (has('intent')) patch.intent = incoming.intent;
    if (has('images')) patch.images = incoming.images;
    if (has('tags')) patch.tags = incoming.tags;
    if (has('mediaIds')) patch.mediaIds = incoming.mediaIds;
    return { ...prev, ...patch, clientId: prev.clientId, sortOrder: prev.sortOrder };
  }

  private normalizeCheckInput(c: Record<string, any>) {
    const clientId = String(c.clientId ?? c.id ?? '');
    return {
      clientId,
      text: String(c.text ?? ''),
      done: Boolean(c.done),
    };
  }

  private toPlanResponse(plan: JourneyPlan) {
    return {
      journeyId: plan.journeyId,
      places: (plan.places ?? []).map((p, i) => ({
        id: p.clientId,
        clientId: p.clientId,
        name: p.name,
        note: p.note ?? null,
        coverUrl: p.coverUrl ?? p.images?.[0] ?? null,
        cover: p.coverUrl ?? p.images?.[0] ?? null,
        lat: p.lat ?? null,
        lng: p.lng ?? null,
        latitude: p.lat ?? null,
        longitude: p.lng ?? null,
        locationName: p.locationName ?? null,
        category: p.category ?? null,
        dayIndex: p.dayIndex ?? null,
        recordedAt: p.visitTime ?? null,
        intent: this.normalizePlaceIntent(p.intent, p.dayIndex ?? null),
        images: p.images ?? (p.coverUrl ? [p.coverUrl] : []),
        sortOrder: p.sortOrder ?? i,
        tags: p.tags ?? [],
        mediaIds: p.mediaIds ?? [],
      })),
      checks: (plan.checks ?? []).map((c) => ({
        id: c.clientId,
        clientId: c.clientId,
        text: c.text,
        done: c.done,
      })),
      checksDeprecated: true,
      budgetEstimate: plan.budgetEstimate ?? 0,
      updatedAt: formatDateTime(plan.updatedAt),
    };
  }

  async create(userId: string, dto: CreateJourneyDto) {
    if (dto.endDate < dto.startDate) {
      throw new BadRequestException('endDate must be >= startDate');
    }

    // clientId 幂等：同用户重复提交返回已有旅程
    if (dto.clientId) {
      const existing = await this.journeys.findOne({
        where: { userId, clientId: dto.clientId },
      });
      if (existing) return this.finalizeItem(existing);
    }

    const data = this.normalizeWrite(dto);
    const j = await this.journeys.save(
      this.journeys.create({
        ...data,
        userId,
        clientId: dto.clientId,
        origin: dto.origin,
        title: dto.title,
        startDate: dto.startDate,
        endDate: dto.endDate,
        status: 'planned',
        isPublic: dto.isPublic ?? false,
        syncVersion: 1,
      }),
    );
    const plan = await this.ensurePlan(j.id);
    const seedRaw = dto.places?.length ? dto.places : [];
    if (seedRaw.length) {
      plan.places = this.mergePlacesByClientId(
        plan.places ?? [],
        seedRaw.map((p, i) => this.normalizePlaceInput(p as any, i, j.startDate)),
      );
    }
    if (data.budgetAmount != null) {
      plan.budgetEstimate = data.budgetAmount;
    }
    if (seedRaw.length || data.budgetAmount != null) {
      await this.plans.save(plan);
    }
    await this.seedPlanPlaceEntries(j, plan.places ?? []);
    return this.finalizeItem(j);
  }

  async list(
    userId: string,
    status?: string,
    displayStatus?: string,
  ) {
    return this.listFiltered(userId, { status, displayStatus });
  }

  /**
   * 列表筛选：type(展示态数字) / keyword / 行程时间区间
   * type: 1进行中 2即将出发 3规划中 4已完成；不传=全部
   */
  async listFiltered(
    userId: string,
    opts?: {
      status?: string;
      displayStatus?: string;
      type?: 1 | 2 | 3 | 4 | number;
      keyword?: string;
      startTime?: string;
      endTime?: string;
      /** 默认 createdAt；首页最近攻略传 updatedAt */
      sortBy?: 'createdAt' | 'updatedAt';
    },
  ) {
    const where: { userId: string; status?: JourneyStatus } = { userId };
    if (opts?.status) {
      const n = normalizeStatus(opts.status);
      if (!n) throw new BadRequestException(`invalid status: ${opts.status}`);
      where.status = n;
    }
    const sortBy =
      opts?.sortBy === 'updatedAt' ? 'updatedAt' : 'createdAt';
    const rows = await this.journeys.find({
      where,
      order: { [sortBy]: 'DESC' },
    });
    // 列表卡片不需要 handbook，跳过 enrich 以减负
    let items = await Promise.all(rows.map((j) => this.toListItem(j)));

    const display =
      this.mapListTypeToDisplayStatus(opts?.type) ?? opts?.displayStatus;
    if (display) {
      items = items.filter((i) => i.displayStatus === display);
    }

    const kw = opts?.keyword?.trim().toLowerCase();
    if (kw) {
      // 仅匹配计划名称（journey.title）
      items = items.filter((i) =>
        String(i.title ?? '')
          .toLowerCase()
          .includes(kw),
      );
    }

    const rangeStart = this.normalizeYmd(opts?.startTime);
    const rangeEnd = this.normalizeYmd(opts?.endTime);
    if (rangeStart && rangeEnd && rangeStart > rangeEnd) {
      throw new BadRequestException({
        code: '40001',
        message: '参数错误',
      });
    }
    if (rangeStart || rangeEnd) {
      items = items.filter((i) => {
        const js = String(i.startDate ?? '');
        const je = String(i.endDate ?? '');
        if (rangeStart && je && je < rangeStart) return false;
        if (rangeEnd && js && js > rangeEnd) return false;
        return true;
      });
    }

    return items;
  }

  /** type 数字 → displayStatus；非法/空返回 undefined */
  private mapListTypeToDisplayStatus(
    type?: 1 | 2 | 3 | 4 | number,
  ): 'ongoing' | 'departing' | 'planning' | 'finished' | undefined {
    if (type == null) return undefined;
    const map: Record<number, 'ongoing' | 'departing' | 'planning' | 'finished'> =
      {
        1: 'ongoing',
        2: 'departing',
        3: 'planning',
        4: 'finished',
      };
    return map[Number(type)];
  }

  private normalizeYmd(raw?: string | null): string | undefined {
    if (!raw?.trim()) return undefined;
    const m = String(raw)
      .trim()
      .match(/^(\d{4}-\d{2}-\d{2})/);
    return m?.[1];
  }

  /** 游记工作台列表（带四态；可按 phase 过滤） */
  async handbookList(
    userId: string,
    opts?: { phase?: HandbookPhase | string },
  ) {
    const items = await this.list(userId);
    const modular = items.map((item) => this.toModularListItem(item));
    if (!opts?.phase) {
      return {
        minRecords: HANDBOOK_MIN_RECORDS,
        total: modular.length,
        list: modular,
      };
    }
    const phase = opts.phase;
    const list = modular.filter((m) => m.handbook.phase === phase);
    return {
      minRecords: HANDBOOK_MIN_RECORDS,
      total: list.length,
      phase,
      list,
    };
  }

  async detail(userId: string, id: string) {
    const j = await this.owned(userId, id);
    const item = await this.toListItem(j);
    await this.enrichHandbook([item]);
    const plan = await this.toPlanResponse(await this.ensurePlan(id));
    return {
      ...item,
      plan: {
        title: j.title,
        origin: j.origin,
        destination: j.destination ?? null,
        startDate: j.startDate,
        endDate: j.endDate,
        themeTags: item.themeTags,
        themes: item.themes,
        companions: item.companions,
        budgetAmount: item.budgetAmount,
        budgetLimit: item.budgetLimit,
        coverUrl: item.coverUrl,
        cover: item.cover,
        isPublic: j.isPublic,
        places: plan.places,
        checks: plan.checks,
        budgetEstimate: plan.budgetEstimate,
      },
    };
  }

  async update(userId: string, id: string, dto: UpdateJourneyDto) {
    const j = await this.owned(userId, id);
    const data = this.normalizeWrite(dto);
    const start = data.startDate ?? j.startDate;
    const end = data.endDate ?? j.endDate;
    if (end < start) {
      throw new BadRequestException('endDate must be >= startDate');
    }
    Object.assign(j, data);
    j.syncVersion += 1;
    const saved = await this.journeys.save(j);
    // 创建/编辑预算：journey.budgetAmount 与 plan.budgetEstimate 同步一次
    if (data.budgetAmount !== undefined) {
      const plan = await this.ensurePlan(id);
      plan.budgetEstimate = data.budgetAmount ?? 0;
      await this.plans.save(plan);
    }
    return this.finalizeItem(saved);
  }

  async updateStatus(userId: string, id: string, dto: UpdateStatusDto) {
    const raw = dto.target ?? dto.status;
    if (!raw) {
      throw new BadRequestException('target (or status) is required');
    }
    const target = normalizeStatus(raw);
    if (!target) {
      throw new BadRequestException(`invalid status: ${raw}`);
    }
    const j = await this.owned(userId, id);
    // 兼容存量 planning/ended
    const current =
      normalizeStatus(j.status) ?? (j.status as JourneyStatus);
    const allowed = ALLOWED[current] ?? [];
    if (!allowed.includes(target)) {
      throw new BadRequestException(
        `invalid status transition: ${current} -> ${target}; allowed: ${allowed.join(',') || '(none)'}`,
      );
    }
    j.status = target;
    j.syncVersion += 1;
    const saved = await this.journeys.save(j);
    if (target === 'ongoing') {
      const plan = await this.ensurePlan(saved.id);
      await this.seedPlanPlaceEntries(saved, plan.places ?? []);
    }
    return this.finalizeItem(saved);
  }

  /**
   * 结束旅行：将旅程标记为 finished。
   * - ongoing → finished（主路径）
   * - planned → finished（规划中直接结束，跳过进行中）
   * - 已是 finished → 幂等返回详情
   */
  async finish(userId: string, id: string) {
    const j = await this.owned(userId, id);
    const current =
      normalizeStatus(j.status) ?? (j.status as JourneyStatus);

    if (current === 'finished') {
      return this.finalizeItem(j);
    }

    if (current !== 'ongoing' && current !== 'planned') {
      throw new BadRequestException(
        `cannot finish journey from status: ${current}`,
      );
    }

    j.status = 'finished';
    j.syncVersion += 1;

    // 若结束日还在未来，收口为今天，便于「已完成 N 天」展示
    const today = this.todayYmd();
    if (j.endDate > today) {
      j.endDate = today < j.startDate ? j.startDate : today;
    }

    const saved = await this.journeys.save(j);
    return this.finalizeItem(saved);
  }

  async remove(userId: string, id: string) {
    return this.dataSource.transaction(async (manager) => {
      const j = await manager.findOne(Journey, { where: { id, userId } });
      if (!j) throw new NotFoundException('journey not found');
      // plan 由 FK CASCADE 删除
      await manager.remove(j);
      return { deleted: true };
    });
  }

  // ─── 旅行计划 ───────────────────────────────────────────

  async getPlan(userId: string, journeyId: string) {
    await this.owned(userId, journeyId);
    const plan = await this.ensurePlan(journeyId);
    return this.toPlanResponse(plan);
  }

  /**
   * 新建预定点：单点追加，不整包覆盖。
   * clientId 由服务端自动生成（内部幂等/删除用），前端不必传。
   * 媒体 mediaIds 存于 place JSON，前端通过 uploadMedia 返回的 id 关联。
   */
  async createPlanPlace(
    userId: string,
    journeyId: string,
    dto: PlanPlaceCreateBodyDto,
  ) {
    const j = await this.owned(userId, journeyId);
    const plan = await this.ensurePlan(journeyId);
    const visitTime = dto.recordedAt
      ? this.normalizeVisitTime(dto.recordedAt)
      : null;
    const clientId = `p_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const place: PlanPlace = {
      clientId,
      name: String(dto.name ?? '').trim(),
      note: dto.note ?? undefined,
      coverUrl: dto.coverUrl ?? undefined,
      lat: dto.lat != null ? Number(dto.lat) : null,
      lng: dto.lng != null ? Number(dto.lng) : null,
      visitTime,
      dayIndex: this.deriveDayIndex(visitTime, j.startDate),
      tags: dto.tags?.length ? dto.tags : undefined,
      mediaIds: dto.mediaIds?.length ? dto.mediaIds : undefined,
      sortOrder: (plan.places ?? []).length,
    };
    plan.places = [...(plan.places ?? []), place];
    const saved = await this.plans.save(plan);
    await this.seedPlanPlaceEntries(j, saved.places ?? []);
    return this.toPlanResponse(saved);
  }

  /**
   * 单点删除预定点（契约见 docs/前端对接_预定点单点接口_2026-08-20.md）。
   * 幂等：clientId 不存在时返回现状；联动删除该点占位记录（仅 plan_place，不误删用户内容）。
   */
  async deletePlanPlace(userId: string, journeyId: string, clientId: string) {
    const j = await this.owned(userId, journeyId);
    const plan = await this.ensurePlan(journeyId);
    const before = plan.places ?? [];
    if (!before.some((p) => p.clientId === clientId)) {
      return this.toPlanResponse(plan);
    }
    plan.places = before.filter((p) => p.clientId !== clientId);
    const saved = await this.plans.save(plan);
    await this.prunePlanPlaceEntries(journeyId, [clientId]);
    return this.toPlanResponse(saved);
  }

  async putPlan(userId: string, journeyId: string, dto: UpsertPlanDto) {
    const j = await this.owned(userId, journeyId);
    const plan = await this.ensurePlan(journeyId);
    const incoming = (dto.places ?? []).map((p, i) =>
      this.normalizePlaceInput(p as any, i, j.startDate),
    );
    // 按 clientId 幂等：同 id 更新合并字段；输入序为最终列表（可删点）
    const prevIds = new Set((plan.places ?? []).map((p) => p.clientId));
    plan.places = this.mergePlacesByClientId(plan.places ?? [], incoming);
    const newIds = new Set((plan.places ?? []).map((p) => p.clientId));
    const removedIds = [...prevIds].filter((id) => id && !newIds.has(id));
    if (removedIds.length) {
      // 删点联动：清掉对应占位记录（仅 plan_place）
      await this.prunePlanPlaceEntries(journeyId, removedIds);
    }
    if (dto.checks !== undefined) {
      plan.checks = (dto.checks ?? []).map((c) =>
        this.normalizeCheckInput(c as any),
      );
    }
    if (dto.budgetEstimate !== undefined) {
      plan.budgetEstimate = dto.budgetEstimate;
    }
    const saved = await this.plans.save(plan);
    await this.seedPlanPlaceEntries(j, saved.places ?? []);
    return this.toPlanResponse(saved);
  }

  async patchPlan(userId: string, journeyId: string, dto: PatchPlanDto) {
    const j = await this.owned(userId, journeyId);
    const plan = await this.ensurePlan(journeyId);

    if (dto.places) {
      const prevIds = new Set((plan.places ?? []).map((p) => p.clientId));
      plan.places = this.mergePlacesByClientId(
        plan.places ?? [],
        dto.places.map((p, i) =>
          this.normalizePlaceInput(p as any, i, j.startDate),
        ),
      );
      const newIds = new Set((plan.places ?? []).map((p) => p.clientId));
      const removedIds = [...prevIds].filter((id) => id && !newIds.has(id));
      if (removedIds.length) {
        // 删点联动：清掉对应占位记录（仅 plan_place）
        await this.prunePlanPlaceEntries(journeyId, removedIds);
      }
    }
    if (dto.checks) {
      plan.checks = dto.checks.map((c) => this.normalizeCheckInput(c as any));
    }
    if (dto.budgetEstimate !== undefined) {
      plan.budgetEstimate = dto.budgetEstimate;
    }
    const toggleId = dto.toggleCheckClientId ?? dto.toggleCheckId;
    if (toggleId) {
      plan.checks = (plan.checks ?? []).map((c) =>
        c.clientId === toggleId ? { ...c, done: !c.done } : c,
      );
    }

    const saved = await this.plans.save(plan);
    if (dto.places) {
      await this.seedPlanPlaceEntries(j, saved.places ?? []);
    }
    return this.toPlanResponse(saved);
  }

  /**
   * 把已填 visitTime 的预定点初始化成时间线记录（幂等）。
   * 触发：plan/save 添加地点 / 创建时带 visitTime / 开始旅程补漏。
   * 记录：createdAt=写入时刻；recordedAt=visitTime（这条记录对应哪天几点）。
   */
  private async seedPlanPlaceEntries(journey: Journey, places: PlanPlace[]) {
    const named = (places ?? []).filter(
      (p) => String(p.name ?? '').trim() && p.visitTime,
    );
    if (!named.length) return;

    const sorted = [...named].sort((a, b) => {
      const ta = a.visitTime ?? '';
      const tb = b.visitTime ?? '';
      if (ta !== tb) return ta.localeCompare(tb);
      return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    });

    const clientIds = sorted.map((p) =>
      this.planPlaceEntryClientId(journey.id, p.clientId),
    );
    const existing = await this.entries.find({
      where: { clientId: In(clientIds) },
      select: ['clientId'],
    });
    const have = new Set(existing.map((e) => e.clientId));
    const todo = sorted.filter((p, i) => !have.has(clientIds[i]));
    if (!todo.length) return;

    try {
      await this.dataSource.transaction(async (manager) => {
        for (const p of todo) {
          const clientId = this.planPlaceEntryClientId(journey.id, p.clientId);
          const recordedAt = this.recordedAtFromPlace(p, journey.startDate);
          const hasCoord =
            Number.isFinite(p.lat as number) && Number.isFinite(p.lng as number);
          const dayIndex =
            this.deriveDayIndex(p.visitTime ?? null, journey.startDate) ??
            (p.dayIndex != null && p.dayIndex > 0 ? p.dayIndex : null);
          const entry = await manager.save(
            manager.create(Entry, {
              journeyId: journey.id,
              clientId,
              type: hasCoord ? 'location' : 'text',
              content: hasCoord ? '' : String(p.name).trim(),
              recordedAt,
              dayIndex,
              payload: {
                source: 'plan_place',
                placeClientId: p.clientId,
              },
            }),
          );
          if (hasCoord) {
            await manager.save(
              manager.create(Location, {
                entryId: entry.id,
                lat: Number(p.lat),
                lng: Number(p.lng),
                name: String(p.locationName || p.name).trim().slice(0, 255),
              }),
            );
          }
        }
      });
    } catch (err) {
      this.logger.error(
        `seedPlanPlaceEntries failed journey=${journey.id}: ${(err as Error)?.message ?? err}`,
      );
    }
  }

  private planPlaceEntryClientId(journeyId: string, placeClientId: string) {
    const raw = `pp:${journeyId}:${placeClientId}`;
    if (raw.length <= 64) return raw;
    return `pp:${createHash('sha1').update(raw).digest('hex')}`;
  }

  /**
   * 删预定点时联动删除其占位记录（幂等）。
   * 仅删 payload.source === 'plan_place' 的记录，避免误删用户自己写的内容；
   * 匿名地点（p_anon_，无 clientId 的历史数据）不做联动。
   */
  private async prunePlanPlaceEntries(
    journeyId: string,
    removedClientIds: string[],
  ) {
    const targets = removedClientIds
      .filter((id) => id && !id.startsWith('p_anon_'))
      .map((id) => this.planPlaceEntryClientId(journeyId, id));
    if (!targets.length) return;
    try {
      const rows = await this.entries.find({
        where: { clientId: In(targets) },
        select: ['id', 'payload'],
      });
      const ids = rows
        .filter((e) => (e.payload as any)?.source === 'plan_place')
        .map((e) => e.id);
      if (ids.length) {
        await this.entries.delete(ids);
      }
    } catch (err) {
      this.logger.error(
        `prunePlanPlaceEntries failed journey=${journeyId}: ${(err as Error)?.message ?? err}`,
      );
    }
  }

  private recordedAtFromPlace(place: PlanPlace, startDate: string): Date {
    if (place.visitTime) {
      const d = new Date(String(place.visitTime).replace(' ', 'T'));
      if (!Number.isNaN(d.getTime())) return d;
    }
    const day =
      place.dayIndex != null && place.dayIndex > 0 ? place.dayIndex : 1;
    const ymd = this.addDaysYmd(startDate, day - 1);
    return new Date(`${ymd}T00:00:00`);
  }
}
