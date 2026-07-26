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
  status: 'pending' | 'paid' | 'closed';

  @Column({ nullable: true, length: 64 })
  transactionId?: string;

  @Column({ type: 'datetime', nullable: true })
  paidAt?: Date;

  @CreateDateColumn()
  createdAt: Date;
}
