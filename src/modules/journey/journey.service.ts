import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Repository } from 'typeorm';
import { Journey } from '../../entities/journey.entity';
import { JourneyPlan } from '../../entities/journey-plan.entity';
import type { PlanPlace, PlanPlaceIntent } from '../../entities/journey-plan.entity';
import { Expense } from '../../entities/expense.entity';
import { Entry } from '../../entities/entry.entity';
import { Location } from '../../entities/location.entity';
import { Destination } from '../../entities/destination.entity';
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
import {
  DEFAULT_PLAN_CHECKS,
  JourneyStatus,
  normalizeCompanion,
  normalizeStatus,
  normalizeThemeTag,
} from '../../common/enums/catalog';
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
  constructor(
    @InjectRepository(Journey) private readonly journeys: Repository<Journey>,
    @InjectRepository(JourneyPlan)
    private readonly plans: Repository<JourneyPlan>,
    @InjectRepository(Expense) private readonly expenses: Repository<Expense>,
    @InjectRepository(Entry) private readonly entries: Repository<Entry>,
    @InjectRepository(Location)
    private readonly locations: Repository<Location>,
    @InjectRepository(Destination)
    private readonly destinations: Repository<Destination>,
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
    const destPair = this.resolveDestinations(dto);

    const out: Partial<Journey> = {};
    if ('title' in dto && dto.title !== undefined) out.title = dto.title;
    if ('origin' in dto && dto.origin !== undefined) out.origin = dto.origin;
    if (destPair) {
      out.destination = destPair.destination;
      out.destinations = destPair.destinations;
    }
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

  /** destinations[] 与 destination 展示串双向同步 */
  private resolveDestinations(
    dto: Pick<CreateJourneyDto, 'destination' | 'destinations'>,
  ): { destinations: string[]; destination: string | undefined } | null {
    if (dto.destinations === undefined && dto.destination === undefined) {
      return null;
    }
    let list: string[] = [];
    if (dto.destinations?.length) {
      list = dto.destinations.map((s) => String(s).trim()).filter(Boolean);
    } else if (dto.destination) {
      list = this.splitDestinationString(dto.destination);
    }
    const unique = [...new Set(list)];
    return {
      destinations: unique,
      destination: unique.length ? unique.join(' · ') : undefined,
    };
  }

  private splitDestinationString(raw?: string | null): string[] {
    if (!raw?.trim()) return [];
    return String(raw)
      .split(/\s*[·、,，/|]\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
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

  /** 进行中：今日有定位的 entry 数（无日程模型时的近似） */
  private async todayPlaceCount(journeyId: string, displayStatus: string) {
    if (displayStatus !== 'ongoing') return 0;
    const today = this.todayYmd();
    const raw = await this.locations
      .createQueryBuilder('loc')
      .innerJoin('loc.entry', 'entry')
      .where('entry.journeyId = :journeyId', { journeyId })
      .andWhere('DATE(entry.createdAt) = :today', { today })
      .getCount();
    return raw;
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
    const todayPlaceCount = await this.todayPlaceCount(j.id, displayStatus);
    const handbook = this.emptyHandbook(recordCount);
    const destinations =
      Array.isArray(j.destinations) && j.destinations.length
        ? j.destinations
        : this.splitDestinationString(j.destination);
    const destination =
      j.destination ??
      (destinations.length ? destinations.join(' · ') : null);
    return {
      ...j,
      status,
      displayStatus,
      destination,
      destinations,
      themeTags,
      themes: themeTags,
      companions,
      budgetAmount: j.budgetAmount ?? null,
      budgetLimit: j.budgetAmount ?? null,
      coverUrl: j.coverUrl ?? null,
      cover: j.coverUrl ?? null,
      days,
      nights,
      entryCount: recordCount,
      recordCount,
      placeCount,
      planProgress,
      confirmedCount,
      checkTotal,
      todayPlaceCount,
      handbookPhase: handbook.phase,
      hasGuide: handbook.hasGuide,
      handbook,
      ...snap,
    };
  }

  /** 旅程本体模块（单查 / 聚合同构） */
  toJourneyModule(item: Record<string, any>) {
    const destinations =
      Array.isArray(item.destinations) && item.destinations.length
        ? item.destinations.map(String)
        : this.splitDestinationString(item.destination);
    const destination =
      item.destination ??
      (destinations.length ? destinations.join(' · ') : null);
    return {
      id: item.id,
      clientId: item.clientId ?? null,
      title: item.title,
      origin: item.origin,
      destination,
      destinations,
      coverUrl: item.coverUrl ?? null,
      startDate: item.startDate,
      endDate: item.endDate,
      status: item.status,
      displayStatus: item.displayStatus,
      themeTags: item.themeTags ?? [],
      companions: item.companions ?? [],
      budgetAmount: item.budgetAmount ?? null,
      isPublic: item.isPublic ?? false,
      days: item.days,
      nights: item.nights,
      syncVersion: item.syncVersion,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  toJourneyStatsModule(item: Record<string, any>) {
    return {
      placeCount: item.placeCount ?? 0,
      recordCount: item.recordCount ?? item.entryCount ?? 0,
      expenseTotalCent:
        item.expenseTotalCent ?? item.totalExpenseCent ?? item.expenseTotal ?? 0,
      todayPlaceCount: item.todayPlaceCount ?? 0,
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
    return {
      checkDone,
      checkTotal,
      pct,
      /** 进度真源为 checklist；勿用 plan.checks / toggleCheck 驱动卡片 */
      source: 'checklist' as const,
    };
  }

  toPlanModule(plan: Record<string, any>) {
    return {
      places: plan.places ?? [],
      /** @deprecated 只读兼容；进度真源为 /checklist */
      checks: plan.checks ?? [],
      checksDeprecated: true,
      budgetEstimate: plan.budgetEstimate ?? 0,
      updatedAt: plan.updatedAt ?? null,
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
      createdAt: item.createdAt,
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
    return this.migrateDestinationsIntoPlan(plan);
  }

  /**
   * 历史 destinations 表 → plan.places（仅当 places 为空时一次性迁移）
   * isMust → must；有 dayIndex → planned；否则 wish
   */
  private async migrateDestinationsIntoPlan(plan: JourneyPlan) {
    if ((plan.places ?? []).length) return plan;
    const rows = await this.destinations.find({
      where: { journeyId: plan.journeyId, deletedAt: IsNull() },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
    if (!rows.length) return plan;
    plan.places = rows.map((d, i) =>
      this.normalizePlaceInput(
        {
          clientId: `dest_${d.id}`,
          name: d.name,
          note: d.note ?? undefined,
          lat: d.latitude != null ? Number(d.latitude) : null,
          lng: d.longitude != null ? Number(d.longitude) : null,
          locationName: d.address ?? null,
          category: d.category,
          dayIndex: d.dayIndex,
          intent: d.isMust
            ? 'must'
            : d.dayIndex != null && d.dayIndex > 0
              ? 'planned'
              : 'wish',
          images: d.images ?? [],
          sortOrder: d.sortOrder ?? i,
        },
        i,
      ),
    );
    return this.plans.save(plan);
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

  private normalizePlaceInput(p: Record<string, any>, index = 0): PlanPlace {
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
    const dayIndex =
      p.dayIndex != null && p.dayIndex !== ''
        ? Number(p.dayIndex)
        : null;
    const day = Number.isFinite(dayIndex as number) ? (dayIndex as number) : null;
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
      intent: this.normalizePlaceIntent(p.intent, day),
      images: images ?? [],
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
        intent: this.normalizePlaceIntent(p.intent, p.dayIndex ?? null),
        images: p.images ?? (p.coverUrl ? [p.coverUrl] : []),
        sortOrder: p.sortOrder ?? i,
      })),
      checks: (plan.checks ?? []).map((c) => ({
        id: c.clientId,
        clientId: c.clientId,
        text: c.text,
        done: c.done,
      })),
      checksDeprecated: true,
      budgetEstimate: plan.budgetEstimate ?? 0,
      updatedAt: plan.updatedAt,
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
    const seedRaw =
      dto.places?.length
        ? dto.places
        : (data.destinations ?? []).map((name) => ({
            name,
            intent: 'wish',
            category: 'SIGHT',
          }));
    if (seedRaw.length) {
      plan.places = this.mergePlacesByClientId(
        plan.places ?? [],
        seedRaw.map((p, i) => this.normalizePlaceInput(p as any, i)),
      );
    }
    if (data.budgetAmount != null) {
      plan.budgetEstimate = data.budgetAmount;
    }
    if (seedRaw.length || data.budgetAmount != null) {
      await this.plans.save(plan);
    }
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
    },
  ) {
    const where: { userId: string; status?: JourneyStatus } = { userId };
    if (opts?.status) {
      const n = normalizeStatus(opts.status);
      if (!n) throw new BadRequestException(`invalid status: ${opts.status}`);
      where.status = n;
    }
    const rows = await this.journeys.find({
      where,
      order: { createdAt: 'DESC' },
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

  async putPlan(userId: string, journeyId: string, dto: UpsertPlanDto) {
    await this.owned(userId, journeyId);
    const plan = await this.ensurePlan(journeyId);
    const incoming = (dto.places ?? []).map((p, i) =>
      this.normalizePlaceInput(p as any, i),
    );
    // 按 clientId 幂等：同 id 更新合并字段；输入序为最终列表（可删点）
    plan.places = this.mergePlacesByClientId(plan.places ?? [], incoming);
    if (dto.checks !== undefined) {
      plan.checks = (dto.checks ?? []).map((c) =>
        this.normalizeCheckInput(c as any),
      );
    }
    if (dto.budgetEstimate !== undefined) {
      plan.budgetEstimate = dto.budgetEstimate;
    }
    const saved = await this.plans.save(plan);
    return this.toPlanResponse(saved);
  }

  async patchPlan(userId: string, journeyId: string, dto: PatchPlanDto) {
    await this.owned(userId, journeyId);
    const plan = await this.ensurePlan(journeyId);

    if (dto.places) {
      plan.places = this.mergePlacesByClientId(
        plan.places ?? [],
        dto.places.map((p, i) => this.normalizePlaceInput(p as any, i)),
      );
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
    return this.toPlanResponse(saved);
  }
}
