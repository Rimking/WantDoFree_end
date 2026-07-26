import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
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

  /** 兼容旧 GET */
  @Get('nearby')
  nearby(
    @Query('lat') lat: string,
    @Query('lng') lng: string,
    @Query('radius') radius?: string,
    @Query('keyword') keyword?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    if (lat == null || lng == null) {
      throw new BadRequestException('lat and lng required');
    }
    return this.map.nearby({
      lat: Number(lat),
      lng: Number(lng),
      radius: radius != null ? Number(radius) : 2000,
      keyword: keyword?.trim() || undefined,
      page: page != null ? Number(page) : 1,
      pageSize: pageSize != null ? Number(pageSize) : 20,
    });
  }

  @Get('reverse-geocode')
  reverse(
    @Query('lat') lat: string,
    @Query('lng') lng: string,
    @Query('getPoi') getPoi?: string,
  ) {
    if (lat == null || lng == null) {
      throw new BadRequestException('lat and lng required');
    }
    return this.map.reverseGeocodeList(
      Number(lat),
      Number(lng),
      getPoi === '1' || getPoi === 'true',
    );
  }

  @Get('search')
  search(
    @Query('keyword') keyword: string,
    @Query('city') city?: string,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    if (!keyword?.trim()) {
      throw new BadRequestException('keyword required');
    }
    return this.map.searchPoiList({
      keyword: keyword.trim(),
      city: city?.trim(),
      lat: lat != null ? Number(lat) : undefined,
      lng: lng != null ? Number(lng) : undefined,
      page: page != null ? Number(page) : 1,
      pageSize: pageSize != null ? Number(pageSize) : 20,
    });
  }
}
