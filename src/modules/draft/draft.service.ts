import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Draft } from '../../entities/draft.entity';
import { UpsertDraftDto } from './draft.dto';

@Injectable()
export class DraftService {
  constructor(
    @InjectRepository(Draft) private readonly drafts: Repository<Draft>,
  ) {}

  list(userId: string, kind?: string) {
    const where: { userId: string; kind?: 'entry' | 'journey' } = { userId };
    if (kind === 'entry' || kind === 'journey') where.kind = kind;
    return this.drafts.find({
      where,
      order: { updatedAt: 'DESC' },
    });
  }

  async get(userId: string, id: string) {
    const d = await this.drafts.findOne({ where: { id, userId } });
    if (!d) throw new NotFoundException('draft not found');
    return d;
  }

  async upsert(userId: string, dto: UpsertDraftDto) {
    if (dto.id) {
      const existing = await this.drafts.findOne({
        where: { id: dto.id, userId },
      });
      if (!existing) throw new NotFoundException('draft not found');
      existing.kind = dto.kind;
      existing.journeyId = dto.journeyId;
      existing.payload = dto.payload;
      return this.drafts.save(existing);
    }
    return this.drafts.save(
      this.drafts.create({
        userId,
        kind: dto.kind,
        journeyId: dto.journeyId,
        payload: dto.payload,
      }),
    );
  }

  async remove(userId: string, id: string) {
    const d = await this.get(userId, id);
    await this.drafts.remove(d);
    return { deleted: true, id };
  }
}
