import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  OneToMany,
} from 'typeorm';
import { Journey } from './journey.entity';
import { Order } from './order.entity';
import { UserIdentity } from './user-identity.entity';

export type UserPlan = 'free' | 'pro';
export type Gender = 'MALE' | 'FEMALE' | 'UNKNOWN';
export type MemberLevel = 'FREE' | 'PRO';
export type UserRole = 'user' | 'admin';
export type UserStatus = 'active' | 'blocked' | 'deleted';

/** 用户账号、配额与个人资料。 */
@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 64 })
  openid: string;

  /** 微信 unionid（跨应用） */
  @Column({ type: 'varchar', length: 64, nullable: true, unique: true })
  unionid?: string | null;

  /** 小程序 appId（多端） */
  @Column({ type: 'varchar', length: 32, nullable: true })
  appId?: string | null;

  @Column({ type: 'varchar', length: 12, default: 'user' })
  role: UserRole | string;

  @Column({ type: 'varchar', length: 12, default: 'active' })
  status: UserStatus | string;

  /** 兼容旧字段 nick；API 主字段 nickname */
  @Column({ nullable: true, length: 12 })
  nick?: string;

  @Column({ nullable: true, length: 512 })
  avatar?: string;

  @Column({ type: 'varchar', length: 16, default: 'UNKNOWN' })
  gender: Gender;

  @Column({ type: 'date', nullable: true })
  birthday?: string;

  @Column({ type: 'char', length: 6, nullable: true })
  provinceCode?: string;

  @Column({ type: 'char', length: 6, nullable: true })
  cityCode?: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  departureCity?: string;

  @Column({ type: 'varchar', length: 40, nullable: true })
  bio?: string;

  /** 手机号（应用层约定加密/脱敏；响应仅 phoneMasked） */
  @Column({ type: 'varchar', length: 64, nullable: true })
  phone?: string;

  @Column({ type: 'varchar', length: 16, default: 'free' })
  plan: UserPlan;

  @Column({ type: 'int', default: 50, comment: '免费照片配额(张)' })
  quotaPhoto: number;

  @Column({ type: 'int', default: 1800, comment: '免费语音配额(秒)，对应 30 分钟' })
  quotaVoiceSec: number;

  /** 会员到期时间（NULL=无到期/永久免费）；pro 且 < now 时惰性降级 free */
  @Column({ type: 'datetime', nullable: true })
  memberExpireAt?: Date | null;

  /** 是否自动续费（连续包月/包年） */
  @Column({ type: 'boolean', default: false })
  autoRenew: boolean;

  /** 首次开通会员时间 */
  @Column({ type: 'datetime', nullable: true })
  memberSinceAt?: Date | null;

  @Column({ type: 'int', default: 0, comment: '已用照片数' })
  usedPhoto: number;

  @Column({ type: 'int', default: 0, comment: '已用语音秒数' })
  usedVoiceSec: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt?: Date | null;

  @OneToMany(() => Journey, (j) => j.user)
  journeys: Journey[];

  @OneToMany(() => Order, (o) => o.user)
  orders: Order[];

  @OneToMany(() => UserIdentity, (i) => i.user)
  identities: UserIdentity[];
}
