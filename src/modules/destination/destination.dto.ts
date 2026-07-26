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
