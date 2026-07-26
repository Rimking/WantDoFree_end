import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import {
  UpdateJourneyDto,
  UpdateStatusDto,
  UpsertPlanDto,
} from './journey.dto';
import { SyncEntryDto } from '../recording/recording.dto';

export const JOURNEY_DETAIL_INCLUDES = [
  'entries',
  'plan',
  'expense',
  'guide',
] as const;

export type JourneyDetailInclude = (typeof JOURNEY_DETAIL_INCLUDES)[number];

const toBool = ({ value }: { value: unknown }) => {
  if (value === false || value === 'false' || value === 0 || value === '0') {
    return false;
  }
  if (value === undefined || value === null || value === '') return true;
  return Boolean(value);
};

export class JourneyListBodyDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  displayStatus?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;

  /** true=模块化列表项（默认）；false=旧平铺兼容 */
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  modular?: boolean = true;
}

export class JourneyIdBodyDto {
  @IsString()
  @Length(1, 64)
  id: string;
}

export class JourneyDetailBodyDto {
  @IsString()
  @Length(1, 64)
  journeyId: string;

  @IsOptional()
  @IsArray()
  @IsIn([...JOURNEY_DETAIL_INCLUDES], { each: true })
  include?: JourneyDetailInclude[];
}

export class JourneyUpdateBodyDto extends UpdateJourneyDto {
  @IsString()
  @Length(1, 64)
  id: string;
}

export class JourneyStatusBodyDto extends UpdateStatusDto {
  @IsString()
  @Length(1, 64)
  id: string;
}

export class JourneyPlanGetBodyDto {
  @IsString()
  @Length(1, 64)
  journeyId: string;
}

export class JourneyPlanSaveBodyDto extends UpsertPlanDto {
  @IsString()
  @Length(1, 64)
  journeyId: string;
}

export class JourneyPlanToggleCheckBodyDto {
  @IsString()
  @Length(1, 64)
  journeyId: string;

  /** check clientId */
  @IsString()
  checkId: string;
}

export class EntriesListBodyDto {
  @IsString()
  @Length(1, 64)
  journeyId: string;

  @IsOptional()
  @IsInt()
  dayIndex?: number;

  /** 默认 true：模块化 Entry */
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  modular?: boolean = true;
}

export class EntriesSyncBodyDto {
  @IsString()
  @Length(1, 64)
  journeyId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyncEntryDto)
  entries: SyncEntryDto[];
}

export class EntriesDeleteBodyDto {
  @IsString()
  @Length(1, 64)
  journeyId: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Length(1, 64, { each: true })
  entryIds?: string[];

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;
}

export class ExpenseSummaryBodyDto {
  @IsString()
  @Length(1, 64)
  journeyId: string;
}

export class MeExpenseSummaryBodyDto {
  @IsOptional()
  @IsInt()
  year?: number;
}

export class GuideGetBodyDto {
  @IsString()
  @Length(1, 64)
  journeyId: string;
}

export class GuideCreateBodyDto {
  @IsString()
  @Length(1, 64)
  journeyId: string;

  @IsOptional()
  @IsString()
  template?: string;
}

export class GuideFavoriteBodyDto {
  @IsString()
  @Length(1, 64)
  journeyId: string;

  @IsOptional()
  isFavorited?: boolean;
}
