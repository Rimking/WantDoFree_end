import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
  Index,
  Unique,
} from 'typeorm';

/** 用户统计日快照（物化计数，避免全表扫） */
@Entity('user_stats_snapshots')
@Unique('UQ_stats_user_date', ['userId', 'date'])
@Index('idx_stats_user_date', ['userId', 'date'])
export class UserStatsSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 36 })
  userId: string;

  /** 快照日 YYYY-MM-DD */
  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'int', default: 0 })
  totalRecords: number;

  @Column({ type: 'int', default: 0 })
  totalDays: number;

  @Column({ type: 'int', default: 0 })
  totalPlaces: number;

  @Column({ type: 'int', default: 0 })
  streakDays: number;

  /** 累计花费（分） */
  @Column({ type: 'bigint', default: 0 })
  totalExpense: string;

  @UpdateDateColumn()
  updatedAt: Date;
}
