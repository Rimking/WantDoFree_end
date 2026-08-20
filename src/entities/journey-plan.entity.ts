import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { Journey } from './journey.entity';

export type PlanPlaceIntent = 'wish' | 'planned' | 'must';

export type PlanPlace = {
  /** @deprecated 老数据留存；新建地点由服务端生成 */
  clientId: string;
  name: string;
  note?: string;
  coverUrl?: string;
  /** 纬度（计划地图打点）；可空——允许仅填名称保存 */
  lat?: number | null;
  /** 经度 */
  lng?: number | null;
  /** @deprecated 用 name 替代 */
  locationName?: string | null;
  /** @deprecated 合并到 tags */
  category?: string | null;
  /**
   * 由 recordedAt 相对旅程 startDate 派生（第几天，1-based）。
   * 写接口不必传。
   */
  dayIndex?: number | null;
  /**
   * 关联日期 + 预计时间拼好的时间（与记录 recordedAt 同一口径）。
   * 格式：`YYYY-MM-DD HH:mm:ss`
   */
  visitTime?: string | null;
  /** @deprecated 合并到 tags */
  intent?: PlanPlaceIntent | null;
  /** @deprecated 用 mediaIds 替代 */
  images?: string[];
  /** 标签数组：合并 category + intent；如 ["sight", "must"] */
  tags?: string[];
  /** 已上传媒体 id 列表 */
  mediaIds?: string[];
  sortOrder?: number;
};

export type PlanCheck = {
  clientId: string;
  text: string;
  done: boolean;
};

/** 旅行计划（屏 JourneyPlan）：想去的地方 + 出发前清单 + 预估预算 */
@Entity('journey_plans')
export class JourneyPlan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 36, unique: true })
  journeyId: string;

  @OneToOne(() => Journey, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'journeyId' })
  journey: Journey;

  @Column({ type: 'json' })
  places: PlanPlace[];

  @Column({ type: 'json' })
  checks: PlanCheck[];

  /** 预估预算（分） */
  @Column({ type: 'int', default: 0 })
  budgetEstimate: number;

  @CreateDateColumn({ type: 'datetime', precision: 0, default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 0, default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}
