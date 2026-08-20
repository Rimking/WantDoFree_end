import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/** 会员套餐配置（运营可配，不硬编码前端）。 */
@Entity('member_plans')
export class MemberPlan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 套餐 code：monthly / yearly / yearly_once */
  @Column({ type: 'varchar', length: 32, unique: true })
  code: string;

  /** 展示名：连续包月 / 连续包年 / 单年 */
  @Column({ type: 'varchar', length: 64 })
  name: string;

  /** 价格（分） */
  @Column({ type: 'int' })
  priceCent: number;

  /** 周期天数（30 / 365） */
  @Column({ type: 'int' })
  periodDays: number;

  /** 是否自动续费（连续包月/包年=true，单年=false） */
  @Column({ type: 'boolean' })
  autoRenew: boolean;

  /** 划线价（分，可选） */
  @Column({ type: 'int', nullable: true })
  originalPriceCent?: number | null;

  /** 首月特惠价（分，仅 monthly 可选） */
  @Column({ type: 'int', nullable: true })
  firstMonthDiscountCent?: number | null;

  /** 标签：主推 / 首月特惠（可选） */
  @Column({ type: 'varchar', length: 32, nullable: true })
  tag?: string | null;

  /** 展示序（升序） */
  @Column({ type: 'int', default: 0 })
  sort: number;

  /** 是否上架 */
  @Column({ type: 'boolean', default: true })
  active: boolean;

  @CreateDateColumn({ type: 'datetime', precision: 0, default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 0, default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}
