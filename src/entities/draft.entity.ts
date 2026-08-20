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
import { User } from './user.entity';

export type DraftKind = 'entry' | 'journey';

/** 草稿箱：未提交记录 / 未保存新建旅程。 */
@Entity('drafts')
export class Draft {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ length: 36 })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  /** 关联旅程（记录草稿可挂在某旅程下；旅程草稿可空） */
  @Column({ nullable: true, length: 36 })
  journeyId?: string;

  @Column({ type: 'varchar', length: 16 })
  kind: DraftKind;

  @Column({ type: 'json' })
  payload: Record<string, unknown>;

  @CreateDateColumn({ type: 'datetime', precision: 0, default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 0, default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}
