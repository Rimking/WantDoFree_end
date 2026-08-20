import { formatDateTime } from '../../common/datetime.util';

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Journey } from '../../entities/journey.entity';
import { Entry } from '../../entities/entry.entity';
import { Location } from '../../entities/location.entity';
import { Media } from '../../entities/media.entity';
import {
  JourneyStatus,
  normalizeStatus,
} from '../../common/enums/catalog';
import {
  FootprintDetailBodyDto,
  FootprintType,
  FOOTPRINT_TYPE_LABEL,
} from './footprint.dto';

@Injectable()
export class FootprintService {
  constructor(
    @InjectRepository(Journey) private readonly journeys: Repository<Journey>,
    @InjectRepository(Entry) private readonly entries: Repository<Entry>,
    @InjectRepository(Location) private readonly locations: Repository<Location>,
    @InjectRepository(Media) private readonly media: Repository<Media>,
  ) {}

  /** 我的足迹四格数量（JWT 用户） */
  async stats(userId: string) {
    const journeyIds = await this.userJourneyIds(userId);
    const journeyCount = journeyIds.length;

    if (!journeyCount) {
      return {
        journeyCount: 0,
        cityCount: 0,
        photoCount: 0,
        recordCount: 0,
      };
    }

    const [cityCount, recordCount, photoCount] = await Promise.all([
      this.countCities(userId, journeyIds),
      this.entries
        .createQueryBuilder('e')
        .where('e.journeyId IN (:...journeyIds)', { journeyIds })
        .getCount(),
      this.countPhotos(journeyIds),
    ]);

    return { journeyCount, cityCount, photoCount, recordCount };
  }

  /**
   * 查看全部：按 FootprintType 只返回**一种**类目列表
   * Tab 切换时改传 type（1|2|3|4）即可，不会一次返回四类
   */
  async detail(userId: string, body: FootprintDetailBodyDto) {
    const page = body.page ?? 1;
    const pageSize = body.pageSize ?? 20;
    const type = body.type as FootprintType;

    switch (type) {
      case FootprintType.Journey:
        return this.detailJourneys(userId, page, pageSize);
      case FootprintType.City:
        return this.detailCities(userId, page, pageSize);
      case FootprintType.Photo:
        return this.detailPhotos(userId, page, pageSize);
      case FootprintType.Record:
        return this.detailRecords(userId, page, pageSize);
      default:
        return {
          type,
          typeKey: null,
          list: [],
          total: 0,
          page,
          pageSize,
        };
    }
  }

  private pageMeta(type: FootprintType, total: number, page: number, pageSize: number) {
    return {
      type,
      typeKey: FOOTPRINT_TYPE_LABEL[type],
      total,
      page,
      pageSize,
    };
  }

  private async userJourneyIds(userId: string): Promise<string[]> {
    const rows = await this.journeys.find({
      where: { userId },
      select: ['id'],
    });
    return rows.map((r) => r.id);
  }

  private async countCities(userId: string, journeyIds: string[]) {
    if (!journeyIds.length) return 0;
    const raw = await this.locations
      .createQueryBuilder('loc')
      .innerJoin('loc.entry', 'entry')
      .innerJoin('entry.journey', 'journey')
      .select('COUNT(DISTINCT loc.name)', 'cnt')
      .where('journey.userId = :userId', { userId })
      .andWhere('entry.journeyId IN (:...journeyIds)', { journeyIds })
      .andWhere('loc.name IS NOT NULL')
      .andWhere("loc.name != ''")
      .getRawOne();
    return Number(raw?.cnt ?? 0);
  }

  private async countPhotos(journeyIds: string[]) {
    if (!journeyIds.length) return 0;
    return this.media
      .createQueryBuilder('m')
      .innerJoin(Entry, 'e', "e.id = m.ownerId AND m.ownerType = 'entry'")
      .where('e.journeyId IN (:...journeyIds)', { journeyIds })
      .andWhere('m.kind IN (:...kinds)', { kinds: ['image', 'photo'] })
      .andWhere('m.status = :st', { st: 'active' })
      .andWhere('m.deletedAt IS NULL')
      .getCount();
  }

  private async detailJourneys(userId: string, page: number, pageSize: number) {
    const total = await this.journeys.count({ where: { userId } });
    const rows = await this.journeys.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    const list = rows.map((j) => {
      const status = (normalizeStatus(j.status) ?? j.status) as JourneyStatus;
      return {
        id: j.id,
        title: j.title,
        coverUrl: j.coverUrl ?? null,
        origin: j.origin ?? null,
        destination: j.destination ?? null,
        startDate: j.startDate,
        endDate: j.endDate,
        status,
        displayStatus: this.resolveDisplayStatus(
          status,
          j.startDate,
          j.endDate,
        ),
        createdAt: formatDateTime(j.createdAt),
      };
    });
    return {
      ...this.pageMeta(FootprintType.Journey, total, page, pageSize),
      list,
    };
  }

  private async detailCities(userId: string, page: number, pageSize: number) {
    const journeyIds = await this.userJourneyIds(userId);
    if (!journeyIds.length) {
      return {
        ...this.pageMeta(FootprintType.City, 0, page, pageSize),
        list: [],
      };
    }

    const grouped = await this.locations
      .createQueryBuilder('loc')
      .innerJoin('loc.entry', 'entry')
      .innerJoin('entry.journey', 'journey')
      .select('loc.name', 'name')
      .addSelect('COUNT(*)', 'visitCount')
      .addSelect('MAX(COALESCE(entry.recordedAt, entry.createdAt))', 'lastVisitedAt')
      .addSelect('MAX(loc.lat)', 'lat')
      .addSelect('MAX(loc.lng)', 'lng')
      .where('journey.userId = :userId', { userId })
      .andWhere('entry.journeyId IN (:...journeyIds)', { journeyIds })
      .andWhere('loc.name IS NOT NULL')
      .andWhere("loc.name != ''")
      .groupBy('loc.name')
      .orderBy('lastVisitedAt', 'DESC')
      .getRawMany();

    const total = grouped.length;
    const slice = grouped.slice((page - 1) * pageSize, page * pageSize);
    const list = slice.map((r) => ({
      name: String(r.name).trim(),
      visitCount: Number(r.visitCount ?? 0),
      lastVisitedAt: r.lastVisitedAt ?? null,
      lat: r.lat != null ? Number(r.lat) : null,
      lng: r.lng != null ? Number(r.lng) : null,
    }));
    return {
      ...this.pageMeta(FootprintType.City, total, page, pageSize),
      list,
    };
  }

  private async detailPhotos(userId: string, page: number, pageSize: number) {
    const journeyIds = await this.userJourneyIds(userId);
    if (!journeyIds.length) {
      return {
        ...this.pageMeta(FootprintType.Photo, 0, page, pageSize),
        list: [],
      };
    }

    const base = () =>
      this.media
        .createQueryBuilder('m')
        .innerJoin(Entry, 'e', "e.id = m.ownerId AND m.ownerType = 'entry'")
        .innerJoin(Journey, 'j', 'j.id = e.journeyId')
        .where('j.userId = :userId', { userId })
        .andWhere('e.journeyId IN (:...journeyIds)', { journeyIds })
        .andWhere('m.kind IN (:...kinds)', { kinds: ['image', 'photo'] })
        .andWhere('m.status = :st', { st: 'active' })
        .andWhere('m.deletedAt IS NULL');

    const total = await base().getCount();
    const rows = await base()
      .select([
        'm.id AS id',
        'm.url AS url',
        'm.thumbUrl AS thumbUrl',
        'e.id AS entryId',
        'j.id AS journeyId',
        'j.title AS journeyTitle',
        'COALESCE(e.recordedAt, e.createdAt) AS recordedAt',
        'm.createdAt AS createdAt',
      ])
      .orderBy('COALESCE(e.recordedAt, e.createdAt)', 'DESC')
      .offset((page - 1) * pageSize)
      .limit(pageSize)
      .getRawMany();

    const list = rows.map((r) => ({
      id: r.id,
      url: r.url,
      thumbUrl: r.thumbUrl ?? null,
      entryId: r.entryId,
      journeyId: r.journeyId,
      journeyTitle: r.journeyTitle,
      recordedAt: formatDateTime(r.recordedAt),
      createdAt: formatDateTime(r.createdAt),
    }));
    return {
      ...this.pageMeta(FootprintType.Photo, total, page, pageSize),
      list,
    };
  }

  private async detailRecords(userId: string, page: number, pageSize: number) {
    const journeyIds = await this.userJourneyIds(userId);
    if (!journeyIds.length) {
      return {
        ...this.pageMeta(FootprintType.Record, 0, page, pageSize),
        list: [],
      };
    }

    const total = await this.entries
      .createQueryBuilder('e')
      .where('e.journeyId IN (:...journeyIds)', { journeyIds })
      .getCount();

    const rows = await this.entries
      .createQueryBuilder('e')
      .innerJoin('e.journey', 'j')
      .select([
        'e.id AS id',
        'e.type AS type',
        'e.content AS content',
        'e.journeyId AS journeyId',
        'j.title AS journeyTitle',
        'e.dayIndex AS dayIndex',
        'COALESCE(e.recordedAt, e.createdAt) AS recordedAt',
        'e.createdAt AS createdAt',
      ])
      .where('e.journeyId IN (:...journeyIds)', { journeyIds })
      .orderBy('COALESCE(e.recordedAt, e.createdAt)', 'DESC')
      .offset((page - 1) * pageSize)
      .limit(pageSize)
      .getRawMany();

    const list = rows.map((r) => {
      const content = r.content ? String(r.content) : '';
      return {
        id: r.id,
        type: r.type,
        contentPreview: content.slice(0, 80),
        journeyId: r.journeyId,
        journeyTitle: r.journeyTitle,
        dayIndex: r.dayIndex != null ? Number(r.dayIndex) : null,
        recordedAt: formatDateTime(r.recordedAt),
        createdAt: formatDateTime(r.createdAt),
      };
    });
    return {
      ...this.pageMeta(FootprintType.Record, total, page, pageSize),
      list,
    };
  }

  private todayYmd() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private addDaysYmd(ymd: string, days: number) {
    const dt = new Date(ymd + 'T00:00:00');
    dt.setDate(dt.getDate() + days);
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const day = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private resolveDisplayStatus(
    status: JourneyStatus,
    startDate: string,
    endDate: string,
  ): 'planning' | 'departing' | 'ongoing' | 'finished' {
    if (status === 'finished') return 'finished';
    if (status === 'ongoing') return 'ongoing';
    const today = this.todayYmd();
    const limit = this.addDaysYmd(today, 3);
    if (startDate >= today && startDate <= limit && today <= endDate) {
      return 'departing';
    }
    return 'planning';
  }
}
