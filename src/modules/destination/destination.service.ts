import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { Destination } from '../../entities/destination.entity';
import { Journey } from '../../entities/journey.entity';
import { JourneyPlan } from '../../entities/journey-plan.entity';
import {
  CreateDestinationDto,
  DestinationMapListBodyDto,
  PatchDestinationDto,
  ReorderDestinationsDto,
} from './destination.dto';

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
    };
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
    source: 'destination' | 'plan';
  }) {
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
      isMust: !!p.isMust,
      source: p.source,
    };
  }

  /**
   * 聚合当前用户计划中的选点，按旅程分组（地图连线）。
   * 数据优先级：destinations 表 → 若该旅程无目的地则回退 journey_plans.places。
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
    const destRows = await this.destinations.find({
      where: { journeyId: In(journeyIds), deletedAt: IsNull() },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });

    const destByJourney = new Map<string, ReturnType<DestinationService['toMapPlace']>[]>();
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

    const needPlanFallback = journeyIds.filter(
      (id) => !(destByJourney.get(id)?.length),
    );
    const planRows = needPlanFallback.length
      ? await this.plans.find({ where: { journeyId: In(needPlanFallback) } })
      : [];
    const planByJourney = new Map(planRows.map((p) => [p.journeyId, p]));

    const plans = journeys.map((j) => {
      let places = destByJourney.get(j.id) ?? [];
      if (!places.length) {
        const plan = planByJourney.get(j.id);
        places = (plan?.places ?? []).map((p, i) =>
          this.toMapPlace({
            id: p.clientId,
            name: p.name,
            latitude: p.lat != null ? Number(p.lat) : null,
            longitude: p.lng != null ? Number(p.lng) : null,
            address: p.locationName ?? null,
            category: p.category ?? 'OTHER',
            dayIndex: p.dayIndex,
            sortOrder: i,
            isMust: false,
            source: 'plan',
          }),
        );
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

  private assertCoords(
    lat: number | null | undefined,
    lng: number | null | undefined,
  ) {
    const hasLat = lat != null;
    const hasLng = lng != null;
    if (hasLat !== hasLng) {
      throw new BadRequestException({
        code: '40002',
        message: '地图选点异常，请重新选择',
      });
    }
  }

  private normalizeName(name: string) {
    const n = name.trim();
    if (!n || n.length > 30) {
      throw new BadRequestException({
        code: '40001',
        message: '请输入 1-30 字的名称',
      });
    }
    return n;
  }

  private assertImages(images?: string[]) {
    if (!images) return;
    if (images.length > 9) {
      throw new BadRequestException({
        code: '40003',
        message: '图片最多 9 张，单张不超过 5MB',
      });
    }
  }

  private async assertUniqueName(
    journeyId: string,
    name: string,
    excludeId?: string,
  ) {
    const qb = this.destinations
      .createQueryBuilder('d')
      .where('d.journeyId = :journeyId', { journeyId })
      .andWhere('d.deletedAt IS NULL')
      .andWhere('d.name = :name', { name });
    if (excludeId) qb.andWhere('d.id != :excludeId', { excludeId });
    const exists = await qb.getOne();
    if (exists) {
      throw new ConflictException({
        code: '40901',
        message: '该名称已存在',
      });
    }
  }

  async list(userId: string, journeyId: string) {
    await this.ownedJourney(userId, journeyId);
    const rows = await this.destinations.find({
      where: { journeyId, deletedAt: IsNull() },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
    return rows.map((d) => this.toResponse(d));
  }

  async create(userId: string, journeyId: string, dto: CreateDestinationDto) {
    await this.ownedJourney(userId, journeyId);
    const name = this.normalizeName(dto.name);
    this.assertCoords(dto.latitude, dto.longitude);
    this.assertImages(dto.images);
    await this.assertUniqueName(journeyId, name);

    const max = await this.destinations
      .createQueryBuilder('d')
      .select('MAX(d.sortOrder)', 'max')
      .where('d.journeyId = :journeyId', { journeyId })
      .andWhere('d.deletedAt IS NULL')
      .getRawOne();
    const sortOrder = Number(max?.max ?? -1) + 1;

    const row = await this.destinations.save(
      this.destinations.create({
        journeyId,
        name,
        latitude: dto.latitude != null ? String(dto.latitude) : null,
        longitude: dto.longitude != null ? String(dto.longitude) : null,
        address: dto.address?.trim() || null,
        category: dto.category ?? 'OTHER',
        note: dto.note?.trim() || null,
        images: dto.images ?? [],
        isMust: dto.isMust ?? false,
        dayIndex: dto.dayIndex ?? null,
        sortOrder,
      }),
    );
    return this.toResponse(row);
  }

  async patch(userId: string, destinationId: string, dto: PatchDestinationDto) {
    const row = await this.destinations.findOne({
      where: { id: destinationId, deletedAt: IsNull() },
    });
    if (!row) {
      throw new NotFoundException({ code: '40401', message: '内容已不存在' });
    }
    await this.ownedJourney(userId, row.journeyId);

    if (dto.name !== undefined) {
      const name = this.normalizeName(dto.name);
      await this.assertUniqueName(row.journeyId, name, row.id);
      row.name = name;
    }

    const nextLat =
      dto.latitude !== undefined ? dto.latitude : row.latitude != null
        ? Number(row.latitude)
        : null;
    const nextLng =
      dto.longitude !== undefined ? dto.longitude : row.longitude != null
        ? Number(row.longitude)
        : null;
    if (dto.latitude !== undefined || dto.longitude !== undefined) {
      this.assertCoords(
        dto.latitude !== undefined ? dto.latitude : nextLat,
        dto.longitude !== undefined ? dto.longitude : nextLng,
      );
    }
    if (dto.latitude !== undefined) {
      row.latitude = dto.latitude != null ? String(dto.latitude) : null;
    }
    if (dto.longitude !== undefined) {
      row.longitude = dto.longitude != null ? String(dto.longitude) : null;
    }
    if (dto.address !== undefined) row.address = dto.address?.trim() || null;
    if (dto.category !== undefined) row.category = dto.category;
    if (dto.note !== undefined) row.note = dto.note?.trim() || null;
    if (dto.images !== undefined) {
      this.assertImages(dto.images);
      row.images = dto.images;
    }
    if (dto.isMust !== undefined) row.isMust = dto.isMust;
    if (dto.dayIndex !== undefined) row.dayIndex = dto.dayIndex;

    const saved = await this.destinations.save(row);
    return this.toResponse(saved);
  }

  async softDelete(userId: string, destinationId: string) {
    const row = await this.destinations.findOne({
      where: { id: destinationId, deletedAt: IsNull() },
    });
    if (!row) {
      throw new NotFoundException({ code: '40401', message: '内容已不存在' });
    }
    await this.ownedJourney(userId, row.journeyId);
    row.deletedAt = new Date();
    await this.destinations.save(row);
  }

  async reorder(userId: string, journeyId: string, dto: ReorderDestinationsDto) {
    await this.ownedJourney(userId, journeyId);
    for (const item of dto.items ?? []) {
      const row = await this.destinations.findOne({
        where: { id: item.id, journeyId, deletedAt: IsNull() },
      });
      if (!row) {
        throw new NotFoundException({ code: '40401', message: '内容已不存在' });
      }
      row.sortOrder = item.sortOrder;
      await this.destinations.save(row);
    }
  }

  async countActive(journeyId: string) {
    return this.destinations.count({
      where: { journeyId, deletedAt: IsNull() },
    });
  }
}
