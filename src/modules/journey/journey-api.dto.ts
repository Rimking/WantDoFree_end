import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Min,
  Max,
  ArrayMaxSize,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import {
  UpdateJourneyDto,
  UpdateStatusDto,
  UpsertPlanDto,
} from './journey.dto';

export const JOURNEY_DETAIL_INCLUDES = [
  'entries',
  'plan',
  'expense',
  'guide',
  'handbook',
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
  /** @deprecated 优先用 type；持久化三态 planned|ongoing|finished */
  @IsOptional()
  @IsString()
  status?: string;

  /** @deprecated 优先用 type；展示态 planning|departing|ongoing|finished */
  @IsOptional()
  @IsString()
  displayStatus?: string;

  /**
   * 首页卡片类型（展示态）：
   * 不传=全部；1=进行中；2=即将出发；3=规划中；4=已完成
   */
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    const n = Number(value);
    return Number.isFinite(n) ? n : value;
  })
  @IsIn([1, 2, 3, 4])
  type?: 1 | 2 | 3 | 4;

  /** 关键词：仅匹配计划名称（journey.title） */
  @IsOptional()
  @IsString()
  @Length(0, 64)
  keyword?: string;

  /** 行程时间区间起（字符串，建议 YYYY-MM-DD；与旅程起止日有交集则命中） */
  @IsOptional()
  @IsString()
  @Length(1, 32)
  startTime?: string;

  /** 行程时间区间止（字符串，建议 YYYY-MM-DD） */
  @IsOptional()
  @IsString()
  @Length(1, 32)
  endTime?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;

  /**
   * 排序字段（首页「最近攻略」用 updatedAt）
   * 默认 createdAt，保持历史列表兼容
   */
  @IsOptional()
  @IsIn(['createdAt', 'updatedAt'])
  sortBy?: 'createdAt' | 'updatedAt';

  /**
   * @deprecated 列表已固定返回扁平卡片对象，传此字段无效（可省略）
   */
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  modular?: boolean;
}

export class JourneyIdBodyDto {
  @IsString()
  @Length(1, 64)
  id: string;
}

export class JourneyDetailBodyDto {
  /** 与 id 二选一 */
  @IsOptional()
  @IsString()
  @Length(1, 64)
  journeyId?: string;

  /** 兼容前端传 id */
  @IsOptional()
  @IsString()
  @Length(1, 64)
  id?: string;

  @IsOptional()
  @IsArray()
  @IsIn([...JOURNEY_DETAIL_INCLUDES], { each: true })
  include?: JourneyDetailInclude[];
}

/** 旅程详情页（item/detail）请求体，与 detail 互斥 */
export class JourneyItemDetailBodyDto {
  @IsOptional()
  @IsString()
  @Length(1, 64)
  journeyId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  id?: string;
}

/** 游记预览页（handbook/detail）请求体，与 detail / itemDetail 互斥 */
export class JourneyHandbookDetailBodyDto {
  @IsOptional()
  @IsString()
  @Length(1, 64)
  journeyId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  id?: string;
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

/** 新建预定点（单点追加，不整包覆盖） */
export class PlanPlaceCreateBodyDto {
  @IsString()
  @Length(1, 64)
  journeyId: string;

  @IsString()
  @Length(1, 128)
  name: string;

  @IsOptional()
  @IsString()
  note?: string;

  /** 关联日期+预计时间，格式 `2026-09-18 00:00:00`，与记录 recordedAt 相同 */
  @IsOptional()
  @IsString()
  recordedAt?: string | null;

  @IsOptional()
  @IsNumber()
  lat?: number | null;

  @IsOptional()
  @IsNumber()
  lng?: number | null;

  @IsOptional()
  @IsString()
  coverUrl?: string;

  /** 已上传媒体 id（/media/confirm 返回的 id），后端直接关联 */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  mediaIds?: string[];

  /** 标签：合并 category + intent，如 ["sight", "must"] */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  tags?: string[];
}

/** @deprecated 用 PlanPlaceCreateBodyDto */
export class JourneyPlanPlaceUpsertBodyDto {
  @IsString()
  @Length(1, 64)
  journeyId: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => PlanPlaceCreateBodyDto)
  places?: PlanPlaceCreateBodyDto[];
}

export class JourneyPlanPlaceDeleteBodyDto {
  @IsString()
  @Length(1, 64)
  journeyId: string;

  @IsString()
  @Length(1, 64)
  clientId: string;
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

/** 首页最近记录（跨旅程，最多 10） */
export class EntriesRecentBodyDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  limit?: number = 10;
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

  /** 兼容旧字段；与 templateId 二选一，优先 templateId */
  @IsOptional()
  @IsString()
  template?: string;

  /** 游记模版：basic | T1–T6 */
  @IsOptional()
  @IsString()
  templateId?: string;

  /** true=强制重生成（覆盖已有 Guide） */
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

export class HandbookListBodyDto {
  @IsOptional()
  @IsString()
  phase?: string;
}
