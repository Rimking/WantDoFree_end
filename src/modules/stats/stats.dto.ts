import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  ValidateIf,
} from 'class-validator';

export const RANGE_TYPES = ['all', 'year', 'month', 'custom'] as const;
export type RangeType = (typeof RANGE_TYPES)[number];

export class StatsRangeQueryDto {
  @IsOptional()
  @IsIn(RANGE_TYPES)
  rangeType?: RangeType = 'all';

  /** custom / year / month 可用；custom 必填 */
  @ValidateIf((o) => o.rangeType === 'custom' || o.rangeType === 'year')
  @IsOptional()
  @Matches(/^\d{4}(-\d{2}(-\d{2})?)?$/)
  start?: string;

  @ValidateIf((o) => o.rangeType === 'custom')
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  end?: string;

  @IsOptional()
  @IsString()
  journeyId?: string;

  /** 仅 /stats/journeys：ongoing|planning|completed|draft */
  @IsOptional()
  @IsIn(['ongoing', 'planning', 'completed', 'draft'])
  status?: string;
}

export type StatsRange = {
  type: RangeType;
  start: string | null;
  end: string | null;
};
