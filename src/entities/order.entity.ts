import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

/** 付费订单（容量包 / 会员）。 */
@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 36 })
  userId: string;

  @ManyToOne(() => User, (u) => u.orders, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'varchar', length: 32 })
  product: 'capacity_pack' | 'pro_monthly';

  @Column({ type: 'int' })
  amountCent: number;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status: 'pending' | 'paid' | 'closed' | 'refunded' | 'expired';

  @Column({ nullable: true, length: 64 })
  transactionId?: string;

  @Column({ type: 'datetime', nullable: true })
  paidAt?: Date;

  /** 会员套餐 code（membership 下单时记录具体档：monthly/yearly/yearly_once） */
  @Column({ type: 'varchar', length: 32, nullable: true })
  planCode?: string | null;

  /** 会员周期天数（30/365） */
  @Column({ type: 'int', nullable: true })
  periodDays?: number | null;

  /** 订单关闭/过期时间（createdAt + 15min） */
  @Column({ type: 'datetime', nullable: true })
  expireAt?: Date | null;

  /** 是否自动续费（会员订单） */
  @Column({ type: 'boolean', default: false })
  autoRenew: boolean;

  /** 使用的优惠券 id */
  @Column({ type: 'varchar', length: 36, nullable: true })
  couponId?: string | null;

  /** 退款单号（mock 退款时写入） */
  @Column({ type: 'varchar', length: 64, nullable: true })
  refundId?: string | null;

  @CreateDateColumn({ type: 'datetime', precision: 0, default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}
