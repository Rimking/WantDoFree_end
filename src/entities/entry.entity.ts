import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  OneToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Journey } from './journey.entity';
import { Location } from './location.entity';
import { Expense } from './expense.entity';
import { Media } from './media.entity';

export type EntryType = 'text' | 'photo' | 'voice' | 'location' | 'expense';

/** 时间线条目（聚合体）。clientId 为离线幂等键；一条可同时含文字/多图/语音/定位/花费。 */
@Entity('entries')
@Index('idx_entries_journey_created', ['journeyId', 'createdAt'])
@Index('idx_entries_journey_day_recorded', ['journeyId', 'dayIndex', 'recordedAt'])
export class Entry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 36 })
  journeyId: string;

  @ManyToOne(() => Journey, (j) => j.entries, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'journeyId' })
  journey: Journey;

  @Column({ type: 'varchar', length: 16 })
  type: EntryType | string;

  @Column({ type: 'text', nullable: true })
  content?: string;

  @Column({ unique: true, length: 64, comment: '离线幂等键(clientId)' })
  clientId: string;

  @Column({ type: 'int', default: 1 })
  syncVersion: number;

  @Column({ type: 'varchar', length: 16, default: 'synced' })
  status: string;

  @Column({ type: 'json', nullable: true, comment: '灵活字段' })
  payload?: Record<string, any>;

  /** 记录发生时间（可编辑）；空则回退 createdAt */
  @Column({ type: 'datetime', nullable: true })
  recordedAt?: Date | null;

  /** 第几天（可编辑）；空则按旅程 startDate + recordedAt 派生 */
  @Column({ type: 'int', nullable: true })
  dayIndex?: number | null;

  /** 记录级城市归属软标签，与定位坐标解耦（纯文本记录也可手动填） */
  @Column({ type: 'varchar', length: 64, nullable: true })
  city?: string | null;

  @CreateDateColumn({ type: 'datetime', precision: 0, default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 0, default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt: Date;

  /**
   * 非 TypeORM 关系字段：媒体为多态 ownerType/ownerId，由 Service 批量挂载。
   */
  media?: Media[];

  @OneToOne(() => Location, (l) => l.entry, { cascade: true })
  location?: Location | null;

  /** 一条记录可挂多笔花费 */
  @OneToMany(() => Expense, (e) => e.entry)
  expenses?: Expense[];
}
