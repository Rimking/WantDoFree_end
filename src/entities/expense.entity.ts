import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Entry } from './entry.entity';

/** 花费明细行，金额单位：分。一条 entry 可有多笔。 */
@Entity('expenses')
@Index('idx_expenses_entry', ['entryId'])
export class Expense {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 36 })
  entryId: string;

  @ManyToOne(() => Entry, (e) => e.expenses, {
    onDelete: 'CASCADE',
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: 'entryId', referencedColumnName: 'id' })
  entry?: Entry;

  @Column({ type: 'int', comment: '金额(分)' })
  amountCent: number;

  @Column({ type: 'varchar', length: 8, default: 'CNY' })
  currency: string;

  @Column({ type: 'varchar', length: 16, default: 'other' })
  category: string;

  /** 花费备注 */
  @Column({ type: 'varchar', length: 255, nullable: true })
  note?: string;

  /** 同 entry 内排序（升序） */
  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @CreateDateColumn()
  createdAt: Date;
}
