import {
  Injectable,
  NotFoundException,
  GoneException,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { randomBytes } from 'crypto';
import { Share } from '../../entities/share.entity';
import { Journey } from '../../entities/journey.entity';
import { Guide } from '../../entities/guide.entity';
import { User } from '../../entities/user.entity';
import { ShareEvent } from '../../entities/share-event.entity';
import { normalizeThemeTag, themeLabelOf } from '../../common/enums/catalog';
import { normalizeGuideTemplateId } from '../../common/handbook';
import { MemberBenefitService } from '../membership/member-benefit.service';
import { WechatService } from '../../infrastructure/wechat/wechat.service';
import { LocalStorageDriver } from '../../infrastructure/storage/local-storage.driver';
import { CreateWxaCodeDto, ExportPosterDto } from './share.dto';

type GuidePayloadLite = {
  highlights?: Array<{
    type: string;
    title?: string;
    note?: string;
    cover?: string;
    mediaUrl?: string;
  }>;
  cities?: string[];
  route?: string[];
  expense?: { totalCent: number };
};

@Injectable()
export class ShareService {
  constructor(
    @InjectRepository(Share) private readonly shares: Repository<Share>,
    @InjectRepository(Journey)
    private readonly journeys: Repository<Journey>,
    @InjectRepository(Guide) private readonly guides: Repository<Guide>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(ShareEvent)
    private readonly shareEvents: Repository<ShareEvent>,
    private readonly config: ConfigService,
    private readonly benefit: MemberBenefitService,
    private readonly wechat: WechatService,
    private readonly local: LocalStorageDriver,
  ) {}

  /** 生成全局唯一短码（base64url，12 位）。 */
  private async genToken(): Promise<string> {
    for (let i = 0; i < 5; i++) {
      const t = randomBytes(9).toString('base64url').slice(0, 12);
      const exists = await this.shares.findOne({ where: { token: t } });
      if (!exists) return t;
    }
    throw new InternalServerErrorException('share token generation failed');
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

  /** 创建分享票据（owner 调用）。 */
  async createShare(
    userId: string,
    input: { journeyId: string; guideId?: string; visibility?: 'public' | 'unlisted' },
  ) {
    const journey = await this.journeys.findOne({
      where: { id: input.journeyId, userId },
    });
    if (!journey) throw new NotFoundException('journey not found');

    let guideId = input.guideId;
    if (guideId) {
      const g = await this.guides.findOne({
        where: { id: guideId, journeyId: input.journeyId },
      });
      if (!g) throw new NotFoundException('guide not found for journey');
    } else {
      const latest = await this.guides.findOne({
        where: { journeyId: input.journeyId },
        order: { createdAt: 'DESC' },
      });
      guideId = latest?.id;
    }

    const token = await this.genToken();
    const share = await this.shares.save(
      this.shares.create({
        token,
        journeyId: journey.id,
        guideId: guideId ?? null,
        sharerId: userId,
        visibility: input.visibility ?? 'unlisted',
      }),
    );

    const guide = guideId
      ? await this.guides.findOne({ where: { id: guideId } })
      : null;
    const path = `/pages/ShareView/ShareView?t=${token}`;
    const webBase =
      this.config.get<string>('APP_PUBLIC_BASE_URL') || 'https://duqingchuan.app/s';
    const title = `${journey.title} · 旅程手帐`;
    const image = guide?.coverUrl ?? journey.coverUrl ?? undefined;
    const sharer = await this.users.findOne({ where: { id: userId } });
    const exportPolicy = sharer
      ? this.benefit.exportPolicyOf(sharer)
      : {
          watermark: true,
          watermarkText: '渡清川·免费版',
          maxResolution: 720 as const,
        };

    return {
      token,
      sharePath: path,
      visibility: share.visibility,
      exportPolicy,
      channels: {
        friend: { title, path, image },
        moments: { title, path, image },
        link: { url: `${webBase}/${token}` },
        poster: {
          title,
          cover: image,
          path,
          watermark: exportPolicy.watermark,
          watermarkText: exportPolicy.watermarkText,
          maxResolution: exportPolicy.maxResolution,
        },
        saveImage: {
          watermark: exportPolicy.watermark,
          watermarkText: exportPolicy.watermarkText,
          maxResolution: exportPolicy.maxResolution,
        },
      },
    };
  }

  /** 当前用户导出策略（分享面板红绿标）。 */
  async exportPolicyForUser(userId: string) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('user not found');
    this.benefit.reconcileExpiry(user);
    await this.users.save(user);
    return this.benefit.exportPolicyOf(user);
  }

  /** 免登录只读内容（脱敏：不含精确经纬度）。 */
  async getShare(token: string) {
    const share = await this.shares.findOne({ where: { token } });
    if (!share) throw new NotFoundException('share not found');
    if (share.expireAt && share.expireAt.getTime() < Date.now()) {
      throw new GoneException('share link expired');
    }

    const journey = await this.journeys.findOne({
      where: { id: share.journeyId },
    });
    if (!journey) throw new NotFoundException('journey not found');

    const guide = share.guideId
      ? await this.guides.findOne({ where: { id: share.guideId } })
      : await this.guides.findOne({
          where: { journeyId: share.journeyId },
          order: { createdAt: 'DESC' },
        });
    if (!guide || !guide.payload) throw new NotFoundException('guide not ready');

    const sharer = await this.users.findOne({ where: { id: share.sharerId } });

    const payload = guide.payload as GuidePayloadLite | null;
    const { days, nights } = this.nightsBetween(
      journey.startDate,
      journey.endDate,
    );
    const themeTags = (journey.themeTags ?? [])
      .map((t) => normalizeThemeTag(t) ?? t)
      .filter(Boolean);
    const highlights = (payload?.highlights ?? []).map((h) => ({
      type: h.type,
      title: h.title ?? '',
      note: h.note,
      cover: h.cover ?? h.mediaUrl ?? undefined,
    }));

    return {
      token: share.token,
      visibility: share.visibility,
      exportPolicy: sharer
        ? this.benefit.exportPolicyOf(sharer)
        : {
            watermark: true,
            watermarkText: '渡清川·免费版',
            maxResolution: 720 as const,
          },
      sharer: sharer
        ? { id: sharer.id, nick: sharer.nick ?? '', avatar: sharer.avatar ?? null }
        : null,
      journey: {
        id: journey.id,
        title: journey.title,
        origin: journey.origin,
        destination: journey.destination ?? null,
        startDate: journey.startDate,
        endDate: journey.endDate,
        days,
        nights,
        themeTags,
        themeLabel: themeLabelOf(themeTags),
        coverUrl: journey.coverUrl ?? null,
      },
      guide: {
        id: guide.id,
        coverUrl: guide.coverUrl ?? null,
        totalCostCent: guide.totalCost ?? payload?.expense?.totalCent ?? 0,
        highlights,
        cities: payload?.cities ?? [],
        // 仅路线名，不含精确坐标（隐私）
        route: payload?.route ?? [],
      },
      createdAt: share.createdAt,
    };
  }

  /** 归因（免登录，幂等）。viewerId 同一 journey 只记一次 view。 */
  async viewShare(token: string, viewerId?: string) {
    const share = await this.shares.findOne({ where: { token } });
    if (!share) throw new NotFoundException('share not found');
    if (share.expireAt && share.expireAt.getTime() < Date.now()) {
      throw new GoneException('share link expired');
    }

    if (viewerId) {
      const dup = await this.shareEvents.findOne({
        where: { journeyId: share.journeyId, channel: 'view', viewerId },
      });
      if (dup) return { ok: true, attributed: false };
    }

    await this.shareEvents.save(
      this.shareEvents.create({
        journeyId: share.journeyId,
        guideId: share.guideId ?? undefined,
        channel: 'view',
        sharerId: share.sharerId,
        viewerId: viewerId ?? undefined,
      }),
    );
    return { ok: true, attributed: true };
  }

  /** owner 分享统计（次数/浏览/带来注册/会员转化 + 各篇表现）。 */
  async getShareStats(userId: string) {
    const myShares = await this.shares.find({ where: { sharerId: userId } });
    const events = await this.shareEvents.find({ where: { sharerId: userId } });

    const shareCountByChannel: Record<string, number> = {};
    for (const e of events) {
      if (e.channel === 'view') continue;
      shareCountByChannel[e.channel] = (shareCountByChannel[e.channel] ?? 0) + 1;
    }

    const viewEvents = events.filter((e) => e.channel === 'view');
    const views = viewEvents.length;
    const viewerIds = [
      ...new Set(
        viewEvents
          .map((e) => e.viewerId)
          .filter((v): v is string => Boolean(v)),
      ),
    ];
    const uniqueViewers = viewerIds.length;

    let proConversions = 0;
    if (viewerIds.length) {
      const pros = await this.users.find({
        where: { id: In(viewerIds), plan: 'pro' },
      });
      proConversions = pros.length;
    }

    const journeyIds = [...new Set(myShares.map((s) => s.journeyId))];
    const journeys = journeyIds.length
      ? await this.journeys.find({ where: { id: In(journeyIds) } })
      : [];
    const titleOf = (jid: string) =>
      journeys.find((j) => j.id === jid)?.title ?? '';

    const shares = myShares.map((s) => ({
      token: s.token,
      journeyId: s.journeyId,
      journeyTitle: titleOf(s.journeyId),
      visibility: s.visibility,
      views: viewEvents.filter((e) => e.journeyId === s.journeyId).length,
      shares: events.filter(
        (e) => e.channel !== 'view' && e.journeyId === s.journeyId,
      ).length,
    }));

    return {
      totalShares: myShares.length,
      shareCountByChannel,
      views,
      uniqueViewers,
      broughtRegistrations: uniqueViewers,
      proConversions,
      shares,
    };
  }

  /**
   * 登记客户端出图结果（Canvas → media 上传后回传 URL）。
   * 服务端暂不做像素渲染；返回可分享的 imageUrl + 策略。
   */
  async exportPoster(userId: string, dto: ExportPosterDto) {
    const journey = await this.journeys.findOne({
      where: { id: dto.journeyId, userId },
    });
    if (!journey) throw new NotFoundException('journey not found');
    const templateId = normalizeGuideTemplateId(dto.templateId);
    const user = await this.users.findOne({ where: { id: userId } });
    const exportPolicy = user
      ? this.benefit.exportPolicyOf(user)
      : {
          watermark: true,
          watermarkText: '渡清川·免费版',
          maxResolution: 720 as const,
        };

    let token = dto.shareToken ?? null;
    if (token) {
      const s = await this.shares.findOne({
        where: { token, sharerId: userId },
      });
      if (!s) throw new NotFoundException('share token not found');
    }

    return {
      ok: true,
      mode: 'client_render' as const,
      journeyId: journey.id,
      templateId,
      imageUrl: dto.imageUrl,
      shareToken: token,
      exportPolicy,
      note: '海报由客户端按 templateId 渲染后上传；本接口登记 URL 供分享通道使用',
    };
  }

  /** 生成带 journey/shareToken 的小程序码，落本地 files。 */
  async createWxaCode(userId: string, dto: CreateWxaCodeDto) {
    if (!dto.journeyId && !dto.shareToken) {
      throw new BadRequestException({
        code: '40001',
        message: 'journeyId 或 shareToken 至少传一个',
      });
    }

    let journeyId = dto.journeyId;
    let token = dto.shareToken;
    if (token) {
      const share = await this.shares.findOne({
        where: { token, sharerId: userId },
      });
      if (!share) throw new NotFoundException('share not found');
      journeyId = share.journeyId;
    } else if (journeyId) {
      const j = await this.journeys.findOne({
        where: { id: journeyId, userId },
      });
      if (!j) throw new NotFoundException('journey not found');
    }

    const scene = (token || `j=${String(journeyId).replace(/-/g, '').slice(0, 30)}`).slice(
      0,
      32,
    );
    const page = dto.page || 'pages/ShareView/ShareView';

    let buffer: Buffer;
    let mock = false;
    const wx = await this.wechat.getUnlimitedWxaCode({ scene, page });
    if (wx) {
      buffer = wx.buffer;
      mock = wx.mock;
    } else {
      // 开发占位：1x1 PNG
      mock = true;
      buffer = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64',
      );
    }

    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const key = `${y}/${m}/${d}/wxacode-${scene.replace(/[^a-zA-Z0-9_-]/g, '')}.png`;
    await this.local.writeFile(key, buffer);
    const imageUrl = this.local.resolveUrl(key);

    return {
      ok: true,
      mock,
      scene,
      page,
      journeyId: journeyId ?? null,
      shareToken: token ?? null,
      imageUrl,
    };
  }
}
