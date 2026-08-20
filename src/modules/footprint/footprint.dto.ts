import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * 足迹详情类目枚举（与「我的足迹」四格 / Tab 一一对应）
 * 一次请求只查一种类型，切换 Tab 时改传 type 即可。
 *
 * 1 旅程 · 2 城市 · 3 照片 · 4 记录
 */
export enum FootprintType {
  /** 旅程 */
  Journey = 1,
  /** 城市（打卡地名去重） */
  City = 2,
  /** 照片 */
  Photo = 3,
  /** 记录 */
  Record = 4,
}

export const FOOTPRINT_TYPE_LABEL: Record<FootprintType, string> = {
  [FootprintType.Journey]: 'journey',
  [FootprintType.City]: 'city',
  [FootprintType.Photo]: 'photo',
  [FootprintType.Record]: 'record',
};

export class FootprintStatsBodyDto {
  // 预留；当前无筛选。用户身份取 JWT，勿传 userId
}

export class FootprintDetailBodyDto {
  /**
   * 类目枚举（必填）：1旅程 2城市 3照片 4记录
   * 只返回该 type 的 list，不会一次返回全部类目
   */
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    const n = Number(value);
    return Number.isFinite(n) ? n : value;
  })
  @IsEnum(FootprintType)
  type: FootprintType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;
}
