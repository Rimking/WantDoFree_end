import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Destination } from '../../entities/destination.entity';
import { Journey } from '../../entities/journey.entity';
import {
  CreateDestinationDto,
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
