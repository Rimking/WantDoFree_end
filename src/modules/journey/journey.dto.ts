import {
  IsString,
  IsOptional,
  IsIn,
  IsDateString,
  Length,
  IsArray,
  IsBoolean,
  IsInt,
  Min,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { JOURNEY_STATUSES, normalizeStatus } from '../../common/enums/catalog';

@ValidatorConstraint({ name: 'statusNorm', async: false })
class StatusConstraint implements ValidatorConstraintInterface {
  validate(value: unknown) {
    return typeof value === 'string' && normalizeStatus(value) != null;
  }
  defaultMessage() {
    return `status must be one of ${JOURNEY_STATUSES.join(',')} (aliases: planning/ended)`;
  }
}

export class CreateJourneyDto {
  @IsOptional() @IsString() @Length(1, 64) clientId?: string;

  @IsString() @Length(1, 128) title: string;

  /** 出发地（选填；可空提交） */
  @IsOptional() @IsString() @Length(0, 128) origin?: string;

  @IsOptional() @IsString() @Length(0, 256) destination?: string;

  @IsDateString() startDate: string;
  @IsDateString() endDate: string;

  @IsOptional() @IsString() coverUrl?: string;
  /** 兼容旧字段 cover */
  @IsOptional() @IsString() cover?: string;

  @IsOptional() @IsInt() @Min(0) budgetAmount?: number;
  /** 兼容前端 budgetLimit */
  @IsOptional() @IsInt() @Min(0) budgetLimit?: number;

  @IsOptional() @IsBoolean() isPublic?: boolean;

  /** 创建时内嵌预定点（写入 plan.places，intent 默认 wish） */
  @IsOptional()
  @IsArray()
  places?: Array<{
    clientId?: string;
    id?: string;
    name: string;
    coverUrl?: string;
    cover?: string;
    lat?: number;
    lng?: number;
    latitude?: number;
    longitude?: number;
    locationName?: string;
    category?: string;
    /** @deprecated 由 recordedAt 派生，不必传 */
    dayIndex?: number | null;
    /**
     * 关联日期+预计时间拼好的字符串，格式 `2026-09-18 00:00:00`
     * 与新建记录 entries[].recordedAt 同一字段、同一格式
     */
    recordedAt?: string | null;
    /** @deprecated 请改传 recordedAt */
    visitTime?: string | null;
    intent?: string;
    images?: string[];
  }>;
}

export class UpdateJourneyDto {
  @IsOptional() @IsString() @Length(1, 128) title?: string;
  @IsOptional() @IsString() @Length(1, 128) origin?: string;
  @IsOptional() @IsString() @Length(0, 256) destination?: string;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsString() coverUrl?: string;
  @IsOptional() @IsString() cover?: string;

  @IsOptional() @IsInt() @Min(0) budgetAmount?: number;
  @IsOptional() @IsInt() @Min(0) budgetLimit?: number;
  @IsOptional() @IsBoolean() isPublic?: boolean;
}

export class UpdateStatusDto {
  @IsOptional() @Validate(StatusConstraint) target?: string;
  @IsOptional() @Validate(StatusConstraint) status?: string;
}

export class UpsertPlanDto {
  @IsOptional()
  @IsArray()
  places?: Array<{
    clientId?: string;
    id?: string;
    name: string;
    coverUrl?: string;
    cover?: string;
    lat?: number;
    lng?: number;
    latitude?: number;
    longitude?: number;
    locationName?: string;
    address?: string;
    category?: string;
    /** @deprecated 由 recordedAt 派生，不必传 */
    dayIndex?: number | null;
    /** 关联日期+预计时间，格式 `2026-09-18 00:00:00`，与记录 recordedAt 相同 */
    recordedAt?: string | null;
    /** @deprecated 请改传 recordedAt */
    visitTime?: string | null;
    /** wish | planned | must */
    intent?: string;
    images?: string[];
    sortOrder?: number;
  }>;

  @IsOptional()
  @IsArray()
  checks?: Array<{
    clientId?: string;
    id?: string;
    text: string;
    done: boolean;
  }>;

  @IsOptional() @IsInt() @Min(0) budgetEstimate?: number;
}

export class PatchPlanDto {
  @IsOptional()
  @IsArray()
  places?: Array<{
    clientId?: string;
    id?: string;
    name: string;
    coverUrl?: string;
    cover?: string;
    lat?: number;
    lng?: number;
    latitude?: number;
    longitude?: number;
    locationName?: string;
    address?: string;
    category?: string;
    /** @deprecated 由 recordedAt 派生，不必传 */
    dayIndex?: number | null;
    /** 关联日期+预计时间，格式 `2026-09-18 00:00:00` */
    recordedAt?: string | null;
    /** @deprecated 请改传 recordedAt */
    visitTime?: string | null;
    intent?: string;
    images?: string[];
    sortOrder?: number;
  }>;

  @IsOptional()
  @IsArray()
  checks?: Array<{
    clientId?: string;
    id?: string;
    text: string;
    done: boolean;
  }>;

  @IsOptional() @IsInt() @Min(0) budgetEstimate?: number;

  /** 快捷：只 toggle 某 check */
  @IsOptional() @IsString() toggleCheckClientId?: string;
  /** 兼容 toggleCheckId */
  @IsOptional() @IsString() toggleCheckId?: string;
}
