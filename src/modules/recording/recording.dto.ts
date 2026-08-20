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
  Length,
  ArrayMaxSize,
  ValidateNested,
  IsUrl,
  Matches,
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

  /** 记录发生时间，必填。格式：`2026-09-18 00:00:00` */
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/, {
    message: 'recordedAt 格式应为 YYYY-MM-DD HH:mm:ss',
  })
  recordedAt: string;

  /** 第几天（1-based）；不传则按旅程 startDate + recordedAt 派生 */
  @IsOptional()
  @IsInt()
  @Min(1)
  dayIndex?: number;

  /** 记录级城市归属软标签（可选；纯文本记录也可填） */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  city?: string | null;

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

/**
 * 新建记录（entries/create）：单条对象一次提交，包含该记录全部信息。
 * 无 clientId（不做离线幂等，由前端防重）、无 city、无 type（后端按内容推导）。
 */
export class CreateEntryBodyDto {
  @IsString()
  @Length(1, 64)
  journeyId: string;

  /** 记录发生时间，必填。格式：`2026-09-18 00:00:00` */
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/, {
    message: 'recordedAt 格式应为 YYYY-MM-DD HH:mm:ss',
  })
  recordedAt: string;

  @IsOptional()
  @IsString()
  content?: string;

  /** 第几天（1-based）；不传则按旅程 startDate + recordedAt 派生 */
  @IsOptional()
  @IsInt()
  @Min(1)
  dayIndex?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => SyncLocationDto)
  location?: SyncLocationDto;

  /** 多笔花费 */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => SyncExpenseDto)
  expenses?: SyncExpenseDto[];

  /** 媒体：传已上传的 mediaId（/media/confirm 返回的 id），后端直接关联 */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  mediaIds?: string[];

  /** 标签数组（如 ["sight","food"]）；最多 10 个 */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  tags?: string[];
}

/** 记录编辑：地点标签 */
export class RecordLocationDto {
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

  /** 媒体 id 列表（覆盖式：传空数组清空、不传不动）；图片/语音通用 */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  mediaIds?: string[];

  /** 标签数组（覆盖式：空数组/null 清空、不传不动） */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  tags?: string[] | null;

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
  @Type(() => RecordLocationDto)
  location?: RecordLocationDto | null;

  /** 所属城市软标签（可选；null 清空） */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(64)
  city?: string | null;

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
