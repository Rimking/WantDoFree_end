import {
  BadRequestException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { Destination } from '../../entities/destination.entity';
import { Journey } from '../../entities/journey.entity';
import { JourneyPlan } from '../../entities/journey-plan.entity';
import type { PlanPlaceIntent } from '../../entities/journey-plan.entity';
import {
  CreateDestinationDto,
  DestinationMapListBodyDto,
  PatchDestinationDto,
  ReorderDestinationsDto,
} from './destination.dto';

/** 双轨收敛：结构化地点真源为 plan.places；本模块写接口返回 410 */
const DEST_WRITE_GONE = {
  code: '41001',
  message: '目的地清单已废弃，请使用 POST /journeys/plan/save 写入 plan.places',
};

@Injectable()
export class DestinationService {
  constructor(
    @InjectRepository(Destination)
    private readonly destinations: Repository<Destination>,
    @InjectRepository(Journey)
    private readonly journeys: Repository<Journey>,
    @InjectRepository(JourneyPlan)
    private readonly plans: Repository<JourneyPlan>,
  ) {}

  private async ownedJourney(userId: string, journeyId: string) {
    const j = await this.journeys.findOne({ where: { id: journeyId, userId } });
    if (!j) {
      throw new NotFoundException({
        code: '40401',
        message: '内容已不存在',
      });
    }
    return j;
  }

  private toResponse(d: Destination) {
    return {
      id: d.id,
      journeyId: d.journeyId,
      name: d.name,
      latitude: d.latitude != null ? Number(d.latitude) : null,
      longitude: d.longitude != null ? Number(d.longitude) : null,
      address: d.address ?? null,
      category: d.category,
      note: d.note ?? null,
      images: d.images ?? [],
      isMust: !!d.isMust,
      dayIndex: d.dayIndex ?? null,
      sortOrder: d.sortOrder,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      deprecated: true,
    };
  }

  private normalizeIntent(
    raw: unknown,
    dayIndex: number | null,
    isMust?: boolean,
  ): PlanPlaceIntent {
    if (isMust) return 'must';
    const v = String(raw ?? '')
      .trim()
      .toLowerCase();
    if (v === 'wish' || v === 'planned' || v === 'must') return v;
    if (dayIndex != null && dayIndex > 0) return 'planned';
    return 'wish';
  }

  private toMapPlace(p: {
    id: string;
    name: string;
    latitude: number | null;
    longitude: number | null;
    address: string | null;
    category?: string | null;
    dayIndex?: number | null;
    sortOrder?: number;
    isMust?: boolean;
    intent?: PlanPlaceIntent | null;
    source: 'destination' | 'plan';
  }) {
    const intent = this.normalizeIntent(p.intent, p.dayIndex ?? null, p.isMust);
    return {
      id: p.id,
      name: p.name,
      latitude: p.latitude,
      longitude: p.longitude,
      /** 别名，方便地图 SDK */
      lat: p.latitude,
      lng: p.longitude,
      address: p.address,
      category: p.category ?? 'OTHER',
      dayIndex: p.dayIndex ?? null,
      sortOrder: p.sortOrder ?? 0,
      isMust: intent === 'must',
      intent,
      source: p.source,
    };
  }

  /**
   * 聚合当前用户计划中的选点，按旅程分组（地图连线）。
   * 真源优先：journey_plans.places（有坐标）→ 回退 destinations 表。
   */
  async mapList(userId: string, dto: DestinationMapListBodyDto) {
    const journeyId = dto.journeyId ?? dto.planId;
    const startDate = dto.startDate;
    const endDate = dto.endDate;
    const onlyWithCoords = dto.onlyWithCoords !== false;

    if ((startDate && !endDate) || (!startDate && endDate)) {
      throw new BadRequestException({
        code: '40001',
        message: 'startDate 与 endDate 需成对传入（YYYY-MM-DD）',
      });
    }
    if (startDate && endDate && startDate > endDate) {
      throw new BadRequestException({
        code: '40001',
        message: 'startDate 不能晚于 endDate',
      });
    }

    if (journeyId) {
      await this.ownedJourney(userId, journeyId);
    }

    const qb = this.journeys
      .createQueryBuilder('j')
      .where('j.userId = :userId', { userId });
    if (journeyId) {
      qb.andWhere('j.id = :journeyId', { journeyId });
    }
    if (startDate && endDate) {
      qb.andWhere('j.startDate <= :rend', { rend: endDate }).andWhere(
        'j.endDate >= :rstart',
        { rstart: startDate },
      );
    }
    qb.orderBy('j.startDate', 'ASC').addOrderBy('j.createdAt', 'ASC');
    const journeys = await qb.getMany();

    if (!journeys.length) {
      return {
        range: { startDate: startDate ?? null, endDate: endDate ?? null },
        onlyWithCoords,
        totalPlaces: 0,
        plans: [],
      };
    }

    const journeyIds = journeys.map((j) => j.id);
    const planRows = await this.plans.find({
      where: { journeyId: In(journeyIds) },
    });
    const planByJourney = new Map(planRows.map((p) => [p.journeyId, p]));

    const needDestFallback = journeyIds.filter(
      (id) => !(planByJourney.get(id)?.places?.length),
    );
    const destRows = needDestFallback.length
      ? await this.destinations.find({
          where: { journeyId: In(needDestFallback), deletedAt: IsNull() },
          order: { sortOrder: 'ASC', createdAt: 'ASC' },
        })
      : [];
    const destByJourney = new Map<
      string,
      ReturnType<DestinationService['toMapPlace']>[]
    >();
    for (const d of destRows) {
      const place = this.toMapPlace({
        id: d.id,
        name: d.name,
        latitude: d.latitude != null ? Number(d.latitude) : null,
        longitude: d.longitude != null ? Number(d.longitude) : null,
        address: d.address ?? null,
        category: d.category,
        dayIndex: d.dayIndex,
        sortOrder: d.sortOrder,
        isMust: d.isMust,
        source: 'destination',
      });
      const list = destByJourney.get(d.journeyId) ?? [];
      list.push(place);
      destByJourney.set(d.journeyId, list);
    }

    const plans = journeys.map((j) => {
      const plan = planByJourney.get(j.id);
      let places = (plan?.places ?? []).map((p, i) =>
        this.toMapPlace({
          id: p.clientId,
          name: p.name,
          latitude: p.lat != null ? Number(p.lat) : null,
          longitude: p.lng != null ? Number(p.lng) : null,
          address: p.locationName ?? null,
          category: p.category ?? 'OTHER',
          dayIndex: p.dayIndex,
          sortOrder: p.sortOrder ?? i,
          intent: p.intent,
          isMust: p.intent === 'must',
          source: 'plan',
        }),
      );
      if (!places.length) {
        places = destByJourney.get(j.id) ?? [];
      }

      if (onlyWithCoords) {
        places = places.filter(
          (p) => p.latitude != null && p.longitude != null,
        );
      }

      return {
        journeyId: j.id,
        planId: j.id,
        title: j.title,
        origin: j.origin ?? '',
        destination: j.destination ?? null,
        startDate: j.startDate,
        endDate: j.endDate,
        status: j.status,
        coverUrl: j.coverUrl ?? null,
        placeCount: places.length,
        places,
      };
    });

    const totalPlaces = plans.reduce((s, p) => s + p.placeCount, 0);
    return {
      range: { startDate: startDate ?? null, endDate: endDate ?? null },
      onlyWithCoords,
      totalPlaces,
      plans,
    };
  }

  async list(userId: string, journeyId: string) {
    await this.ownedJourney(userId, journeyId);
    // 兼容只读：优先返回已迁移到 plan.places 的点
    const plan = await this.plans.findOne({ where: { journeyId } });
    if (plan?.places?.length) {
      return plan.places.map((p, i) => ({
        id: p.clientId,
        journeyId,
        name: p.name,
        latitude: p.lat != null ? Number(p.lat) : null,
        longitude: p.lng != null ? Number(p.lng) : null,
        address: p.locationName ?? null,
        category: p.category ?? 'OTHER',
        note: p.note ?? null,
        images: p.images ?? [],
        isMust: p.intent === 'must',
        intent: this.normalizeIntent(p.intent, p.dayIndex ?? null),
        dayIndex: p.dayIndex ?? null,
        sortOrder: p.sortOrder ?? i,
        deprecated: true,
        source: 'plan' as const,
      }));
    }
    const rows = await this.destinations.find({
      where: { journeyId, deletedAt: IsNull() },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
    return rows.map((d) => this.toResponse(d));
  }

  /** @deprecated 请改用 POST /journeys/plan/save */
  async create(
    _userId: string,
    _journeyId: string,
    _dto: CreateDestinationDto,
  ): Promise<never> {
    throw new GoneException(DEST_WRITE_GONE);
  }

  /** @deprecated 请改用 POST /journeys/plan/save */
  async patch(
    _userId: string,
    _destinationId: string,
    _dto: PatchDestinationDto,
  ): Promise<never> {
    throw new GoneException(DEST_WRITE_GONE);
  }

  /** @deprecated 请改用 POST /journeys/plan/save */
  async softDelete(_userId: string, _destinationId: string): Promise<never> {
    throw new GoneException(DEST_WRITE_GONE);
  }

  /** @deprecated 请改用 POST /journeys/plan/save */
  async reorder(
    _userId: string,
    _journeyId: string,
    _dto: ReorderDestinationsDto,
  ): Promise<never> {
    throw new GoneException(DEST_WRITE_GONE);
  }

  async countActive(journeyId: string) {
    const plan = await this.plans.findOne({ where: { journeyId } });
    if (plan?.places?.length) return plan.places.length;
    return this.destinations.count({
      where: { journeyId, deletedAt: IsNull() },
    });
  }
}
