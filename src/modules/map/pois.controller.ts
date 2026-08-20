import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UseGuards,
} from '@nestjs/common';
import { MapService } from './map.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  IsNumber,
  IsOptional,
  IsString,
  IsBoolean,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

class PoisNearbyBodyDto {
  @Type(() => Number)
  @IsNumber()
  lat: number;

  @Type(() => Number)
  @IsNumber()
  lng: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  radius?: number;

  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

class PoisSearchBodyDto {
  @IsString()
  keyword: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lng?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

class PoisReverseBodyDto {
  @Type(() => Number)
  @IsNumber()
  lat: number;

  @Type(() => Number)
  @IsNumber()
  lng: number;

  @IsOptional()
  @IsBoolean()
  getPoi?: boolean;
}

/**
 * POI 搜索 API（新契约：POST + body）。
 * 旧 GET nearby/search/reverse-geocode 兼容端点已于 2026-08-20 下线。
 */
@Controller('pois')
@UseGuards(JwtAuthGuard)
export class PoisController {
  constructor(private readonly map: MapService) {}

  @Post('nearby')
  nearbyPost(@Body() body: PoisNearbyBodyDto) {
    return this.map.nearby({
      lat: body.lat,
      lng: body.lng,
      radius: body.radius ?? 2000,
      keyword: body.keyword?.trim() || undefined,
      page: body.page ?? 1,
      pageSize: body.pageSize ?? 20,
    });
  }

  @Post('search')
  searchPost(@Body() body: PoisSearchBodyDto) {
    if (!body.keyword?.trim()) {
      throw new BadRequestException('keyword required');
    }
    return this.map.searchPoiList({
      keyword: body.keyword.trim(),
      city: body.city?.trim(),
      lat: body.lat,
      lng: body.lng,
      page: body.page ?? 1,
      pageSize: body.pageSize ?? 20,
    });
  }

  @Post('reverseGeocode')
  reversePost(@Body() body: PoisReverseBodyDto) {
    return this.map.reverseGeocodeList(
      body.lat,
      body.lng,
      Boolean(body.getPoi),
    );
  }
}
