import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { User } from './user.entity';
import { Entry } from './entry.entity';
import { JourneyStatus } from '../common/enums/catalog';

@Entity('journeys')
@Unique('UQ_journeys_user_client', ['userId', 'clientId'])
export class Journey {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ length: 36 })
  userId: string;

  @ManyToOne(() => User, (u) => u.journeys, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  /** 离线创建幂等键（按用户维度唯一；可空） */
  @Column({ nullable: true, length: 64 })
  clientId?: string;

  @Column({ length: 128 })
  title: string;

  /** 出发地（创建必填） */
  @Column({ length: 128, default: '' })
  origin: string;

  /** 目的地展示串（可选；与 destinations[] 同步） */
  @Column({ length: 128, nullable: true })
  destination?: string;

  /** 多选目的地城市名（结构化） */
  @Column({ type: 'json', nullable: true })
  destinations?: string[] | null;

  @Column({ type: 'date' })
  startDate: string;

  @Column({ type: 'date' })
  endDate: string;

  /** 封面 COS URL */
  @Column({ name: 'cover', nullable: true, length: 512 })
  coverUrl?: string;

  /** planned | ongoing | finished（兼容写入 planning/ended） */
  @Column({ type: 'varchar', length: 16, default: 'planned' })
  status: JourneyStatus;

  /** 主题标签英文 key JSON 数组 */
  @Column({ type: 'json', nullable: true })
  themeTags?: string[];

  /** 同行人英文 key JSON 数组 */
  @Column({ type: 'json', nullable: true })
  companions?: string[];

  /** 预算上限（分）；API 兼容 budgetLimit */
  @Column({ type: 'int', nullable: true })
  budgetAmount?: number;

  @Column({ type: 'boolean', default: false })
  isPublic: boolean;

  @Column({ type: 'int', default: 1 })
  syncVersion: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => Entry, (e) => e.journey)
  entries: Entry[];
}
