import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { Journey } from '../../entities/journey.entity';
import { Entry } from '../../entities/entry.entity';
import { Location } from '../../entities/location.entity';
import { Expense } from '../../entities/expense.entity';
import { Media } from '../../entities/media.entity';
import {
  PatchRecordDto,
  PatchRecordTimeDto,
  SyncEntryDto,
} from './recording.dto';
import { QuotaService } from '../quota/quota.service';
import { WechatService } from '../../infrastructure/wechat/wechat.service';
import { MediaService } from '../media/media.service';
import {
  inferRecordType,
  normalizeExpenseCategory,
} from '../../common/enums/catalog';
import {
  normalizeMediaKind,
  sizeNumber,
  toLegacyKind,
  toQuotaKind,
} from '../media/media.util';

/** 从 /dream/v1/files/...（兼容旧 /api/v1/files/...）或绝对 URL 抽出 storageKey */
function storageKeyFromMediaUrl(url?: string | null): string | null {
  if (!url) return null;
  try {
    const pathOnly = url.includes('://') ? new URL(url).pathname : url;
    const m = pathOnly.match(
      /\/(?:(?:dream|api)\/v1\/)?files\/(\d{4}\/\d{2}\/\d{2}\/[^/?#]+)$/,
    );
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

@Injectable()
export class RecordingService {
  constructor(
    @InjectRepository(Journey) private readonly journeys: Repository<Journey>,
    @InjectRepository(Entry) private readonly entries: Repository<Entry>,
    @InjectRepository(Media) private readonly mediaRepo: Repository<Media>,
    private readonly dataSource: DataSource,
    private readonly quota: QuotaService,
    private readonly wechat: WechatService,
    private readonly mediaService: MediaService,
  ) {}

  private collectMediaItems(e: SyncEntryDto) {
    const items: Array<{
      url: string;
      kind: 'photo' | 'voice';
      size: number;
      durationSec?: number | null;
      sortOrder?: number;
    }> = [];
    for (const m of e.media ?? []) {
      const kind =
        m.kind === 'image' || m.kind === 'photo' ? 'photo' : 'voice';
      items.push({
        url: m.url,
        kind,
        size: m.size ?? 0,
        durationSec: m.durationSec,
        sortOrder: m.sortOrder,
      });
    }
    if (e.url && e.kind) {
      const kind =
        e.kind === 'image' || e.kind === 'photo' ? 'photo' : 'voice';
      items.push({ url: e.url, kind, size: e.size ?? 0 });
    }
    if (e.voice?.url) {
      items.push({
        url: e.voice.url,
        kind: 'voice',
        size: e.voice.size ?? 0,
        durationSec: e.voice.durationSec,
      });
    }
    for (const v of e.voices ?? []) {
      items.push({
        url: v.url,
        kind: 'voice',
        size: v.size ?? 0,
        durationSec: v.durationSec,
      });
    }
    const seen = new Set<string>();
    return items.filter((m) => {
      const k = `${m.kind}:${m.url}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  private resolveAmountCent(expense: {
    amountCent?: number;
    amount?: number;
  } | null | undefined) {
    if (!expense) return undefined;
    const n = expense.amountCent ?? expense.amount;
    if (n == null || n < 1) {
      throw new BadRequestException('expense.amountCent (or amount) must be >= 1');
    }
    return n;
  }

  /** 有 expenses 以数组为准；否则单笔 expense → 单元素数组；都无则 undefined（不改） */
  private resolveExpenseLines(
    e: Pick<SyncEntryDto, 'expense' | 'expenses'>,
  ): Array<{
    amountCent: number;
    category: string;
    currency?: string;
    note?: string;
  }> | undefined {
    if (e.expenses !== undefined) {
      return e.expenses.map((line) => ({
        amountCent: this.resolveAmountCent(line)!,
        category: normalizeExpenseCategory(line.category) ?? line.category,
        currency: line.currency,
        note: line.note,
      }));
    }
    if (e.expense) {
      return [
        {
          amountCent: this.resolveAmountCent(e.expense)!,
          category:
            normalizeExpenseCategory(e.expense.category) ?? e.expense.category,
          currency: e.expense.currency,
          note: e.expense.note,
        },
      ];
    }
    return undefined;
  }

  private mapExpenseDto(exp: Expense) {
    return {
      id: exp.id,
      amountCent: exp.amountCent,
      amount: exp.amountCent,
      category: normalizeExpenseCategory(exp.category) ?? exp.category,
      currency: exp.currency ?? 'CNY',
      note: exp.note ?? null,
      sortOrder: exp.sortOrder ?? 0,
    };
  }

  private expensesOf(e: Entry): Expense[] {
    const list = (e.expenses ?? []).slice();
    list.sort(
      (a, b) =>
        (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    return list;
  }

  private async replaceExpenses(
    manager: EntityManager,
    entryId: string,
    lines: Array<{
      amountCent: number;
      category: string;
      currency?: string;
      note?: string;
    }>,
  ) {
    await manager
      .createQueryBuilder()
      .delete()
      .from(Expense)
      .where('entryId = :entryId', { entryId })
      .execute();
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      await manager.query(
        `INSERT INTO expenses (id, entryId, amountCent, currency, category, note, sortOrder, createdAt)
         VALUES (UUID(), ?, ?, ?, ?, ?, ?, NOW(6))`,
        [
          entryId,
          line.amountCent,
          line.currency ?? 'CNY',
          line.category,
          line.note ?? null,
          i,
        ],
      );
    }
  }

  private async assertContentSafe(content?: string) {
    if (!content?.trim()) return;
    const ok = await this.wechat.msgSecCheck(content);
    if (!ok) {
      throw new BadRequestException({
        code: 'CONTENT_BLOCKED',
        message: '文字未通过内容安全检查',
      });
    }
  }

  async sync(userId: string, journeyId: string, dtos: SyncEntryDto[]) {
    const journey = await this.journeys.findOne({
      where: { id: journeyId, userId },
    });
    if (!journey) throw new NotFoundException('journey not found');

    for (const e of dtos) {
      await this.assertContentSafe(e.content);
      this.resolveExpenseLines(e);

      const existing = await this.entries.findOne({
        where: { clientId: e.clientId },
      });
      if (existing) continue;
      for (const m of this.collectMediaItems(e)) {
        const amount =
          m.kind === 'photo'
            ? 1
            : Math.max(1, Math.ceil(m.size / 1024));
        await this.quota.assertWithin(userId, m.kind, amount);
      }
    }

    return this.dataSource.transaction(async (manager) => {
      const results: Array<{
        clientId: string;
        id: string;
        syncVersion: number;
        status: string;
        type: string;
      }> = [];

      for (const e of dtos) {
        const type = inferRecordType(e);
        let entry = await manager.findOne(Entry, {
          where: { clientId: e.clientId },
        });

        const firstVoiceDuration =
          e.voice?.durationSec ??
          e.voices?.[0]?.durationSec ??
          e.media?.find(
            (m) => m.kind === 'audio' || m.kind === 'voice',
          )?.durationSec;
        const payload = {
          ...(e.payload as Record<string, unknown> | undefined),
          ...(firstVoiceDuration != null
            ? { durationSec: firstVoiceDuration }
            : {}),
        };

        if (entry) {
          if (entry.journeyId !== journey.id) {
            throw new NotFoundException(
              `clientId ${e.clientId} belongs to another journey`,
            );
          }
          entry.content = e.content ?? entry.content;
          entry.payload = Object.keys(payload).length
            ? payload
            : entry.payload;
          entry.type = type;
          entry.syncVersion += 1;
          entry = await manager.save(entry);
          await this.upsertChildren(manager, entry.id, e, userId, false);
        } else {
          entry = await manager.save(
            manager.create(Entry, {
              journeyId: journey.id,
              clientId: e.clientId,
              type,
              content: e.content,
              payload: Object.keys(payload).length ? payload : undefined,
              recordedAt: new Date(),
            }),
          );
          await this.upsertChildren(manager, entry.id, e, userId, true);
        }

        results.push({
          clientId: entry.clientId,
          id: entry.id,
          syncVersion: entry.syncVersion,
          status: 'synced',
          type: entry.type,
        });
      }

      return { synced: results };
    });
  }

  private async upsertChildren(
    manager: EntityManager,
    entryId: string,
    e: SyncEntryDto,
    userId: string,
    isCreate: boolean,
  ) {
    if (e.location) {
      let loc = await manager.findOne(Location, { where: { entryId } });
      if (loc) {
        loc.lat = e.location.lat;
        loc.lng = e.location.lng;
        loc.name = e.location.name ?? loc.name;
        await manager.save(loc);
      } else {
        await manager.save(
          manager.create(Location, {
            entryId,
            lat: e.location.lat,
            lng: e.location.lng,
            name: e.location.name,
          }),
        );
      }
    }

    const expenseLines = this.resolveExpenseLines(e);
    if (expenseLines !== undefined) {
      await this.replaceExpenses(manager, entryId, expenseLines);
    }

    const mediaItems = this.collectMediaItems(e);
    if (mediaItems.length) {
      const existingMedia = await manager.find(Media, {
        where: { ownerType: 'entry', ownerId: entryId },
      });
      const existingKeys = new Set(
        existingMedia.map((m) => `${toLegacyKind(m.kind)}:${m.url}`),
      );

      let autoSort = 0;
      for (const item of mediaItems) {
        const storageKind = normalizeMediaKind(item.kind) ?? 'image';
        const key = `${item.kind}:${item.url}`;
        const found = existingMedia.find(
          (m) =>
            m.url === item.url && toLegacyKind(m.kind) === item.kind,
        );
        const sortOrder = item.sortOrder ?? autoSort++;
        if (found) {
          found.sizeBytes = item.size ?? sizeNumber(found.sizeBytes);
          if (item.durationSec != null) found.durationSec = item.durationSec;
          if (item.sortOrder != null) found.sortOrder = item.sortOrder;
          if (!found.storageKey) {
            found.storageKey = storageKeyFromMediaUrl(item.url) ?? found.storageKey;
          }
          await manager.save(found);
          continue;
        }
        await manager.save(
          manager.create(Media, {
            ownerType: 'entry',
            ownerId: entryId,
            kind: storageKind,
            url: item.url,
            storageKey: storageKeyFromMediaUrl(item.url),
            mime: storageKind === 'image' ? 'image/jpeg' : 'audio/m4a',
            sizeBytes: item.size ?? 0,
            durationSec: item.durationSec ?? null,
            sortOrder,
            status: 'active',
            createdBy: userId,
            driver: 'local',
          }),
        );
        if (isCreate || !existingKeys.has(key)) {
          const amount =
            item.kind === 'photo'
              ? 1
              : Math.max(1, Math.ceil((item.size ?? 0) / 1024));
          await this.quota.addUsage(userId, item.kind, amount);
        }
      }
    }
  }

  private dayIndexOf(startDate: string, at: Date): number {
    const start = new Date(startDate + 'T00:00:00');
    const created = new Date(at);
    const startDay = Date.UTC(
      start.getFullYear(),
      start.getMonth(),
      start.getDate(),
    );
    const createdDay = Date.UTC(
      created.getFullYear(),
      created.getMonth(),
      created.getDate(),
    );
    const diff = Math.floor((createdDay - startDay) / 86400000);
    return Math.max(1, diff + 1);
  }

  private recordedAtOf(e: Entry) {
    return e.recordedAt ? new Date(e.recordedAt) : new Date(e.createdAt);
  }

  private toEntryResponse(e: Entry, startDate: string) {
    const media = e.media ?? [];
    const voiceMedias = media
      .filter((m) => toLegacyKind(m.kind) === 'voice')
      .slice()
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const voiceMedia = voiceMedias[0];
    const photos = media.filter((m) => toLegacyKind(m.kind) === 'photo');
    const durationSec =
      (e.payload as any)?.durationSec ?? voiceMedia?.durationSec ?? undefined;
    const recordedAt = this.recordedAtOf(e);
    const dayIndex =
      e.dayIndex != null ? e.dayIndex : this.dayIndexOf(startDate, recordedAt);

    const mediaDto = media
      .slice()
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map((m) => {
        const kind = normalizeMediaKind(m.kind) ?? 'image';
        return {
          id: m.id,
          kind,
          legacyKind: toLegacyKind(kind),
          url: m.url,
          thumbUrl: m.thumbUrl ?? null,
          width: m.width ?? null,
          height: m.height ?? null,
          durationSec: m.durationSec ?? null,
          sortOrder: m.sortOrder ?? 0,
          sizeBytes: sizeNumber(m.sizeBytes),
          size: sizeNumber(m.sizeBytes),
        };
      });

    const expenseRows = this.expensesOf(e);
    const expenses = expenseRows.map((x) => this.mapExpenseDto(x));
    const expenseCompat = expenses[0]
      ? {
          ...expenses[0],
          // 兼容：单对象金额为合计，category 仍为首笔
          amountCent: expenses.reduce((s, x) => s + x.amountCent, 0),
          amount: expenses.reduce((s, x) => s + x.amountCent, 0),
        }
      : null;

    const voices = voiceMedias.map((m, i) => ({
      url: m.url,
      durationSec:
        m.durationSec ??
        (i === 0 ? durationSec ?? null : null),
      size: sizeNumber(m.sizeBytes),
      sortOrder: m.sortOrder ?? i,
    }));

    return {
      ...e,
      content: e.content ?? '',
      recordedAt: recordedAt.toISOString(),
      dayIndex,
      images: photos.map((p) => p.url),
      audioUrl: voiceMedia ? voiceMedia.url : null,
      audioDuration: durationSec ?? null,
      locationTag: e.location
        ? {
            name: e.location.name ?? '',
            lat: e.location.lat,
            lng: e.location.lng,
          }
        : null,
      location: e.location ?? null,
      expenses,
      expense: expenseCompat,
      media: mediaDto,
      voices,
      voice: voiceMedia
        ? {
            url: voiceMedia.url,
            durationSec: durationSec ?? null,
            size: sizeNumber(voiceMedia.sizeBytes),
          }
        : null,
    };
  }

  /** 模块化 Entry（聚合 / 单查同构） */
  toEntryModule(raw: Record<string, any>) {
    const voices =
      raw.voices ??
      (raw.media ?? [])
        .filter(
          (m: any) =>
            m.kind === 'audio' ||
            m.legacyKind === 'voice' ||
            m.kind === 'voice',
        )
        .map((m: any) => ({
          url: m.url,
          durationSec: m.durationSec ?? null,
          sortOrder: m.sortOrder ?? 0,
        }));
    const audio =
      raw.voice ??
      (raw.audioUrl
        ? {
            url: raw.audioUrl,
            durationSec: raw.audioDuration ?? null,
          }
        : voices[0]
          ? {
              url: voices[0].url,
              durationSec: voices[0].durationSec ?? null,
            }
          : null);
    const expenses = raw.expenses ?? (raw.expense ? [raw.expense] : []);
    const expense =
      raw.expense ??
      (expenses[0]
        ? {
            amountCent: expenses.reduce(
              (s: number, x: any) => s + Number(x.amountCent ?? 0),
              0,
            ),
            category: expenses[0].category,
            currency: expenses[0].currency ?? 'CNY',
            note: expenses[0].note ?? null,
          }
        : null);
    return {
      id: raw.id,
      clientId: raw.clientId,
      type: raw.type,
      content: raw.content ?? '',
      dayIndex: raw.dayIndex,
      recordedAt: raw.recordedAt,
      createdAt: raw.createdAt,
      syncVersion: raw.syncVersion,
      location: raw.location
        ? {
            lat: raw.location.lat,
            lng: raw.location.lng,
            name: raw.location.name ?? null,
          }
        : raw.locationTag
          ? {
              lat: raw.locationTag.lat,
              lng: raw.locationTag.lng,
              name: raw.locationTag.name ?? null,
            }
          : null,
      expenses: expenses.map((x: any) => ({
        amountCent: x.amountCent,
        category: x.category,
        currency: x.currency ?? 'CNY',
        note: x.note ?? null,
        sortOrder: x.sortOrder ?? 0,
        id: x.id,
      })),
      expense: expense
        ? {
            amountCent: expense.amountCent,
            category: expense.category,
            currency: expense.currency ?? 'CNY',
            note: expense.note ?? null,
          }
        : null,
      media: raw.media ?? [],
      voices,
      audio,
      /** 兼容期；正式客户端请忽略 */
      legacy: {
        images: raw.images ?? [],
        audioUrl: raw.audioUrl ?? null,
        voice: raw.voice ?? null,
      },
    };
  }

  async listByJourney(
    userId: string,
    journeyId: string,
    dayIndex?: number,
  ) {
    const journey = await this.journeys.findOne({
      where: { id: journeyId, userId },
    });
    if (!journey) throw new NotFoundException('journey not found');
    const rows = await this.entries.find({
      where: { journeyId },
      relations: ['location', 'expenses'],
      order: { createdAt: 'ASC' },
    });
    await this.mediaService.attachToEntries(rows);
    const mapped = rows.map((e) => this.toEntryResponse(e, journey.startDate));
    if (dayIndex == null) return mapped;
    return mapped
      .filter((e) => e.dayIndex === dayIndex)
      .sort(
        (a, b) =>
          new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime(),
      );
  }

  /**
   * 首页「最近记录」：当前用户全部记录按时间倒序取 N 条（默认/上限 10）。
   * 不按旅程/计划筛选；时间 = COALESCE(recordedAt, createdAt)。
   */
  async listRecent(userId: string, limit = 10) {
    const take = Math.min(10, Math.max(1, Math.floor(limit) || 10));

    // 先只取 id，避免 expenses 一对多 join 把 take 截乱
    const idRows = await this.entries
      .createQueryBuilder('e')
      .innerJoin('e.journey', 'j')
      .select('e.id', 'id')
      .addSelect('COALESCE(e.recordedAt, e.createdAt)', 'entry_sort_at')
      .where('j.userId = :userId', { userId })
      .orderBy('entry_sort_at', 'DESC')
      .addOrderBy('e.createdAt', 'DESC')
      .limit(take)
      .getRawMany<{ id: string }>();

    const ids = idRows.map((r) => r.id).filter(Boolean);
    if (!ids.length) {
      return { list: [], limit: take, total: 0 };
    }

    const rows = await this.entries.find({
      where: { id: In(ids) },
      relations: ['journey', 'location', 'expenses'],
    });
    const byId = new Map(rows.map((e) => [e.id, e]));
    const ordered = ids
      .map((id) => byId.get(id))
      .filter((e): e is Entry => !!e);

    await this.mediaService.attachToEntries(ordered);

    const list = ordered.map((e) => {
      const flat = this.toEntryResponse(e, e.journey.startDate);
      const mod = this.toEntryModule(flat);
      return {
        ...mod,
        journeyId: e.journeyId,
        journeyTitle: e.journey.title ?? null,
      };
    });

    return { list, limit: take, total: list.length };
  }

  private assertRecordedInRange(
    journey: Journey,
    recordedAt: Date,
  ) {
    const start = new Date(journey.startDate + 'T00:00:00');
    start.setDate(start.getDate() - 1);
    const end = new Date(journey.endDate + 'T23:59:59');
    end.setDate(end.getDate() + 1);
    if (recordedAt < start || recordedAt > end) {
      throw new BadRequestException({
        code: '40001',
        message: '记录时间需在旅程日期范围内（可前后放宽 1 天）',
      });
    }
  }

  private resolvePatchAmountCent(expense: {
    amountCent?: number;
    amount?: number;
  }) {
    if (expense.amountCent != null) {
      return Math.round(expense.amountCent);
    }
    if (expense.amount != null) {
      // 与 sync 一致：amount 一律按「分」
      return Math.round(expense.amount);
    }
    throw new BadRequestException({
      code: '40001',
      message: '请填写消费金额（分），字段 amountCent 或 amount',
    });
  }

  private assertRecordNotEmpty(opts: {
    content?: string | null;
    images?: string[];
    audioUrl?: string | null;
    audios?: Array<{ url: string }> | null;
    hasExistingPhoto?: boolean;
    hasExistingVoice?: boolean;
    clearingImages?: boolean;
    clearingAudio?: boolean;
  }) {
    const hasText = Boolean(opts.content?.trim());
    const hasImage =
      (opts.images && opts.images.length > 0) ||
      (!opts.clearingImages && opts.hasExistingPhoto && opts.images === undefined);
    const hasAudiosArray =
      opts.audios !== undefined && opts.audios !== null && opts.audios.length > 0;
    const hasAudio =
      hasAudiosArray ||
      Boolean(opts.audioUrl) ||
      (!opts.clearingAudio &&
        opts.hasExistingVoice &&
        opts.audioUrl === undefined &&
        opts.audios === undefined);
    if (!hasText && !hasImage && !hasAudio) {
      throw new BadRequestException({
        code: '40004',
        message: '请至少上传一张图片、一段语音或一段文字',
      });
    }
  }

  private resolvePatchAudios(dto: PatchRecordDto): Array<{
    url: string;
    durationSec?: number | null;
  }> | undefined {
    if (dto.audios !== undefined) {
      return dto.audios === null ? [] : dto.audios;
    }
    if (dto.voices !== undefined) {
      return dto.voices === null ? [] : dto.voices;
    }
    if (dto.audioUrl !== undefined) {
      if (dto.audioUrl === null) return [];
      return [{ url: dto.audioUrl, durationSec: dto.audioDuration }];
    }
    return undefined;
  }

  private resolvePatchExpenseLines(dto: PatchRecordDto): Array<{
    amountCent: number;
    category: string;
    currency?: string;
    note?: string;
  }> | undefined {
    if (dto.expenses !== undefined) {
      if (dto.expenses === null) return [];
      return dto.expenses.map((line) => ({
        amountCent: this.resolvePatchAmountCent(line),
        category: normalizeExpenseCategory(line.category) ?? line.category,
        currency: line.currency,
        note: line.note,
      }));
    }
    if (dto.expense !== undefined) {
      if (dto.expense === null) return [];
      return [
        {
          amountCent: this.resolvePatchAmountCent(dto.expense),
          category:
            normalizeExpenseCategory(dto.expense.category) ??
            dto.expense.category,
          currency: dto.expense.currency,
          note: dto.expense.note,
        },
      ];
    }
    return undefined;
  }

  async patchRecord(userId: string, recordId: string, dto: PatchRecordDto) {
    const entry = await this.entries.findOne({
      where: { id: recordId },
      relations: ['location', 'expenses'],
    });
    if (!entry) {
      throw new NotFoundException({ code: '40401', message: '内容已不存在' });
    }
    await this.mediaService.attachToEntries([entry]);
    const journey = await this.requireOwnedJourney(userId, entry.journeyId);

    if (dto.content !== undefined) {
      await this.assertContentSafe(dto.content ?? undefined);
    }

    const photos = (entry.media ?? []).filter(
      (m) => toLegacyKind(m.kind) === 'photo',
    );
    const voiceList = (entry.media ?? []).filter(
      (m) => toLegacyKind(m.kind) === 'voice',
    );
    const patchAudios = this.resolvePatchAudios(dto);
    const clearingAudio =
      patchAudios !== undefined && patchAudios.length === 0;

    this.assertRecordNotEmpty({
      content: dto.content !== undefined ? dto.content : entry.content,
      images: dto.images,
      audioUrl: dto.audioUrl,
      audios: patchAudios,
      hasExistingPhoto: photos.length > 0,
      hasExistingVoice: voiceList.length > 0,
      clearingImages: dto.images !== undefined && dto.images.length === 0,
      clearingAudio,
    });

    if (dto.images && dto.images.length > 9) {
      throw new BadRequestException({
        code: '40003',
        message: '图片最多 9 张，单张不超过 5MB',
      });
    }
    if (dto.audioDuration != null && dto.audioDuration > 300) {
      throw new BadRequestException({
        code: '40001',
        message: '语音时长不能超过 5 分钟',
      });
    }
    if (patchAudios) {
      for (const a of patchAudios) {
        if (a.durationSec != null && a.durationSec > 300) {
          throw new BadRequestException({
            code: '40001',
            message: '语音时长不能超过 5 分钟',
          });
        }
      }
    }

    if (dto.recordedAt !== undefined) {
      const at = new Date(dto.recordedAt);
      this.assertRecordedInRange(journey, at);
      entry.recordedAt = at;
    }
    if (dto.dayIndex !== undefined) entry.dayIndex = dto.dayIndex;
    if (dto.content !== undefined) entry.content = dto.content ?? undefined;

    if (
      dto.audioDuration != null ||
      dto.audioUrl !== undefined ||
      patchAudios !== undefined
    ) {
      const firstDur =
        patchAudios?.[0]?.durationSec ?? dto.audioDuration ?? undefined;
      entry.payload = {
        ...(entry.payload ?? {}),
        ...(firstDur != null ? { durationSec: firstDur } : {}),
        ...(patchAudios !== undefined && patchAudios.length === 0
          ? { durationSec: null }
          : {}),
      };
    }

    await this.dataSource.transaction(async (manager) => {
      if (dto.images !== undefined) {
        const existingPhotos = await manager.find(Media, {
          where: { ownerType: 'entry', ownerId: entry.id, kind: 'image' },
        });
        const legacyPhotos = await manager.find(Media, {
          where: { ownerType: 'entry', ownerId: entry.id, kind: 'photo' },
        });
        const existing = [...existingPhotos, ...legacyPhotos];
        const keepIds = new Set<string>();
        for (let i = 0; i < dto.images.length; i++) {
          const url = dto.images[i];
          const key = storageKeyFromMediaUrl(url);
          const found = existing.find(
            (m) =>
              m.url === url ||
              (!!key && (m.storageKey === key || (m.url || '').includes(key))),
          );
          if (found) {
            found.url = url;
            found.storageKey = found.storageKey || key;
            found.kind = 'image';
            found.sortOrder = i;
            found.status = 'active';
            await manager.save(found);
            keepIds.add(found.id);
            continue;
          }
          await manager.save(
            manager.create(Media, {
              ownerType: 'entry',
              ownerId: entry.id,
              kind: 'image',
              url,
              storageKey: key,
              mime: 'image/jpeg',
              sizeBytes: 0,
              sortOrder: i,
              status: 'active',
              createdBy: userId,
              driver: 'local',
            }),
          );
        }
        const toRemove = existing.filter((m) => !keepIds.has(m.id));
        if (toRemove.length) await manager.remove(toRemove);
      }

      if (patchAudios !== undefined) {
        const existingVoice = await manager.find(Media, {
          where: { ownerType: 'entry', ownerId: entry.id, kind: 'audio' },
        });
        const legacyVoice = await manager.find(Media, {
          where: { ownerType: 'entry', ownerId: entry.id, kind: 'voice' },
        });
        const existing = [...existingVoice, ...legacyVoice];
        const keepIds = new Set<string>();
        for (let i = 0; i < patchAudios.length; i++) {
          const a = patchAudios[i];
          const key = storageKeyFromMediaUrl(a.url);
          const found = existing.find(
            (m) =>
              m.url === a.url ||
              (!!key && (m.storageKey === key || (m.url || '').includes(key))),
          );
          if (found) {
            found.url = a.url;
            found.storageKey = found.storageKey || key;
            found.kind = 'audio';
            found.durationSec = a.durationSec ?? found.durationSec;
            found.sortOrder = i;
            found.status = 'active';
            await manager.save(found);
            keepIds.add(found.id);
            continue;
          }
          await manager.save(
            manager.create(Media, {
              ownerType: 'entry',
              ownerId: entry.id,
              kind: 'audio',
              url: a.url,
              storageKey: key,
              mime: 'audio/m4a',
              sizeBytes: 0,
              durationSec: a.durationSec ?? null,
              sortOrder: i,
              status: 'active',
              createdBy: userId,
              driver: 'local',
            }),
          );
        }
        const toRemove = existing.filter((m) => !keepIds.has(m.id));
        if (toRemove.length) await manager.remove(toRemove);
      }

      if (dto.locationTag !== undefined) {
        let loc = await manager.findOne(Location, {
          where: { entryId: entry.id },
        });
        if (dto.locationTag === null) {
          if (loc) await manager.remove(loc);
        } else {
          if (loc) {
            loc.name = dto.locationTag.name;
            if (dto.locationTag.lat != null) loc.lat = dto.locationTag.lat;
            if (dto.locationTag.lng != null) loc.lng = dto.locationTag.lng;
            await manager.save(loc);
          } else {
            await manager.save(
              manager.create(Location, {
                entryId: entry.id,
                name: dto.locationTag.name,
                lat: dto.locationTag.lat ?? 0,
                lng: dto.locationTag.lng ?? 0,
              }),
            );
          }
        }
      }

      const expenseLines = this.resolvePatchExpenseLines(dto);
      if (expenseLines !== undefined) {
        await this.replaceExpenses(manager, entry.id, expenseLines);
      }

      const nextExpenses =
        expenseLines !== undefined
          ? expenseLines
          : this.expensesOf(entry).map((x) => ({
              amountCent: x.amountCent,
              category: x.category,
            }));

      entry.type = inferRecordType({
        content: entry.content,
        media: [
          ...(dto.images ?? photos.map(() => ({ kind: 'photo' as const }))).map(
            () => ({ kind: 'photo' as const }),
          ),
          ...(patchAudios !== undefined
            ? patchAudios.map(() => ({ kind: 'voice' as const }))
            : voiceList.map(() => ({ kind: 'voice' as const }))),
        ],
        location:
          dto.locationTag === null
            ? undefined
            : dto.locationTag ?? entry.location,
        expenses: nextExpenses,
        expense: nextExpenses[0],
      });
      entry.syncVersion += 1;
      // 避免级联把内存中旧 expenses 再写回（entryId 被置空）
      entry.expenses = undefined;
      await manager.save(entry);
    });

    const fresh = await this.entries.findOne({
      where: { id: entry.id },
      relations: ['location', 'expenses'],
    });
    await this.mediaService.attachToEntries([fresh!]);
    return this.toEntryResponse(fresh!, journey.startDate);
  }

  async patchRecordTime(
    userId: string,
    recordId: string,
    dto: PatchRecordTimeDto,
  ) {
    return this.patchRecord(userId, recordId, {
      recordedAt: dto.recordedAt,
      dayIndex: dto.dayIndex,
    });
  }

  async removeRecord(userId: string, recordId: string) {
    const entry = await this.entries.findOne({ where: { id: recordId } });
    if (!entry) {
      throw new NotFoundException({ code: '40401', message: '内容已不存在' });
    }
    await this.requireOwnedJourney(userId, entry.journeyId);
    await this.entries.remove(entry);
    return { deleted: true, id: recordId };
  }

  async removeEntry(userId: string, journeyId: string, entryId: string) {
    await this.requireOwnedJourney(userId, journeyId);
    const entry = await this.entries.findOne({
      where: { id: entryId, journeyId },
    });
    if (!entry) throw new NotFoundException('entry not found');
    await this.entries.remove(entry);
    return { deleted: true, id: entryId };
  }

  async removeEntries(
    userId: string,
    journeyId: string,
    opts: { entryIds?: string[]; from?: string; to?: string },
  ) {
    await this.requireOwnedJourney(userId, journeyId);

    const qb = this.entries
      .createQueryBuilder('e')
      .where('e.journeyId = :journeyId', { journeyId });

    if (opts.entryIds?.length) {
      qb.andWhere('e.id IN (:...ids)', { ids: opts.entryIds });
    } else if (opts.from || opts.to) {
      if (opts.from) qb.andWhere('e.createdAt >= :from', { from: opts.from });
      if (opts.to) qb.andWhere('e.createdAt <= :to', { to: opts.to });
    } else {
      throw new BadRequestException('entryIds or from/to required');
    }

    const rows = await qb.getMany();
    if (rows.length) await this.entries.remove(rows);
    return { deleted: rows.length, ids: rows.map((r) => r.id) };
  }

  private async requireOwnedJourney(userId: string, journeyId: string) {
    const journey = await this.journeys.findOne({
      where: { id: journeyId, userId },
    });
    if (!journey) throw new NotFoundException('journey not found');
    return journey;
  }
}
