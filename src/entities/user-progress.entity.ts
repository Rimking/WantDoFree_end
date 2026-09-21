import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('user_progress')
export class UserProgress {
  @PrimaryColumn({ length: 36 })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'userId',
    foreignKeyConstraintName: 'FK_user_progress_user',
  })
  user: User;

  @Column({ type: 'int', unsigned: true, default: 0 })
  xp: number;

  @Column({ type: 'int', unsigned: true, default: 0 })
  highestXp: number;

  @Column({ type: 'tinyint', unsigned: true, default: 1 })
  level: number;

  /** NULL 仅存在于首次事务初始化过程中。 */
  @Column({ type: 'datetime', precision: 0, nullable: true })
  levelReachedAt: Date | null;

  @Column({ type: 'tinyint', unsigned: true, default: 1 })
  lastAcknowledgedLevel: number;

  @UpdateDateColumn({
    type: 'datetime',
    precision: 0,
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updatedAt: Date;
}
