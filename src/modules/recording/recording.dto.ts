import {
  IsString,
  IsEnum,
  IsOptional,
  IsArray,
  IsNumber,
  IsInt,
  IsDateString,
  Min,
  Max,
  MaxLength,
  ArrayMaxSize,
  ValidateNested,
  IsUrl,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import { normalizeExpenseCategory } from '../../common/enums/catalog';

@ValidatorConstraint({ name: 'expenseCategory', async: false })
class ExpenseCategoryConstraint implements ValidatorConstraintInterface {
  validate(value: unknown) {
    return typeof value === 'string' && normalizeExpenseCategory(value) != null;
  }
  defaultMessage() {
    return 'category must be food|stay|transport|ticket|shopping|other (or Chinese aliases)';
  }
}

export class SyncLocationDto {
  @IsNumber() @Min(-90) @Max(90) lat: number;
  @IsNumber() @Min(-180) @Max(180) lng: number;
  @IsOptional() @IsString() @MaxLength(255) name?: string;
}

export class SyncExpenseDto {
  /** 分；兼容 amount */
  @IsOptional() @IsInt() @Min(1) amountCent?: number;
  @IsOptional() @IsInt() @Min(1) amount?: number;

  @IsString() @MaxLength(32) @Validate(ExpenseCategoryConstraint) category: string;
  @IsOptional() @IsString() @MaxLength(8) currency?: string;
  @IsOptional() @IsString() @MaxLength(255) note?: string;
}

export class SyncMediaItemDto {
  @IsUrl({ require_tld: false }) url: string;
  /** image|audio 规范；兼容 photo|voice */
  @IsEnum(['photo', 'voice', 'image', 'audio'])
  kind: 'photo' | 'voice' | 'image' | 'audio';
  @IsOptional() @IsInt() @Min(0) size?: number;
  @IsOptional() @IsInt() @Min(0) @Max(300) durationSec?: number;
  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}

export class SyncVoiceClipDto {
  @IsUrl({ require_tld: false }) url: string;
  @IsOptional() @IsInt() @Min(0) @Max(300) durationSec?: number;
  @IsOptional() @IsInt() @Min(0) size?: number;
}

export class SyncEntryDto {
  @IsString() @MaxLength(64) clientId: string;

  @IsOptional()
  @IsEnum(['text', 'photo', 'voice', 'location', 'expense'])
  type?: string;

  @IsOptional() @IsString() content?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => SyncLocationDto)
  location?: SyncLocationDto;

  /** 单笔兼容；有 expenses 时以数组为准 */
  @IsOptional()
  @ValidateNested()
  @Type(() => SyncExpenseDto)
  expense?: SyncExpenseDto;

  /** 多笔花费（推荐） */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => SyncExpenseDto)
  expenses?: SyncExpenseDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyncMediaItemDto)
  media?: SyncMediaItemDto[];

  @IsOptional()
  payload?: Record<string, unknown>;

  @IsOptional() @IsUrl({ require_tld: false }) url?: string;
  @IsOptional()
  @IsEnum(['photo', 'voice', 'image', 'audio'])
  kind?: 'photo' | 'voice' | 'image' | 'audio';
  @IsOptional() @IsInt() @Min(0) size?: number;

  /** 首段语音兼容 */
  @IsOptional()
  voice?: { url?: string; durationSec?: number; size?: number };

  /** 多段语音（会并入 media audio） */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => SyncVoiceClipDto)
  voices?: SyncVoiceClipDto[];
}

export class SyncBatchDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyncEntryDto)
  entries: SyncEntryDto[];
}

export class DeleteEntriesDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  entryIds?: string[];

  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
}

/** 记录编辑：地点标签 */
export class RecordLocationTagDto {
  @IsString() @MaxLength(60) name: string;
  @IsOptional() @IsNumber() @Min(-90) @Max(90) lat?: number;
  @IsOptional() @IsNumber() @Min(-180) @Max(180) lng?: number;
}

/** 记录编辑：消费金额一律按「分」；优先 amountCent，amount 兼容为分 */
export class RecordExpenseDto {
  @IsString() @MaxLength(32) @Validate(ExpenseCategoryConstraint) category: string;
  @IsOptional() @IsInt() @Min(1) @Max(99999900) amount?: number;
  @IsOptional() @IsInt() @Min(1) @Max(99999900) amountCent?: number;
  @IsOptional() @IsString() @MaxLength(255) note?: string;
  @IsOptional() @IsString() @MaxLength(8) currency?: string;
}

export class RecordAudioDto {
  @IsUrl({ require_tld: false }) url: string;
  @IsOptional() @IsInt() @Min(0) @Max(300) durationSec?: number;
}

export class PatchRecordDto {
  @IsOptional() @IsDateString() recordedAt?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(1)
  dayIndex?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  content?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(9)
  @IsUrl({ require_tld: false }, { each: true })
  images?: string[];

  /** 单段兼容；有 audios/voices 时以数组为准 */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUrl({ require_tld: false })
  audioUrl?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  @Max(300)
  audioDuration?: number | null;

  /**
   * 多段语音覆盖写：传入则替换该 entry 全部 audio（空数组/null 清空）。
   * 与 images 互不干扰。
   */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => RecordAudioDto)
  audios?: RecordAudioDto[] | null;

  /** audios 别名 */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => RecordAudioDto)
  voices?: RecordAudioDto[] | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @ValidateNested()
  @Type(() => RecordLocationTagDto)
  locationTag?: RecordLocationTagDto | null;

  /** 单笔兼容；有 expenses 时以数组为准；null 清空全部 */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @ValidateNested()
  @Type(() => RecordExpenseDto)
  expense?: RecordExpenseDto | null;

  /** 多笔花费覆盖写：空数组/null 清空 */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => RecordExpenseDto)
  expenses?: RecordExpenseDto[] | null;
}

export class PatchRecordTimeDto {
  @IsDateString() recordedAt: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(1)
  dayIndex?: number | null;
}

export class RecordUpdateBodyDto extends PatchRecordDto {
  @IsString()
  @MaxLength(64)
  recordId: string;
}

export class RecordIdBodyDto {
  @IsString()
  @MaxLength(64)
  recordId: string;
}

export class RecordTimeBodyDto extends PatchRecordTimeDto {
  @IsString()
  @MaxLength(64)
  recordId: string;
}
