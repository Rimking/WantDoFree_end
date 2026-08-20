import { formatDateTime } from '../../common/datetime.util';

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Journey } from '../../entities/journey.entity';
import { Entry } from '../../entities/entry.entity';
import { Guide } from '../../entities/guide.entity';
import {
  normalizeExpenseCategory,
  normalizeThemeTag,
  themeLabelOf,
} from '../../common/enums/catalog';
import { MediaService } from '../media/media.service';
import { toLegacyKind } from '../media/media.util';
import {
  HANDBOOK_MIN_RECORDS,
  normalizeGuideTemplateId,
} from '../../common/handbook';

type GuidePayload = {
  highlights: Array<{
    entryId: string;
    recordingId: string;
    type: string;
    title?: string;
    note?: string;
    content?: string;
    cover?: string;
    mediaUrl?: string;
    createdAt: string | null;
  }>;
  places: Array<{ name?: string; lat?: number; lng?: number }>;
  cities: string[];
  route: string[];
  expense: {
    totalCent: number;
    byCategory: Array<{
      category: string;
      amountCent: number;
      ratio: number;
      count?: number;
    }>;
  };
  meta: {
    title: string;
    origin: string;
    destination: string | null;
    startDate: string;
    endDate: string;
    days: number;
    nights: number;
    themeTags: string[];
    isPublic: boolean;
    template: string;
  };
};

@Injectable()
export class GuideService {
  constructor(
    @InjectRepository(Journey) private readonly journeys: Repository<Journey>,
    @InjectRepository(Entry) private readonly entries: Repository<Entry>,
    @InjectRepository(Guide) private readonly guides: Repository<Guide>,
    private readonly mediaService: MediaService,
  ) {}

  private hasPhoto(e: Entry) {
    return (
      e.type === 'photo' ||
      (e.media ?? []).some((m) => toLegacyKind(m.kind) === 'photo')
    );
  }

  async checkEligibility(userId: string, journeyId: string) {
    await this.requireOwnedJourney(userId, journeyId);
    const entries = await this.entries.find({
      where: { journeyId },
      relations: ['location'],
    });
    await this.mediaService.attachToEntries(entries);

    const hasPhoto = entries.some((e) => this.hasPhoto(e));
    const hasLocation = entries.some(
      (e) => e.type === 'location' || Boolean(e.location),
    );

    if (entries.length < HANDBOOK_MIN_RECORDS) {
      return {
        canGenerate: false as const,
        reason: `再多记几笔（至少 ${HANDBOOK_MIN_RECORDS} 条记录）再生成游记`,
        stats: {
          entryCount: entries.length,
          minRecords: HANDBOOK_MIN_RECORDS,
          hasPhoto,
          hasLocation,
        },
      };
    }
    if (!hasPhoto && !hasLocation) {
      return {
        canGenerate: false as const,
        reason: '再多记几笔（需要至少一张照片或一个定位）',
        stats: {
          entryCount: entries.length,
          hasPhoto,
          hasLocation,
        },
      };
    }
    return {
      canGenerate: true as const,
      reason: null,
      stats: {
        entryCount: entries.length,
        hasPhoto,
        hasLocation,
      },
    };
  }

  async generate(
    userId: string,
    journeyId: string,
    opts: {
      template?: string;
      templateId?: string;
      force?: boolean;
    } = {},
  ) {
    const journey = await this.requireOwnedJourney(userId, journeyId);
    const templateId = normalizeGuideTemplateId(
      opts.templateId ?? opts.template,
    );
    const existing = await this.guides.findOne({ where: { journeyId } });
    // 幂等：已有完整游记且未要求强制重算时，直接返回
    if (existing?.payload && !opts.force) {
      return {
        canGenerate: true,
        exists: true,
        idempotent: true,
        ...this.toGuideResponse(existing),
      };
    }

    const eligibility = await this.checkEligibility(userId, journeyId);
    if (!eligibility.canGenerate) {
      throw new BadRequestException({
        code: 'GUIDE_NOT_READY',
        canGenerate: false,
        reason: eligibility.reason,
        stats: eligibility.stats,
        message: eligibility.reason,
      });
    }

    const payload = await this.buildPayload(journey, templateId);

    let guide = existing ?? this.guides.create({ journeyId });
    guide.template = templateId;
    guide.payload = payload;
    guide.coverUrl =
      journey.coverUrl ??
      payload.highlights.find((h) => h.cover || h.mediaUrl)?.cover ??
      payload.highlights.find((h) => h.mediaUrl)?.mediaUrl ??
      undefined;
    guide.totalCost = payload.expense.totalCent;
    guide = await this.guides.save(guide);

    return {
      canGenerate: true,
      exists: true,
      idempotent: false,
      forced: Boolean(opts.force),
      ...this.toGuideResponse(guide),
    };
  }

  /** GET /journeys/:id/guide — 按旅程取最新攻略 */
  async getByJourney(userId: string, journeyId: string) {
    await this.requireOwnedJourney(userId, journeyId);
    const guide = await this.guides.findOne({ where: { journeyId } });
    if (!guide || !guide.payload) {
      throw new NotFoundException({
        code: 'GUIDE_NOT_FOUND',
        exists: false,
        message: 'guide not found for journey',
      });
    }
    return { exists: true, ...this.toGuideResponse(guide) };
  }

  /**
   * 单查 / 聚合用：不抛 404；附带 canGenerate。
   * 响应模块 key = guide
   * @param withEligibility false 时精简：仅 exists + 攻略本体（详情聚合用；
   *   资格信息前端走独立 guideApi.check 获取）
   */
  async getForAggregate(
    userId: string,
    journeyId: string,
    withEligibility = true,
  ) {
    await this.requireOwnedJourney(userId, journeyId);
    const guide = await this.guides.findOne({ where: { journeyId } });
    if (!guide || !guide.payload) {
      if (!withEligibility) return { exists: false };
      const eligibility = await this.checkEligibility(userId, journeyId);
      return {
        exists: false,
        canGenerate: eligibility.canGenerate,
        reason: eligibility.reason,
        stats: eligibility.stats,
      };
    }
    if (!withEligibility) {
      return { exists: true, ...this.toGuideResponse(guide) };
    }
    const eligibility = await this.checkEligibility(userId, journeyId);
    return {
      exists: true,
      canGenerate: true,
      reason: null,
      stats: eligibility.stats,
      ...this.toGuideResponse(guide),
    };
  }

  async getById(userId: string, guideId: string) {
    const guide = await this.guides.findOne({
      where: { id: guideId },
      relations: ['journey'],
    });
    if (!guide) throw new NotFoundException('guide not found');
    if (guide.journey.userId !== userId) {
      throw new ForbiddenException('guide does not belong to current user');
    }
    if (!guide.payload) {
      return this.generate(userId, guide.journeyId, {
        templateId: guide.template || 'basic',
        force: true,
      });
    }
    return { exists: true, ...this.toGuideResponse(guide) };
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

  private async buildPayload(
    journey: Journey,
    template: string,
  ): Promise<GuidePayload> {
    const entries = await this.entries.find({
      where: { journeyId: journey.id },
      relations: ['location', 'expenses'],
      order: { createdAt: 'ASC' },
    });
    await this.mediaService.attachToEntries(entries);

    const publicLoc = journey.isPublic;
    const { days, nights } = this.nightsBetween(
      journey.startDate,
      journey.endDate,
    );
    const themeTags = (journey.themeTags ?? [])
      .map((t) => normalizeThemeTag(t) ?? t)
      .filter(Boolean);

    const withPhoto = entries.filter((e) => this.hasPhoto(e));
    const rest = entries.filter((e) => !withPhoto.includes(e));
    const ordered = [...withPhoto, ...rest];

    const highlights = ordered.slice(0, 12).map((e) => {
      const photo = (e.media ?? []).find(
        (m) => toLegacyKind(m.kind) === 'photo',
      );
      const mediaUrl = photo?.url;
      const locName = e.location?.name;
      const note = e.content?.trim()
        ? e.content
        : locName
          ? `📍 ${locName}`
          : undefined;
      return {
        entryId: e.id,
        recordingId: e.id,
        type: e.type,
        title: e.content?.slice(0, 32) || locName || e.type,
        note,
        content: e.content,
        cover: mediaUrl,
        mediaUrl,
        createdAt: formatDateTime(e.createdAt),
      };
    });

    const places = entries
      .filter((e) => e.location)
      .map((e) => {
        const loc = e.location!;
        if (publicLoc) {
          return { name: loc.name, lat: loc.lat, lng: loc.lng };
        }
        return { name: loc.name };
      });

    const route = places
      .map((p) => p.name)
      .filter((n): n is string => Boolean(n));

    const cities = [...new Set(route)];

    const categoryMap = new Map<string, number>();
    const categoryCount = new Map<string, number>();
    let totalCent = 0;
    for (const e of entries) {
      for (const exp of e.expenses ?? []) {
        totalCent += exp.amountCent;
        const cat =
          normalizeExpenseCategory(exp.category) ?? exp.category;
        categoryMap.set(cat, (categoryMap.get(cat) ?? 0) + exp.amountCent);
        categoryCount.set(cat, (categoryCount.get(cat) ?? 0) + 1);
      }
    }
    const byCategory = [...categoryMap.entries()].map(
      ([category, amountCent]) => ({
        category,
        amountCent,
        ratio: totalCent ? Number((amountCent / totalCent).toFixed(4)) : 0,
        count: categoryCount.get(category) ?? 0,
      }),
    );

    return {
      highlights,
      places,
      cities,
      route,
      expense: { totalCent, byCategory },
      meta: {
        title: journey.title,
        origin: journey.origin,
        destination: journey.destination ?? null,
        startDate: journey.startDate,
        endDate: journey.endDate,
        days,
        nights,
        themeTags,
        isPublic: journey.isPublic,
        template,
      },
    };
  }

  private toGuideResponse(guide: Guide) {
    const payload = guide.payload as GuidePayload | null;
    const cities = payload?.cities ?? [];
    const themeTags = payload?.meta?.themeTags ?? [];
    const byCategory = payload?.expense?.byCategory ?? [];
    const totalCostCent = guide.totalCost ?? payload?.expense?.totalCent ?? 0;
    const coverUrl = guide.coverUrl ?? null;
    return {
      id: guide.id,
      journeyId: guide.journeyId,
      templateId: guide.template,
      /** 产品名：游记；接口资源名仍为 guide */
      productName: '游记',
      payload,
      days: payload?.meta?.days ?? null,
      nights: payload?.meta?.nights ?? null,
      cityCount: cities.length,
      cities,
      themeLabel: themeLabelOf(themeTags),
      highlights: payload?.highlights ?? [],
      coverUrl,
      cover: coverUrl,
      isFavorited: guide.isFavorited,
      totalCostCent,
      totalExpense: totalCostCent,
      byCategory,
      createdAt: formatDateTime(guide.createdAt),
    };
  }

  private async requireOwnedJourney(userId: string, journeyId: string) {
    const journey = await this.journeys.findOne({
      where: { id: journeyId, userId },
    });
    if (!journey) throw new NotFoundException('journey not found');
    return journey;
  }
}
