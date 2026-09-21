import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { User } from './user.entity';

@Entity('user_badges')
@Unique('UQ_user_badges_user_key', ['userId', 'badgeKey'])
export class UserBadge {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 36 })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'userId',
    foreignKeyConstraintName: 'FK_user_badges_user',
  })
  user: User;

  @Column({ length: 64 })
  badgeKey: string;

  /** 只在首次达成时写入，不随重新计算更改。 */
  @Column({ type: 'datetime', precision: 0 })
  unlockedAt: Date;
}
