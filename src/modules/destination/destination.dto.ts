import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DESTINATION_CATEGORIES } from '../../entities/destination.entity';

export class CreateDestinationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  name: string;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  address?: string | null;

  @IsOptional()
  @IsIn(DESTINATION_CATEGORIES)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  note?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(9)
  @IsUrl({ require_tld: false }, { each: true })
  images?: string[];

  @IsOptional()
  @IsBoolean()
  isMust?: boolean;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsInt()
  @Min(1)
  dayIndex?: number | null;
}

export class PatchDestinationDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  name?: string;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  address?: string | null;

  @IsOptional()
  @IsIn(DESTINATION_CATEGORIES)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  note?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(9)
  @IsUrl({ require_tld: false }, { each: true })
  images?: string[];

  @IsOptional()
  @IsBoolean()
  isMust?: boolean;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsInt()
  @Min(1)
  dayIndex?: number | null;
}

export class ReorderItemDto {
  @IsString()
  id: string;

  @IsInt()
  @Min(0)
  sortOrder: number;
}

export class ReorderDestinationsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReorderItemDto)
  items: ReorderItemDto[];
}

export class DestinationJourneyIdBodyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  journeyId: string;
}

export class DestinationCreateBodyDto extends CreateDestinationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  journeyId: string;
}

export class DestinationReorderBodyDto extends ReorderDestinationsDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  journeyId: string;
}

export class DestinationUpdateBodyDto extends PatchDestinationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  id: string;
}

export class DestinationIdBodyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  id: string;
}

/**
 * 地图连点：跨旅程聚合计划选点。
 * userId 来自 JWT，勿传。
 * 时间过滤：旅程与 [startDate, endDate] 有交集（startDate<=journey.end 且 endDate>=journey.start）。
 */
export class DestinationMapListBodyDto {
  /** YYYY-MM-DD；与 endDate 成对出现，可都不传表示全部旅程 */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startDate?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  endDate?: string;

  /** 可选：只查某一个计划/旅程 */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  journeyId?: string;

  /** 兼容别名：planId === journeyId */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  planId?: string;

  /** 默认 true：仅返回有经纬度的点（便于折线）；false 返回全部选点 */
  @IsOptional()
  @IsBoolean()
  onlyWithCoords?: boolean;
}
