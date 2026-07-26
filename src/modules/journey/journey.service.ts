import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { Journey } from '../../entities/journey.entity';
import { JourneyPlan } from '../../entities/journey-plan.entity';
import { Expense } from '../../entities/expense.entity';
import { Entry } from '../../entities/entry.entity';
import { Location } from '../../entities/location.entity';
import { Destination } from '../../entities/destination.entity';
import { ChecklistItem } from '../../entities/checklist-item.entity';
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

    const out: Partial<Journey> = {};
    if ('title' in dto && dto.title !== undefined) out.title = dto.title;
    if ('origin' in dto && dto.origin !== undefined) out.origin = dto.origin;
    if ('destination' in dto && dto.destination !== undefined) {
      out.destination = dto.destination || undefined;
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

  /**
   * placeCount：优先 destinations 表；否则回退 plan.places；再无则定位 entry 数。
   */
  private async placeCount(journeyId: string, plan?: JourneyPlan | null) {
    const destCount = await this.destinations.count({
      where: { journeyId, deletedAt: IsNull() },
    });
    if (destCount > 0) return destCount;
    const p = plan ?? (await this.plans.findOne({ where: { journeyId } }));
    if (p && (p.places ?? []).length > 0) return p.places.length;
    return this.locations
      .createQueryBuilder('loc')
      .innerJoin('loc.entry', 'entry')
      .where('entry.journeyId = :journeyId', { journeyId })
      .getCount();
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

  private async toListItem(j: Journey) {
    const snap = await this.expenseSnapshot(j.id);
    const { days, nights } = this.nightsBetween(j.startDate, j.endDate);
    const recordCount = await this.entryCount(j.id);
    const plan = await this.plans.findOne({ where: { journeyId: j.id } });
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
    return {
      ...j,
      status,
      displayStatus,
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
    };
  }

  toPlanModule(plan: Record<string, any>) {
    return {
      places: plan.places ?? [],
      checks: plan.checks ?? [],
      budgetEstimate: plan.budgetEstimate ?? 0,
      updatedAt: plan.updatedAt ?? null,
    };
  }

  /** 列表项：仅 journey + journeyStats + planProgress */
  toModularListItem(item: Record<string, any>) {
    return {
      journey: this.toJourneyModule(item),
      journeyStats: this.toJourneyStatsModule(item),
      planProgress: this.toPlanProgressModule(item),
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

  private normalizePlaceInput(p: Record<string, any>) {
    const clientId = String(p.clientId ?? p.id ?? '');
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
    return {
      clientId,
      name: String(p.name ?? p.locationName ?? ''),
      note: p.note,
      coverUrl: p.coverUrl ?? p.cover ?? images?.[0],
      lat: Number.isFinite(lat as number) ? (lat as number) : null,
      lng: Number.isFinite(lng as number) ? (lng as number) : null,
      locationName: p.locationName ?? p.address ?? null,
      category: p.category ?? null,
      dayIndex: p.dayIndex != null ? Number(p.dayIndex) : null,
      images: images ?? [],
    };
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
      places: (plan.places ?? []).map((p) => ({
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
        images: p.images ?? (p.coverUrl ? [p.coverUrl] : []),
      })),
      checks: (plan.checks ?? []).map((c) => ({
        id: c.clientId,
        clientId: c.clientId,
        text: c.text,
        done: c.done,
      })),
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
      if (existing) return this.toListItem(existing);
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
    await this.ensurePlan(j.id);
    return this.toListItem(j);
  }

  async list(
    userId: string,
    status?: string,
    displayStatus?: string,
  ) {
    const where: { userId: string; status?: JourneyStatus } = { userId };
    if (status) {
      const n = normalizeStatus(status);
      if (!n) throw new BadRequestException(`invalid status: ${status}`);
      where.status = n;
    }
    const rows = await this.journeys.find({
      where,
      order: { createdAt: 'DESC' },
    });
    const items = await Promise.all(rows.map((j) => this.toListItem(j)));
    if (displayStatus) {
      return items.filter((i) => i.displayStatus === displayStatus);
    }
    return items;
  }

  async detail(userId: string, id: string) {
    const j = await this.owned(userId, id);
    const item = await this.toListItem(j);
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
    return this.toListItem(saved);
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
    return this.toListItem(saved);
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
      return this.toListItem(j);
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
    return this.toListItem(saved);
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
    plan.places = (dto.places ?? []).map((p) =>
      this.normalizePlaceInput(p as any),
    );
    plan.checks = (dto.checks ?? []).map((c) =>
      this.normalizeCheckInput(c as any),
    );
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
      plan.places = dto.places.map((p) => this.normalizePlaceInput(p as any));
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
