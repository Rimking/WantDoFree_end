import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('invite_codes')
export class InviteCode {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ length: 36 })
  userId: string;

  @Index({ unique: true })
  @Column({ length: 16 })
  code: string;

  /** 是否已发放「满 3 人得 1 年」大奖 */
  @Column({ type: 'boolean', default: false })
  bonusGranted: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
