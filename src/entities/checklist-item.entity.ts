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

/** 出发前准备事项（按旅程；软删除） */
@Entity('checklist_items')
@Index('idx_checklist_journey_deleted', ['journeyId', 'deletedAt'])
export class ChecklistItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 36 })
  journeyId: string;

  @ManyToOne(() => Journey, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'journeyId' })
  journey: Journey;

  @Column({ length: 60 })
  title: string;

  /** 新建时是否默认勾选（模板语义；实际勾选看 isChecked） */
  @Column({ type: 'boolean', default: false })
  isDefaultChecked: boolean;

  /** 出发前 N 天提醒；null = 不提醒 */
  @Column({ type: 'int', nullable: true })
  remindBeforeDays?: number | null;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @Column({ type: 'boolean', default: false })
  isChecked: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'datetime', nullable: true })
  deletedAt?: Date | null;
}
