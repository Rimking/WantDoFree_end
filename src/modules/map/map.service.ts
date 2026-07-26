import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export type PoiItem = {
  id: string;
  name: string;
  address?: string;
  lat: number;
  lng: number;
  mock?: boolean;
};

/** 前端 POI 契约（latitude/longitude 为主，lat/lng 兼容） */
export type PoiListItem = {
  id: string;
  name: string;
  address?: string;
  latitude: number;
  longitude: number;
  lat: number;
  lng: number;
  mock?: boolean;
};

/**
 * R3 地图：POI 搜索 + 逆地理 + 附近。
 * 配置 MAP_PROVIDER=tencent|amap 与对应 key；未配置时返回 mock。
 */
@Injectable()
export class MapService {
  private readonly logger = new Logger(MapService.name);

  constructor(private readonly config: ConfigService) {}

  private provider(): 'tencent' | 'amap' | 'mock' {
    const p = (this.config.get('MAP_PROVIDER') || '').toLowerCase();
    if (p === 'tencent' && this.config.get('TENCENT_MAP_KEY')) return 'tencent';
    if (p === 'amap' && this.config.get('AMAP_KEY')) return 'amap';
    if (this.config.get('TENCENT_MAP_KEY')) return 'tencent';
    if (this.config.get('AMAP_KEY')) return 'amap';
    return 'mock';
  }

  private toListItem(p: PoiItem): PoiListItem {
    return {
      id: p.id,
      name: p.name,
      address: p.address,
      latitude: p.lat,
      longitude: p.lng,
      lat: p.lat,
      lng: p.lng,
      mock: p.mock,
    };
  }

  private wrapList(items: PoiItem[], total?: number) {
    const list = items.map((p) => this.toListItem(p));
    return { list, total: total ?? list.length, provider: this.provider() };
  }

  async searchPoi(
    keyword: string,
    lat?: number,
    lng?: number,
  ): Promise<{ provider: string; items: PoiItem[] }> {
    const { list, provider } = await this.searchPoiList({
      keyword,
      lat,
      lng,
      page: 1,
      pageSize: 10,
    });
    return {
      provider,
      items: list.map((p) => ({
        id: p.id,
        name: p.name,
        address: p.address,
        lat: p.latitude,
        lng: p.longitude,
        mock: p.mock,
      })),
    };
  }

  async searchPoiList(opts: {
    keyword: string;
    city?: string;
    lat?: number;
    lng?: number;
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(1, opts.page ?? 1);
    const pageSize = Math.min(50, Math.max(1, opts.pageSize ?? 20));
    const provider = this.provider();
    const keyword = opts.keyword;

    if (provider === 'mock') {
      this.logger.warn('地图 key 未配置，返回 mock POI');
      const baseLat = opts.lat ?? 30.25;
      const baseLng = opts.lng ?? 120.15;
      const items: PoiItem[] = [
        {
          id: 'mock-1',
          name: `${keyword || '示例'}·西湖断桥`,
          address: opts.city ? `${opts.city} · 西湖景区` : '浙江省杭州市西湖区',
          lat: baseLat,
          lng: baseLng,
          mock: true,
        },
        {
          id: 'mock-2',
          name: `${keyword || '示例'}·灵隐寺`,
          address: opts.city ? `${opts.city} · 灵隐` : '浙江省杭州市西湖区',
          lat: baseLat - 0.01,
          lng: baseLng - 0.02,
          mock: true,
        },
        {
          id: 'mock-3',
          name: `${keyword || '示例'}·河坊街`,
          address: opts.city ? `${opts.city} · 上城区` : '浙江省杭州市上城区',
          lat: baseLat - 0.005,
          lng: baseLng + 0.01,
          mock: true,
        },
      ];
      const start = (page - 1) * pageSize;
      return this.wrapList(items.slice(start, start + pageSize), items.length);
    }

    if (provider === 'tencent') {
      const key = this.config.get('TENCENT_MAP_KEY');
      const { data } = await axios.get(
        'https://apis.map.qq.com/ws/place/v1/search',
        {
          params: {
            keyword,
            boundary:
              opts.lat != null && opts.lng != null
                ? `nearby(${opts.lat},${opts.lng},5000)`
                : opts.city
                  ? `region(${opts.city},0)`
                  : 'region(全国,0)',
            key,
            page_size: pageSize,
            page_index: page,
          },
        },
      );
      const items: PoiItem[] = (data?.data ?? []).map((p: any, i: number) => ({
        id: String(p.id ?? i),
        name: p.title,
        address: p.address,
        lat: p.location?.lat,
        lng: p.location?.lng,
      }));
      return this.wrapList(items, Number(data?.count ?? items.length));
    }

    const key = this.config.get('AMAP_KEY');
    const { data } = await axios.get('https://restapi.amap.com/v3/place/text', {
      params: {
        keywords: keyword,
        city: opts.city,
        location:
          opts.lat != null && opts.lng != null
            ? `${opts.lng},${opts.lat}`
            : undefined,
        key,
        offset: pageSize,
        page,
      },
    });
    const items: PoiItem[] = (data?.pois ?? []).map((p: any) => {
      const [lngStr, latStr] = String(p.location || '0,0').split(',');
      return {
        id: p.id,
        name: p.name,
        address: p.address || p.pname,
        lat: Number(latStr),
        lng: Number(lngStr),
      };
    });
    return this.wrapList(items, Number(data?.count ?? items.length));
  }

  async nearby(opts: {
    lat: number;
    lng: number;
    radius?: number;
    keyword?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(1, opts.page ?? 1);
    const pageSize = Math.min(50, Math.max(1, opts.pageSize ?? 20));
    const radius = opts.radius ?? 2000;
    const provider = this.provider();
    const keyword = opts.keyword || '景点';

    if (provider === 'mock') {
      const items: PoiItem[] = [
        {
          id: 'near-1',
          name: '附近·景点 A',
          address: '周边 200m',
          lat: opts.lat + 0.001,
          lng: opts.lng + 0.001,
          mock: true,
        },
        {
          id: 'near-2',
          name: '附近·餐厅 B',
          address: '周边 500m',
          lat: opts.lat - 0.002,
          lng: opts.lng + 0.0015,
          mock: true,
        },
        {
          id: 'near-3',
          name: keyword === '景点' ? '附近·公园 C' : `附近·${keyword}`,
          address: '周边 800m',
          lat: opts.lat + 0.003,
          lng: opts.lng - 0.002,
          mock: true,
        },
      ];
      const start = (page - 1) * pageSize;
      return this.wrapList(items.slice(start, start + pageSize), items.length);
    }

    if (provider === 'tencent') {
      const key = this.config.get('TENCENT_MAP_KEY');
      const { data } = await axios.get(
        'https://apis.map.qq.com/ws/place/v1/search',
        {
          params: {
            keyword,
            boundary: `nearby(${opts.lat},${opts.lng},${radius})`,
            key,
            page_size: pageSize,
            page_index: page,
          },
        },
      );
      const items: PoiItem[] = (data?.data ?? []).map((p: any, i: number) => ({
        id: String(p.id ?? i),
        name: p.title,
        address: p.address,
        lat: p.location?.lat,
        lng: p.location?.lng,
      }));
      return this.wrapList(items, Number(data?.count ?? items.length));
    }

    const key = this.config.get('AMAP_KEY');
    const { data } = await axios.get(
      'https://restapi.amap.com/v3/place/around',
      {
        params: {
          key,
          location: `${opts.lng},${opts.lat}`,
          keywords: keyword,
          radius,
          offset: pageSize,
          page,
        },
      },
    );
    const items: PoiItem[] = (data?.pois ?? []).map((p: any) => {
      const [lngStr, latStr] = String(p.location || '0,0').split(',');
      return {
        id: p.id,
        name: p.name,
        address: p.address || p.pname,
        lat: Number(latStr),
        lng: Number(lngStr),
      };
    });
    return this.wrapList(items, Number(data?.count ?? items.length));
  }

  async reverseGeocode(
    lat: number,
    lng: number,
  ): Promise<{
    provider: string;
    name: string;
    address?: string;
    mock?: boolean;
  }> {
    const list = await this.reverseGeocodeList(lat, lng, false);
    const first = list.list[0];
    return {
      provider: list.provider,
      name: first?.name ?? '附近地点',
      address: first?.address,
      mock: first?.mock,
    };
  }

  async reverseGeocodeList(lat: number, lng: number, getPoi = false) {
    const provider = this.provider();
    if (provider === 'mock') {
      const items: PoiItem[] = [
        {
          id: 'rev-1',
          name: '附近地点',
          address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
          lat,
          lng,
          mock: true,
        },
      ];
      if (getPoi) {
        items.push({
          id: 'rev-2',
          name: '附近兴趣点',
          address: '周边 POI（mock）',
          lat: lat + 0.0005,
          lng: lng + 0.0005,
          mock: true,
        });
      }
      return this.wrapList(items);
    }

    if (provider === 'tencent') {
      const key = this.config.get('TENCENT_MAP_KEY');
      const { data } = await axios.get(
        'https://apis.map.qq.com/ws/geocoder/v1/',
        {
          params: {
            location: `${lat},${lng}`,
            key,
            get_poi: getPoi ? 1 : 0,
          },
        },
      );
      const r = data?.result;
      const items: PoiItem[] = [
        {
          id: 'rev-addr',
          name:
            r?.formatted_addresses?.recommend || r?.address || '未知地点',
          address: r?.address,
          lat,
          lng,
        },
      ];
      for (const p of r?.pois ?? []) {
        items.push({
          id: String(p.id ?? p.title),
          name: p.title,
          address: p.address,
          lat: p.location?.lat ?? lat,
          lng: p.location?.lng ?? lng,
        });
      }
      return this.wrapList(items);
    }

    const key = this.config.get('AMAP_KEY');
    const { data } = await axios.get(
      'https://restapi.amap.com/v3/geocode/regeo',
      {
        params: {
          location: `${lng},${lat}`,
          key,
          extensions: getPoi ? 'all' : 'base',
        },
      },
    );
    const r = data?.regeocode;
    const items: PoiItem[] = [
      {
        id: 'rev-addr',
        name: r?.formatted_address || '未知地点',
        address: r?.formatted_address,
        lat,
        lng,
      },
    ];
    for (const p of r?.pois ?? []) {
      const [lngStr, latStr] = String(p.location || `${lng},${lat}`).split(
        ',',
      );
      items.push({
        id: p.id || p.name,
        name: p.name,
        address: p.address,
        lat: Number(latStr),
        lng: Number(lngStr),
      });
    }
    return this.wrapList(items);
  }
}
