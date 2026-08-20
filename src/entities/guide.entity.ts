import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { Journey } from './journey.entity';
import { ShareEvent } from './share-event.entity';

/** 攻略实体：payload 落地缓存聚合结果。 */
@Entity('guides')
export class Guide {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 36, unique: true })
  journeyId: string;

  @ManyToOne(() => Journey, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'journeyId' })
  journey: Journey;

  @Column({ type: 'varchar', length: 32, default: 'basic' })
  template: string;

  /** 聚合结果：高光 / 路线 / 花费占比等 */
  @Column({ type: 'json', nullable: true })
  payload?: Record<string, unknown>;

  @Column({ type: 'text', nullable: true })
  coverUrl?: string;

  @Column({ type: 'boolean', default: false })
  isFavorited: boolean;

  /** 冗余：总花费（分），便于列表展示 */
  @Column({ type: 'int', nullable: true })
  totalCost?: number;

  @CreateDateColumn({ type: 'datetime', precision: 0, default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @OneToMany(() => ShareEvent, (s) => s.guide)
  shareEvents: ShareEvent[];
}
