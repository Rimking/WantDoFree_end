import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../entities/user.entity';
import { Journey } from '../../entities/journey.entity';
import { Entry } from '../../entities/entry.entity';
import { MediaService } from '../media/media.service';
import { sizeNumber } from '../media/media.util';

/**
 * R6 隐私合规：数据导出（PIPL 可携带权）。
 * 位置清除见 LocationModule；生成攻略脱敏见 GuideService（isPublic）。
 */
@Injectable()
export class PrivacyService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Journey) private readonly journeys: Repository<Journey>,
    @InjectRepository(Entry) private readonly entries: Repository<Entry>,
    private readonly mediaService: MediaService,
  ) {}

  async exportAll(userId: string) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('user not found');

    const journeys = await this.journeys.find({
      where: { userId },
      order: { createdAt: 'ASC' },
    });

    const packs: Array<{ journey: Record<string, unknown>; entries: unknown[] }> =
      [];
    for (const j of journeys) {
      const entries = await this.entries.find({
        where: { journeyId: j.id },
        relations: ['location', 'expense'],
        order: { createdAt: 'ASC' },
      });
      await this.mediaService.attachToEntries(entries);
      packs.push({
        journey: {
          id: j.id,
          title: j.title,
          destination: j.destination,
          startDate: j.startDate,
          endDate: j.endDate,
          status: j.status,
          themeTags: j.themeTags,
          companions: j.companions,
          budgetAmount: j.budgetAmount,
          isPublic: j.isPublic,
          coverUrl: j.coverUrl,
          createdAt: j.createdAt,
          updatedAt: j.updatedAt,
        },
        entries: entries.map((e) => ({
          id: e.id,
          type: e.type,
          content: e.content,
          clientId: e.clientId,
          syncVersion: e.syncVersion,
          payload: e.payload,
          createdAt: e.createdAt,
          location: e.location
            ? {
                lat: e.location.lat,
                lng: e.location.lng,
                name: e.location.name,
              }
            : null,
          expense: e.expense
            ? {
                amountCent: e.expense.amountCent,
                category: e.expense.category,
                currency: e.expense.currency,
              }
            : null,
          media: (e.media ?? []).map((m) => ({
            kind: m.kind,
            url: m.url,
            sizeBytes: sizeNumber(m.sizeBytes),
          })),
        })),
      });
    }

    return {
      exportedAt: new Date().toISOString(),
      user: {
        id: user.id,
        openid: user.openid,
        nick: user.nick,
        avatar: user.avatar,
        plan: user.plan,
        createdAt: user.createdAt,
      },
      journeys: packs,
    };
  }
}
