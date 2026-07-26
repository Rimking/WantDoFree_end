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

export type PlanPlace = {
  clientId: string;
  name: string;
  note?: string;
  coverUrl?: string;
  /** 纬度（计划地图打点） */
  lat?: number | null;
  /** 经度 */
  lng?: number | null;
  /** 地址/位置文案 */
  locationName?: string | null;
  /** 分类：SIGHT/FOOD/STAY/SHOPPING/OTHER 或小写 */
  category?: string | null;
  dayIndex?: number | null;
  images?: string[];
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

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
