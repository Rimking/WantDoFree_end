import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type InviteRecordStatus = 'REGISTERED' | 'ACTIVATED' | 'REWARDED';

@Entity('invite_records')
@Index(['inviterId', 'inviteeId'], { unique: true })
export class InviteRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ length: 36 })
  inviterId: string;

  @Index()
  @Column({ length: 36 })
  inviteeId: string;

  @Column({ length: 16 })
  code: string;

  @Column({ type: 'varchar', length: 16, default: 'REGISTERED' })
  status: InviteRecordStatus | string;

  @Column({ type: 'int', default: 0 })
  rewardDays: number;

  @Column({ type: 'datetime', nullable: true })
  rewardedAt?: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
