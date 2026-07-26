import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { ChecklistItem } from '../../entities/checklist-item.entity';
import { Journey } from '../../entities/journey.entity';
import { DEFAULT_PLAN_CHECKS } from '../../common/enums/catalog';
import {
  CreateChecklistDto,
  PatchChecklistDto,
  ReorderChecklistDto,
  ToggleChecklistDto,
} from './checklist.dto';

@Injectable()
export class ChecklistService {
  constructor(
    @InjectRepository(ChecklistItem)
    private readonly items: Repository<ChecklistItem>,
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

  private toResponse(row: ChecklistItem) {
    return {
      id: row.id,
      journeyId: row.journeyId,
      title: row.title,
      isDefaultChecked: !!row.isDefaultChecked,
      remindBeforeDays: row.remindBeforeDays ?? null,
      sortOrder: row.sortOrder,
      isChecked: !!row.isChecked,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private normalizeTitle(title: string) {
    const t = title.trim();
    if (!t || t.length > 30) {
      throw new BadRequestException({
        code: '40001',
        message: '请输入 1-30 字的名称',
      });
    }
    return t;
  }

  private async assertUniqueTitle(
    journeyId: string,
    title: string,
    excludeId?: string,
  ) {
    const qb = this.items
      .createQueryBuilder('c')
      .where('c.journeyId = :journeyId', { journeyId })
      .andWhere('c.deletedAt IS NULL')
      .andWhere('c.title = :title', { title });
    if (excludeId) qb.andWhere('c.id != :excludeId', { excludeId });
    if (await qb.getOne()) {
      throw new ConflictException({
        code: '40901',
        message: '该名称已存在',
      });
    }
  }

  /** 新建旅程时写入默认准备事项（护照/机票等） */
  async seedDefaults(journeyId: string) {
    const count = await this.items.count({
      where: { journeyId, deletedAt: IsNull() },
    });
    if (count > 0) return;
    let order = 0;
    for (const c of DEFAULT_PLAN_CHECKS) {
      await this.items.save(
        this.items.create({
          journeyId,
          title: c.text,
          isDefaultChecked: false,
          isChecked: !!c.done,
          remindBeforeDays: null,
          sortOrder: order++,
        }),
      );
    }
  }

  async list(userId: string, journeyId: string) {
    await this.ownedJourney(userId, journeyId);
    await this.seedDefaults(journeyId);
    const rows = await this.items.find({
      where: { journeyId, deletedAt: IsNull() },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
    return rows.map((r) => this.toResponse(r));
  }

  async create(userId: string, journeyId: string, dto: CreateChecklistDto) {
    await this.ownedJourney(userId, journeyId);
    const title = this.normalizeTitle(dto.title);
    await this.assertUniqueTitle(journeyId, title);

    const max = await this.items
      .createQueryBuilder('c')
      .select('MAX(c.sortOrder)', 'max')
      .where('c.journeyId = :journeyId', { journeyId })
      .andWhere('c.deletedAt IS NULL')
      .getRawOne();
    const sortOrder = Number(max?.max ?? -1) + 1;
    const isDefaultChecked = dto.isDefaultChecked ?? false;

    const row = await this.items.save(
      this.items.create({
        journeyId,
        title,
        isDefaultChecked,
        remindBeforeDays: dto.remindBeforeDays ?? null,
        sortOrder,
        isChecked: isDefaultChecked,
      }),
    );
    return this.toResponse(row);
  }

  async patch(userId: string, itemId: string, dto: PatchChecklistDto) {
    const row = await this.items.findOne({
      where: { id: itemId, deletedAt: IsNull() },
    });
    if (!row) {
      throw new NotFoundException({ code: '40401', message: '内容已不存在' });
    }
    await this.ownedJourney(userId, row.journeyId);

    if (dto.title !== undefined) {
      const title = this.normalizeTitle(dto.title);
      await this.assertUniqueTitle(row.journeyId, title, row.id);
      row.title = title;
    }
    if (dto.isDefaultChecked !== undefined) {
      row.isDefaultChecked = dto.isDefaultChecked;
    }
    if (dto.remindBeforeDays !== undefined) {
      row.remindBeforeDays = dto.remindBeforeDays;
    }
    if (dto.sortOrder !== undefined) row.sortOrder = dto.sortOrder;

    return this.toResponse(await this.items.save(row));
  }

  async toggle(userId: string, itemId: string, dto: ToggleChecklistDto) {
    const row = await this.items.findOne({
      where: { id: itemId, deletedAt: IsNull() },
    });
    if (!row) {
      throw new NotFoundException({ code: '40401', message: '内容已不存在' });
    }
    await this.ownedJourney(userId, row.journeyId);
    row.isChecked = dto.isChecked;
    return this.toResponse(await this.items.save(row));
  }

  async softDelete(userId: string, itemId: string) {
    const row = await this.items.findOne({
      where: { id: itemId, deletedAt: IsNull() },
    });
    if (!row) {
      throw new NotFoundException({ code: '40401', message: '内容已不存在' });
    }
    await this.ownedJourney(userId, row.journeyId);
    row.deletedAt = new Date();
    await this.items.save(row);
  }

  async reorder(userId: string, journeyId: string, dto: ReorderChecklistDto) {
    await this.ownedJourney(userId, journeyId);
    for (const item of dto.items ?? []) {
      const row = await this.items.findOne({
        where: { id: item.id, journeyId, deletedAt: IsNull() },
      });
      if (!row) {
        throw new NotFoundException({ code: '40401', message: '内容已不存在' });
      }
      row.sortOrder = item.sortOrder;
      await this.items.save(row);
    }
  }

  async progressOf(journeyId: string) {
    const rows = await this.items.find({
      where: { journeyId, deletedAt: IsNull() },
    });
    if (!rows.length) {
      return { planProgress: 0, confirmedCount: 0, checkTotal: 0 };
    }
    const confirmedCount = rows.filter((r) => r.isChecked).length;
    return {
      planProgress: Math.round((confirmedCount / rows.length) * 100),
      confirmedCount,
      checkTotal: rows.length,
    };
  }
}
