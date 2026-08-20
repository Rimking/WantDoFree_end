import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
} from 'typeorm';

/** 媒体归属类型（多态） */
export type MediaOwnerType =
  | 'entry'
  | 'avatar'
  | 'journey_cover'
  | 'guide'
  | 'destination';

export type MediaKind = 'image' | 'audio';
export type MediaStatus = 'pending' | 'active' | 'deleted';
export type StorageDriverName = 'local' | 'cos';

/**
 * 多态媒体实体：entry 附件 / 头像 / 封面 / 攻略图 / 目的地图 统一落此表。
 * 查询 entry 附件：ownerType='entry' AND ownerId=:entryId AND deletedAt IS NULL
 */
@Entity('media')
@Index('idx_media_owner', ['ownerType', 'ownerId', 'deletedAt'])
@Index('idx_media_checksum', ['checksum'])
@Index('idx_media_created', ['createdBy', 'createdAt'])
export class Media {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 24 })
  ownerType: MediaOwnerType | string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  ownerId: string | null;

  /** 规范值 image|audio；写入兼容 photo|voice */
  @Column({ type: 'varchar', length: 12 })
  kind: MediaKind | string;

  @Column({ type: 'varchar', length: 512, default: '' })
  url: string;

  @Column({ type: 'varchar', length: 512, nullable: true })
  thumbUrl?: string | null;

  @Column({ type: 'varchar', length: 64, default: 'application/octet-stream' })
  mime: string;

  @Column({ type: 'varchar', length: 8, nullable: true })
  ext?: string | null;

  @Column({ type: 'bigint', default: 0 })
  sizeBytes: string | number;

  @Column({ type: 'int', nullable: true })
  width?: number | null;

  @Column({ type: 'int', nullable: true })
  height?: number | null;

  @Column({ type: 'int', nullable: true })
  durationSec?: number | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  checksum?: string | null;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @Column({ type: 'varchar', length: 12, default: 'active' })
  status: MediaStatus | string;

  @Column({ type: 'varchar', length: 8, default: 'hot' })
  storageTier: 'hot' | 'cold' | string;

  @Column({ type: 'varchar', length: 8, default: 'local' })
  driver: StorageDriverName | string;

  /** 对象存储 key，如 2026/07/24/{uuid}.jpg */
  @Column({ type: 'varchar', length: 255, nullable: true })
  storageKey?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  createdBy?: string | null;

  @CreateDateColumn({ type: 'datetime', precision: 0, default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 0, default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt: Date;

  @DeleteDateColumn({ type: 'datetime', precision: 0 })
  deletedAt?: Date | null;
}
