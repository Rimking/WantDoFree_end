import { formatDateTime } from '../../common/datetime.util';

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, IsNull, Like, Repository } from 'typeorm';
import { createHash, randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { Media } from '../../entities/media.entity';
import { Entry } from '../../entities/entry.entity';
import { Journey } from '../../entities/journey.entity';
import { Guide } from '../../entities/guide.entity';
import { User } from '../../entities/user.entity';
import { StorageDriverFactory } from '../../infrastructure/storage/storage-driver.factory';
import { LocalStorageDriver } from '../../infrastructure/storage/local-storage.driver';
import { QuotaService } from '../quota/quota.service';
import {
  PrepareMediaDto,
} from './media.dto';
import {
  assertMimeAllowed,
  assertSizeAllowed,
  datePartitionKey,
  extFromMime,
  normalizeMediaKind,
  sizeNumber,
  toLegacyKind,
  toQuotaKind,
} from './media.util';

type ConfirmTokenPayload = {
  purpose: 'media_confirm';
  mediaId: string;
  userId: string;
};

type ConfirmTokenDto = {
  mediaId: string;
  confirmToken: string;
  durationSec?: number;
  width?: number;
  height?: number;
};

type LegacyConfirmDto = {
  entryId: string;
  kind: 'photo' | 'voice' | 'image' | 'audio';
  url: string;
  size?: number;
};

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    @InjectRepository(Media) private readonly media: Repository<Media>,
    @InjectRepository(Entry) private readonly entries: Repository<Entry>,
    @InjectRepository(Journey) private readonly journeys: Repository<Journey>,
    @InjectRepository(Guide) private readonly guides: Repository<Guide>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly drivers: StorageDriverFactory,
    private readonly localDriver: LocalStorageDriver,
    private readonly quota: QuotaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
  ) {}

  toDto(m: Media) {
    const kind = normalizeMediaKind(m.kind) ?? 'image';
    return {
      id: m.id,
      ownerType: m.ownerType,
      ownerId: m.ownerId,
      kind,
      /** 兼容旧前端 */
      legacyKind: toLegacyKind(kind),
      url: m.url,
      thumbUrl: m.thumbUrl ?? null,
      mime: m.mime,
      ext: m.ext ?? null,
      sizeBytes: sizeNumber(m.sizeBytes),
      /** 兼容旧字段 */
      size: sizeNumber(m.sizeBytes),
      width: m.width ?? null,
      height: m.height ?? null,
      durationSec: m.durationSec ?? null,
      sortOrder: m.sortOrder,
      status: m.status,
      storageTier: m.storageTier,
      driver: m.driver,
      checksum: m.checksum ?? null,
      createdAt: formatDateTime(m.createdAt),
    };
  }

  /** 批量挂载 entry 媒体（避免 N+1） */
  async attachToEntries(entries: Entry[]) {
    if (!entries.length) return entries;
    const ids = entries.map((e) => e.id);
    const rows = await this.media.find({
      where: {
        ownerType: 'entry',
        ownerId: In(ids),
        status: 'active',
        deletedAt: IsNull(),
      },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
    const map = new Map<string | null, Media[]>();
    for (const m of rows) {
      const list = map.get(m.ownerId) ?? [];
      list.push(m);
      map.set(m.ownerId, list);
    }
    for (const e of entries) {
      e.media = map.get(e.id) ?? [];
    }
    return entries;
  }

  async listByOwner(ownerType: string, ownerId: string) {
    const rows = await this.media.find({
      where: {
        ownerType,
        ownerId,
        status: 'active',
        deletedAt: IsNull(),
      },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
    return rows.map((m) => this.toDto(m));
  }

  private async assertOwnerAccess(
    userId: string,
    ownerType: string,
    ownerId: string,
  ) {
    if (ownerType === 'avatar') {
      if (ownerId !== userId) {
        throw new ForbiddenException('avatar ownerId must be current user');
      }
      return;
    }
    if (ownerType === 'entry') {
      const entry = await this.entries.findOne({ where: { id: ownerId } });
      if (!entry) throw new NotFoundException('entry not found');
      const journey = await this.journeys.findOne({
        where: { id: entry.journeyId, userId },
      });
      if (!journey) throw new ForbiddenException('entry not owned');
      return;
    }
    if (ownerType === 'journey_cover') {
      const journey = await this.journeys.findOne({
        where: { id: ownerId, userId },
      });
      if (!journey) throw new ForbiddenException('journey not owned');
      return;
    }
    if (ownerType === 'destination') {
      throw new BadRequestException(`unsupported ownerType: ${ownerType}`);
    }
    if (ownerType === 'guide') {
      const guide = await this.guides.findOne({ where: { id: ownerId } });
      if (!guide) throw new NotFoundException('guide not found');
      const journey = await this.journeys.findOne({
        where: { id: guide.journeyId, userId },
      });
      if (!journey) throw new ForbiddenException('guide not owned');
      return;
    }
    throw new BadRequestException(`unsupported ownerType: ${ownerType}`);
  }

  private signConfirmToken(mediaId: string, userId: string) {
    const payload: ConfirmTokenPayload = {
      purpose: 'media_confirm',
      mediaId,
      userId,
    };
    return this.jwt.sign(payload, {
      secret: this.config.get('JWT_SECRET'),
      expiresIn: '10m',
    });
  }

  private verifyConfirmToken(
    token: string,
    mediaId: string,
    userId: string,
  ): ConfirmTokenPayload {
    try {
      const payload = this.jwt.verify<ConfirmTokenPayload>(token, {
        secret: this.config.get('JWT_SECRET'),
      });
      if (payload.purpose !== 'media_confirm') {
        throw new BadRequestException('invalid confirm token');
      }
      if (payload.mediaId !== mediaId || payload.userId !== userId) {
        throw new BadRequestException('token mismatch');
      }
      return payload;
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      throw new BadRequestException('confirmToken 无效或已过期');
    }
  }

  async prepare(userId: string, dto: PrepareMediaDto) {
    const kind = normalizeMediaKind(dto.kind);
    if (!kind) {
      throw new BadRequestException('kind must be image|audio (or photo|voice)');
    }
    const mimeErr = assertMimeAllowed(kind, dto.mime);
    if (mimeErr) throw new BadRequestException(mimeErr);
    const sizeErr = assertSizeAllowed(kind, dto.sizeBytes);
    if (sizeErr) throw new BadRequestException(sizeErr);

    if (dto.ownerId) {
          await this.assertOwnerAccess(userId, dto.ownerType, dto.ownerId);
        }

    const quotaKind = toQuotaKind(kind);
    const usage =
      kind === 'image'
        ? 1
        : Math.max(1, dto.durationSec ?? Math.ceil(dto.sizeBytes / 1024));
    await this.quota.assertWithin(userId, quotaKind, usage);

    const mediaId = randomUUID();
    const ext = extFromMime(dto.mime, kind);
    const storageKey = datePartitionKey(mediaId, ext);
    const token = this.signConfirmToken(mediaId, userId);
    const driver = this.drivers.get();
    const target = await driver.getUploadTarget(
      {
        ownerType: dto.ownerType,
        ownerId: dto.ownerId ?? null,
        kind,
        mime: dto.mime,
        sizeBytes: dto.sizeBytes,
        ext,
      },
      mediaId,
      token,
      storageKey,
    );

    await this.media.save(
      this.media.create({
        id: mediaId,
        ownerType: dto.ownerType,
        ownerId: dto.ownerId ?? null,
        kind,
        mime: dto.mime,
        ext,
        sizeBytes: dto.sizeBytes,
        durationSec: dto.durationSec ?? null,
        sortOrder: dto.sortOrder ?? 0,
        status: 'pending',
        storageTier: 'hot',
        driver: driver.name,
        storageKey,
        url: driver.resolveUrl(storageKey),
        createdBy: userId,
      }),
    );

    return {
      mediaId: target.mediaId,
      uploadUrl: target.uploadUrl,
      method: target.method,
      headers: target.headers,
      fields: target.fields,
      confirmToken: target.confirmToken,
      storageKey: target.storageKey,
      driver: driver.name,
    };
  }

  async localUpload(
    userId: string,
    mediaId: string,
    confirmToken: string,
    file?: Express.Multer.File,
  ) {
    if (this.drivers.currentName() !== 'local') {
      throw new BadRequestException('local-upload 仅在 STORAGE_DRIVER=local 时可用');
    }
    if (!file?.buffer?.length) {
      throw new BadRequestException('file required');
    }
    this.verifyConfirmToken(confirmToken, mediaId, userId);

    const m = await this.media.findOne({ where: { id: mediaId } });
    if (!m || m.createdBy !== userId) {
      throw new NotFoundException('media not found');
    }
    if (m.status !== 'pending') {
      throw new BadRequestException('media 状态不可上传');
    }

    const kind = normalizeMediaKind(m.kind) ?? 'image';
    const mime = file.mimetype || m.mime;
    const mimeErr = assertMimeAllowed(kind, mime);
    if (mimeErr) throw new BadRequestException(mimeErr);
    const sizeErr = assertSizeAllowed(kind, file.size);
    if (sizeErr) throw new BadRequestException(sizeErr);

    const key =
      m.storageKey ||
      datePartitionKey(mediaId, extFromMime(mime, kind));
    const checksum = createHash('sha256').update(file.buffer).digest('hex');

    const dup = await this.media.findOne({
      where: {
        checksum,
        status: 'active',
        deletedAt: IsNull(),
        createdBy: userId,
      },
    });
    if (dup && dup.id !== mediaId) {
      // 同用户相同文件：复用已有 URL，不重复落盘
      m.url = dup.url;
      m.storageKey = dup.storageKey;
      m.checksum = checksum;
      m.sizeBytes = sizeNumber(dup.sizeBytes);
      m.mime = dup.mime;
      m.ext = dup.ext;
      await this.media.save(m);
      // 头像：文件就绪即写回用户表，避免只上传未 confirm 时账号仍是旧图
      await this.applyOwnerSideEffects(userId, m);
      return { mediaId: m.id, reused: true, url: m.url };
    }

    await this.localDriver.writeFile(key, file.buffer);
    m.storageKey = key;
    m.url = this.localDriver.resolveUrl(key);
    m.sizeBytes = file.size;
    m.mime = mime;
    m.ext = extFromMime(mime, kind);
    m.checksum = checksum;
    await this.media.save(m);
    await this.applyOwnerSideEffects(userId, m);

    return { mediaId: m.id, reused: false, url: m.url, sizeBytes: file.size };
  }

  /** 头像 / 封面写回主表（local-upload 与 confirm 均可调用，幂等）；传 manager 时随事务提交 */
  private async applyOwnerSideEffects(
    userId: string,
    m: { ownerType: string; ownerId: string | null; url?: string | null },
    manager?: EntityManager,
  ) {
    if (!m.url) return;
    const runner = manager ?? this.users.manager;
    if (m.ownerType === 'avatar') {
      if (!m.ownerId) return;
      await runner.update(User, { id: userId }, { avatar: m.url });
    }
    if (m.ownerType === 'journey_cover') {
      if (!m.ownerId) return;
      await runner.update(Journey, { id: m.ownerId, userId }, { coverUrl: m.url });
    }
  }

  async confirm(userId: string, dto: ConfirmTokenDto) {
    this.verifyConfirmToken(dto.confirmToken, dto.mediaId, userId);
    const m = await this.media.findOne({ where: { id: dto.mediaId } });
    if (!m || m.createdBy !== userId) {
      throw new NotFoundException('media not found');
    }
    if (m.status === 'active') {
      // 幂等：仍同步一次主表，防止历史上传成功但用户字段未写上
      await this.applyOwnerSideEffects(userId, m);
      return this.toDto(m);
    }
    if (m.status !== 'pending') {
      throw new BadRequestException('media 不可确认');
    }
    if (!m.url || !m.storageKey) {
      throw new BadRequestException('请先完成上传再 confirm');
    }
    if (m.driver === 'local') {
      try {
        await fs.access(this.localDriver.absolutePath(m.storageKey));
      } catch {
        throw new BadRequestException('本地文件不存在，请先 local-upload');
      }
    }

    const kind = normalizeMediaKind(m.kind) ?? 'image';
    if (dto.durationSec != null) m.durationSec = dto.durationSec;
    if (dto.width != null) m.width = dto.width;
    if (dto.height != null) m.height = dto.height;

    const usage =
      kind === 'image'
        ? 1
        : Math.max(
            1,
            m.durationSec ?? Math.ceil(sizeNumber(m.sizeBytes) / 1024),
          );

    // 配额扣减与状态置 active 同事务：回滚时配额不会被白扣
    await this.dataSource.transaction(async (manager) => {
      await this.quota.consumeOrFail(userId, toQuotaKind(kind), usage, manager);
      m.status = 'active';
      await manager.save(m);
      await this.applyOwnerSideEffects(userId, m, manager);
    });

    return this.toDto(m);
  }

  /** 旧 POST /media/confirm（直接落库 active） */
  async confirmLegacy(userId: string, dto: LegacyConfirmDto) {
    const kind = normalizeMediaKind(dto.kind);
    if (!kind) throw new BadRequestException('invalid kind');
    await this.assertOwnerAccess(userId, 'entry', dto.entryId);

    const usage =
      kind === 'image'
        ? 1
        : Math.max(1, Math.ceil((dto.size ?? 0) / 1024));

    const row = await this.dataSource.transaction(async (manager) => {
      await this.quota.consumeOrFail(userId, toQuotaKind(kind), usage, manager);
      return manager.save(
        manager.create(Media, {
          ownerType: 'entry',
          ownerId: dto.entryId,
          kind,
          url: dto.url,
          mime: kind === 'image' ? 'image/jpeg' : 'audio/m4a',
          sizeBytes: dto.size ?? 0,
          status: 'active',
          driver: this.drivers.currentName(),
          createdBy: userId,
        }),
      );
    });
    return this.toDto(row);
  }

  /**
   * 删除无引用的物理文件（软删媒体后调用）。
   * 同一 storageKey 可能被多条媒体共享（checksum 去重复用 URL），
   * 仍有活跃引用时跳过；删除失败仅告警，不影响主流程。
   */
  async deleteStorageFilesIfUnreferenced(keys: Array<string | null | undefined>) {
    const uniq = [...new Set(keys.filter((k): k is string => !!k))];
    for (const key of uniq) {
      const refs = await this.media.count({
        where: { storageKey: key, deletedAt: IsNull() },
      });
      if (refs > 0) continue;
      try {
        await this.drivers.get().delete(key);
      } catch (e: unknown) {
        this.logger.warn(
          `物理文件删除失败（忽略）: ${key}: ${e instanceof Error ? e.message : e}`,
        );
      }
    }
  }

  async findOwnedFile(userId: string, storageKey: string) {
    const byKey = await this.media.findOne({
      where: {
        storageKey,
        createdBy: userId,
        deletedAt: IsNull(),
      },
    });
    if (byKey) return byKey;
    // 兼容 /records/update 按 URL 重建时未写 storageKey 的脏行
    const needle = storageKey.replace(/\\/g, '/');
    return this.media.findOne({
      where: {
        createdBy: userId,
        deletedAt: IsNull(),
        url: Like(`%/${needle}`),
      },
    });
  }
}
