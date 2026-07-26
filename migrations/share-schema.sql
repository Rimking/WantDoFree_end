-- 渡清川 · 分享体系 · shares 表迁移（Phase 4 / T4.1）
-- 幂等：生产环境手工执行；开发期 synchronize=true 已自动对齐，无需重复跑。
-- 列名 camelCase，与既有实体（orders/member_plans/share_events）一致（本仓无 naming strategy）。

CREATE TABLE IF NOT EXISTS `shares` (
  `id`         CHAR(36)      NOT NULL,
  `token`      VARCHAR(32)   NOT NULL,
  `journeyId`  VARCHAR(36)   NOT NULL,
  `guideId`    VARCHAR(36)   NULL,
  `sharerId`   VARCHAR(36)   NOT NULL,
  `visibility` VARCHAR(16)   NOT NULL DEFAULT 'unlisted',
  `expireAt`   DATETIME      NULL,
  `createdAt`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_shares_token` (`token`),
  KEY `idx_shares_journey` (`journeyId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 分享归因事件表（北极星：已分享攻略数）。
-- ⚠️ 关键：此前仅有下方 T6.2 的 ALTER，漏了 CREATE TABLE；开发期靠
-- synchronize=true 自动建表未暴露，但生产（synchronize 关闭）下该表不存在，
-- 会导致 POST /shares/:token/view 归因插入 500。现补齐幂等建表。
CREATE TABLE IF NOT EXISTS `share_events` (
  `id`        CHAR(36)     NOT NULL,
  `journeyId` VARCHAR(36)  NOT NULL,
  `guideId`   VARCHAR(36)  NULL,
  `channel`   VARCHAR(16)  NOT NULL,
  `sharerId`  VARCHAR(36)  NOT NULL,
  `viewerId`  VARCHAR(36)  NULL,
  `createdAt` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_share_events_journey` (`journeyId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- T6.2 修复：分享归因事件 `guideId` 允许为空。
-- 背景：分享可在「旅程尚无攻略」时创建（guideId 为 NULL），其浏览归因
-- (POST /shares/:token/view) 会写入 share_events；若 guideId 列 NOT NULL
-- 无默认值则插入报 500（QueryFailedError: Field 'guideId' doesn't have a
-- default value）。实体已改为 nullable，此处补齐生产手工迁移。
-- 幂等：仅当列当前为 NOT NULL 时执行 ALTER。
SET @s = (SELECT IF(
  (SELECT IS_NULLABLE FROM information_schema.columns
   WHERE table_schema = DATABASE()
     AND table_name = 'share_events'
     AND column_name = 'guideId') = 'NO',
  'ALTER TABLE `share_events` MODIFY `guideId` VARCHAR(36) NULL;',
  'SELECT 1'));
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
