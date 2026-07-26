import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Journey } from './journey.entity';

/** 目的地分类（与前端 chips 对齐） */
export type DestinationCategory =
  | 'SIGHT'
  | 'FOOD'
  | 'STAY'
  | 'SHOPPING'
  | 'OTHER';

export const DESTINATION_CATEGORIES: DestinationCategory[] = [
  'SIGHT',
  'FOOD',
  'STAY',
  'SHOPPING',
  'OTHER',
];

/** 旅程目的地（独立表；软删除） */
@Entity('destinations')
@Index('idx_destinations_journey_deleted', ['journeyId', 'deletedAt'])
export class Destination {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 36 })
  journeyId: string;

  @ManyToOne(() => Journey, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'journeyId' })
  journey: Journey;

  @Column({ length: 60 })
  name: string;

  @Column({ type: 'decimal', precision: 10, scale: 8, nullable: true })
  latitude?: string | null;

  @Column({ type: 'decimal', precision: 11, scale: 8, nullable: true })
  longitude?: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  address?: string | null;

  @Column({ type: 'varchar', length: 16, default: 'OTHER' })
  category: DestinationCategory | string;

  @Column({ type: 'varchar', length: 240, nullable: true })
  note?: string | null;

  /** COS URL 数组，最多 9 张 */
  @Column({ type: 'json' })
  images: string[];

  @Column({ type: 'boolean', default: false })
  isMust: boolean;

  /** null = 未安排到具体天 */
  @Column({ type: 'int', nullable: true })
  dayIndex?: number | null;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'datetime', nullable: true })
  deletedAt?: Date | null;
}
