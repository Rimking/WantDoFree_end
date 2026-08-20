import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Guide } from './guide.entity';
import { Journey } from './journey.entity';
import { User } from './user.entity';

import { ShareChannel } from '../common/enums/catalog';
export type { ShareChannel };

/** 分享归因事件（北极星：已分享攻略数）。 */
@Entity('share_events')
export class ShareEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ length: 36 })
  journeyId: string;

  @ManyToOne(() => Journey, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'journeyId' })
  journey: Journey;

  @Column({ nullable: true, length: 36 })
  guideId?: string;

  @ManyToOne(() => Guide, (g) => g.shareEvents, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'guideId' })
  guide?: Guide;

  @Column({ type: 'varchar', length: 16 })
  channel: ShareChannel;

  @Column({ length: 36 })
  sharerId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sharerId' })
  sharer: User;

  /** P1：微信 share ticket 回填 */
  @Column({ nullable: true, length: 36 })
  viewerId?: string;

  @CreateDateColumn({ name: 'createdAt', type: 'datetime', precision: 0, default: () => 'CURRENT_TIMESTAMP' })
  sharedAt: Date;
}
