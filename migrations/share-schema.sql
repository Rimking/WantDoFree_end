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
