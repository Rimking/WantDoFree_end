-- media 多态重构 + users 扩展（生产环境执行；开发期 synchronize 会自动对齐）
-- 注意：会重建 media 表结构；请先备份。

-- 1) 备份旧 media
CREATE TABLE IF NOT EXISTS media_backup_20260724 AS SELECT * FROM media;

-- 2) 丢掉旧 FK / 表后按新结构建（若库中仍是 entryId 旧结构）
SET @has_entry := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'media' AND COLUMN_NAME = 'entryId'
);

-- 简化：直接迁移到新表
CREATE TABLE IF NOT EXISTS media_new (
  id           VARCHAR(36)  NOT NULL PRIMARY KEY,
  ownerType    VARCHAR(24)  NOT NULL,
  ownerId      VARCHAR(36)  NOT NULL,
  kind         VARCHAR(12)  NOT NULL,
  url          VARCHAR(512) NOT NULL DEFAULT '',
  thumbUrl     VARCHAR(512) NULL,
  mime         VARCHAR(64)  NOT NULL DEFAULT 'application/octet-stream',
  ext          VARCHAR(8)   NULL,
  sizeBytes    BIGINT       NOT NULL DEFAULT 0,
  width        INT          NULL,
  height       INT          NULL,
  durationSec  INT          NULL,
  checksum     VARCHAR(64)  NULL,
  sortOrder    INT          NOT NULL DEFAULT 0,
  status       VARCHAR(12)  NOT NULL DEFAULT 'active',
  storageTier  VARCHAR(8)   NOT NULL DEFAULT 'hot',
  driver       VARCHAR(8)   NOT NULL DEFAULT 'local',
  storageKey   VARCHAR(255) NULL,
  createdBy    VARCHAR(36)  NULL,
  createdAt    DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updatedAt    DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  deletedAt    DATETIME(6)  NULL,
  INDEX idx_media_owner (ownerType, ownerId, deletedAt),
  INDEX idx_media_checksum (checksum),
  INDEX idx_media_created (createdBy, createdAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 从旧表灌入（旧 kind photo/voice → image/audio）
INSERT INTO media_new (id, ownerType, ownerId, kind, url, mime, sizeBytes, status, storageTier, driver, createdAt, updatedAt)
SELECT
  id,
  'entry',
  entryId,
  CASE WHEN kind IN ('voice','audio') THEN 'audio' ELSE 'image' END,
  COALESCE(cdnUrl, url),
  CASE WHEN kind IN ('voice','audio') THEN 'audio/m4a' ELSE 'image/jpeg' END,
  COALESCE(size, 0),
  'active',
  COALESCE(tier, 'hot'),
  'local',
  createdAt,
  createdAt
FROM media
WHERE EXISTS (
  SELECT 1 FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'media' AND COLUMN_NAME = 'entryId'
);

-- 若上面 INSERT 因结构不同失败，可手工跳过；开发环境直接 DROP 后靠 synchronize

DROP TABLE IF EXISTS media;
RENAME TABLE media_new TO media;

-- 3) users 扩展
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS unionid VARCHAR(64) NULL,
  ADD COLUMN IF NOT EXISTS appId VARCHAR(32) NULL,
  ADD COLUMN IF NOT EXISTS role VARCHAR(12) NOT NULL DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS status VARCHAR(12) NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS deletedAt DATETIME(6) NULL;

-- MySQL 8.0.12 以下无 IF NOT EXISTS，可改为手动检查后执行
-- CREATE UNIQUE INDEX uk_users_unionid ON users (unionid);
