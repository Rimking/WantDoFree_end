import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Journey } from '../../entities/journey.entity';
import { RecordingService } from '../recording/recording.service';
import { normalizeMediaKind } from '../media/media.util';
import { formatDateTime } from '../../common/datetime.util';

/** 同地点聚类半径（米）：与地点组坐标距离小于该值的记录归入同组 */
const PLACE_MERGE_RADIUS_M = 200;

interface LocatedEntry {
  clientId: string;
  content: string;
  /** 记录时间（毫秒；recordedAt 空回退 createdAt） */
  at: number;
  lat: number;
  lng: number;
  name: string;
  images: string[];
}

interface PlaceGroup {
  anchorId: string;
  name: string;
  lat: number;
  lng: number;
  latestAt: number;
  coverUrl: string | null;
  records: LocatedEntry[];
}

/** 两坐标间球面距离（米） */
function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * 有定位的笔记按「同一地点」聚类：时间升序贪心，与已有组坐标距离 < 200m 归并。
 * 组名/展示坐标取组内最新记录，封面取最新一条带图笔记的首图；
 * anchorId 恒为组内最早一条记录的 clientId（notes 查询按同一算法重算，结果确定一致）。
 */
function clusterLocated(rows: LocatedEntry[]): PlaceGroup[] {
  const groups: PlaceGroup[] = [];
  for (const r of rows) {
    let g = groups.find(
      (x) => haversineM(r.lat, r.lng, x.lat, x.lng) < PLACE_MERGE_RADIUS_M,
    );
    if (!g) {
      g = {
        anchorId: r.clientId,
        name: r.name || '未命名地点',
        lat: r.lat,
        lng: r.lng,
        latestAt: r.at,
        coverUrl: r.images[0] ?? null,
        records: [],
      };
      groups.push(g);
    }
    g.records.push(r);
    g.lat = r.lat;
    g.lng = r.lng;
    g.latestAt = r.at;
    if (r.name) g.name = r.name;
    if (r.images[0]) g.coverUrl = r.images[0];
  }
  return groups;
}

/**
 * 地图聚合服务：
 * - summary 初始只返回地点级摘要（名称/坐标/封面/笔记数），笔记量增长也不受影响；
 * - placeNotes 在点击某个地点后才按锚点重算聚类，返回组内笔记明细。
 */
@Injectable()
export class JourneyMapService {
  constructor(
    @InjectRepository(Journey)
    private readonly journeys: Repository<Journey>,
    private readonly recording: RecordingService,
  ) {}

  /** 圈定聚类范围：单旅程（校验归属）或用户全部旅程 */
  private async resolveJourneyIds(
    userId: string,
    journeyId?: string,
  ): Promise<string[]> {
    if (journeyId) {
      const j = await this.journeys.findOne({
        where: { id: journeyId, userId },
        select: ['id'],
      });
      if (!j) throw new NotFoundException('journey not found');
      return [j.id];
    }
    const rows = await this.journeys.find({
      where: { userId },
      select: ['id'],
    });
    return rows.map((r) => r.id);
  }

  private async loadLocatedEntries(
    userId: string,
    journeyId?: string,
  ): Promise<LocatedEntry[]> {
    const ids = await this.resolveJourneyIds(userId, journeyId);
    const entries = await this.recording.listLocatedEntriesByJourneyIds(
      userId,
      ids,
    );
    return entries
      .map((e): LocatedEntry | null => {
        const lat = Number(e.location?.lat);
        const lng = Number(e.location?.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        const raw = e.recordedAt ?? e.createdAt;
        if (!raw) return null;
        const at = new Date(raw).getTime();
        if (!Number.isFinite(at)) return null;
        const images = (e.media ?? [])
          .filter((m) => (normalizeMediaKind(String(m.kind)) ?? 'image') === 'image')
          .map((m) => m.url);
        return {
          clientId: e.clientId,
          content: (e.content ?? '').trim(),
          at,
          lat,
          lng,
          name: String(e.location?.name ?? '').trim(),
          images,
        };
      })
      .filter((x): x is LocatedEntry => !!x)
      .sort((a, b) => a.at - b.at);
  }

  /** 地图地点摘要（进入地图页调用） */
  async summary(userId: string, journeyId?: string) {
    const entries = await this.loadLocatedEntries(userId, journeyId);
    const groups = clusterLocated(entries).sort(
      (a, b) => b.latestAt - a.latestAt,
    );
    return {
      places: groups.map((g) => ({
        anchorId: g.anchorId,
        name: g.name,
        lat: g.lat,
        lng: g.lng,
        noteCount: g.records.length,
        coverUrl: g.coverUrl,
        latestAt: formatDateTime(new Date(g.latestAt)),
      })),
      totalPlaces: groups.length,
      totalNotes: entries.length,
    };
  }

  /** 某地点的笔记明细（点击地点后调用） */
  async placeNotes(userId: string, anchorId: string, journeyId?: string) {
    const entries = await this.loadLocatedEntries(userId, journeyId);
    const groups = clusterLocated(entries);
    const g =
      groups.find((x) => x.anchorId === anchorId) ??
      groups.find((x) => x.records.some((r) => r.clientId === anchorId));
    if (!g) throw new NotFoundException('place not found');
    const notes = [...g.records]
      .sort((a, b) => b.at - a.at)
      .map((r) => ({
        id: r.clientId,
        content: r.content,
        images: r.images,
        recordedAt: formatDateTime(new Date(r.at)),
      }));
    return {
      place: { name: g.name, lat: g.lat, lng: g.lng, noteCount: notes.length },
      notes,
    };
  }
}
