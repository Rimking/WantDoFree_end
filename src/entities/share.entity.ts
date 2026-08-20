import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/** 分享票据（免登录公开落地页 / 增长归因）。详见 `渡清川_分享体系设计.md` §4.1。 */
@Entity('shares')
export class Share {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 短码（对外暴露，免登录取内容用）。由 share 模块生成，全局唯一。 */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 32 })
  token: string;

  /** 关联旅程 id */
  @Index()
  @Column({ type: 'varchar', length: 36 })
  journeyId: string;

  /** 关联攻略 id（手帐预览对象；缺省取旅程最新攻略） */
  @Column({ type: 'varchar', length: 36, nullable: true })
  guideId?: string | null;

  /** 分享者（owner）用户 id */
  @Column({ type: 'varchar', length: 36 })
  sharerId: string;

  /** 权限分级：public=可被索引/展示；unlisted=仅持链接可见（默认，平衡曝光与隐私） */
  @Column({ type: 'varchar', length: 16, default: 'unlisted' })
  visibility: 'public' | 'unlisted';

  /** 可选有效期；过期后 GET /shares/:token 返回 410 */
  @Column({ type: 'datetime', nullable: true })
  expireAt?: Date | null;

  @CreateDateColumn({ type: 'datetime', precision: 0, default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}
