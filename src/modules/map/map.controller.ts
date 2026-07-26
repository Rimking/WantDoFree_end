import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { MapService } from './map.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('map')
@UseGuards(JwtAuthGuard)
export class MapController {
  constructor(private readonly map: MapService) {}

  /** 屏22：地点搜索 */
  @Get('poi')
  poi(
    @Query('keyword') keyword: string,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
  ) {
    if (!keyword?.trim()) {
      throw new BadRequestException('keyword required');
    }
    return this.map.searchPoi(
      keyword.trim(),
      lat != null ? Number(lat) : undefined,
      lng != null ? Number(lng) : undefined,
    );
  }

  /** 逆地理：经纬度 → 地点名 */
  @Get('reverse-geocode')
  reverse(@Query('lat') lat: string, @Query('lng') lng: string) {
    if (lat == null || lng == null) {
      throw new BadRequestException('lat and lng required');
    }
    return this.map.reverseGeocode(Number(lat), Number(lng));
  }
}
