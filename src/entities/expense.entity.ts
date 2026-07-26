import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { Entry } from './entry.entity';

/** 花费，金额单位：分。 */
@Entity('expenses')
export class Expense {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 36, unique: true })
  entryId: string;

  @OneToOne(() => Entry, (e) => e.expense, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'entryId' })
  entry: Entry;

  @Column({ type: 'int', comment: '金额(分)' })
  amountCent: number;

  @Column({ type: 'varchar', length: 8, default: 'CNY' })
  currency: string;

  @Column({ type: 'varchar', length: 16, default: 'other' })
  category: string;

  /** 花费备注 */
  @Column({ type: 'varchar', length: 255, nullable: true })
  note?: string;

  @CreateDateColumn()
  createdAt: Date;
}
