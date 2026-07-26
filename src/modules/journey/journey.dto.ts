import {
  IsString,
  IsOptional,
  IsIn,
  IsDateString,
  Length,
  IsArray,
  ArrayUnique,
  IsBoolean,
  IsInt,
  Min,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import {
  COMPANIONS,
  JOURNEY_STATUSES,
  THEME_TAGS,
  normalizeCompanion,
  normalizeStatus,
  normalizeThemeTag,
} from '../../common/enums/catalog';

@ValidatorConstraint({ name: 'themeTagsNorm', async: false })
class ThemeTagsConstraint implements ValidatorConstraintInterface {
  validate(value: unknown) {
    if (value == null) return true;
    if (!Array.isArray(value)) return false;
    return value.every((v) => typeof v === 'string' && normalizeThemeTag(v));
  }
  defaultMessage() {
    return `themeTags must be subset of ${THEME_TAGS.join(',')} (or Chinese aliases)`;
  }
}

@ValidatorConstraint({ name: 'companionsNorm', async: false })
class CompanionsConstraint implements ValidatorConstraintInterface {
  validate(value: unknown) {
    if (value == null) return true;
    if (!Array.isArray(value)) return false;
    if (!value.every((v) => typeof v === 'string' && normalizeCompanion(v))) {
      return false;
    }
    const keys = value.map((v) => normalizeCompanion(v)!);
    // 「自己」与其它互斥
    if (keys.includes('solo') && keys.length > 1) return false;
    return true;
  }
  defaultMessage(args: ValidationArguments) {
    const v = args.value;
    if (Array.isArray(v) && v.map((x) => normalizeCompanion(x)).includes('solo') && v.length > 1) {
      return 'companions: solo cannot combine with others';
    }
    return `companions must be subset of ${COMPANIONS.join(',')} (or Chinese aliases)`;
  }
}

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

  @IsString() @Length(1, 128) origin: string;

  @IsOptional() @IsString() @Length(1, 128) destination?: string;

  @IsDateString() startDate: string;
  @IsDateString() endDate: string;

  @IsOptional() @IsString() coverUrl?: string;
  /** 兼容旧字段 cover */
  @IsOptional() @IsString() cover?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @Validate(ThemeTagsConstraint)
  themeTags?: string[];

  /** 兼容前端 themes */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @Validate(ThemeTagsConstraint)
  themes?: string[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @Validate(CompanionsConstraint)
  companions?: string[];

  @IsOptional() @IsInt() @Min(0) budgetAmount?: number;
  /** 兼容前端 budgetLimit */
  @IsOptional() @IsInt() @Min(0) budgetLimit?: number;

  @IsOptional() @IsBoolean() isPublic?: boolean;
}

export class UpdateJourneyDto {
  @IsOptional() @IsString() @Length(1, 128) title?: string;
  @IsOptional() @IsString() @Length(1, 128) origin?: string;
  @IsOptional() @IsString() @Length(0, 128) destination?: string;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsString() coverUrl?: string;
  @IsOptional() @IsString() cover?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @Validate(ThemeTagsConstraint)
  themeTags?: string[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @Validate(ThemeTagsConstraint)
  themes?: string[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @Validate(CompanionsConstraint)
  companions?: string[];

  @IsOptional() @IsInt() @Min(0) budgetAmount?: number;
  @IsOptional() @IsInt() @Min(0) budgetLimit?: number;
  @IsOptional() @IsBoolean() isPublic?: boolean;
}

export class UpdateStatusDto {
  @IsOptional() @Validate(StatusConstraint) target?: string;
  @IsOptional() @Validate(StatusConstraint) status?: string;
}

export class ListJourneyQueryDto {
  /** 持久化三态：planned|ongoing|finished */
  @IsOptional()
  @Validate(StatusConstraint)
  status?: string;

  /** 展示态筛选：planning|departing|ongoing|finished|draft */
  @IsOptional()
  @IsIn(['planning', 'departing', 'ongoing', 'finished', 'draft'])
  displayStatus?: string;
}

export class UpsertPlanDto {
  @IsOptional()
  @IsArray()
  places?: Array<{
    clientId?: string;
    id?: string;
    name: string;
    note?: string;
    coverUrl?: string;
    cover?: string;
    lat?: number;
    lng?: number;
    latitude?: number;
    longitude?: number;
    locationName?: string;
    address?: string;
    category?: string;
    dayIndex?: number;
    images?: string[];
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
    note?: string;
    coverUrl?: string;
    cover?: string;
    lat?: number;
    lng?: number;
    latitude?: number;
    longitude?: number;
    locationName?: string;
    address?: string;
    category?: string;
    dayIndex?: number;
    images?: string[];
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
