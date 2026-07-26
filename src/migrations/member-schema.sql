-- 会员体系数据模型迁移（Phase 3 · T3.1）
-- 说明：
--   开发环境 NODE_ENV!=production 时 synchronize=true，entity 变更会自动对齐，无需手工执行本文件。
--   生产环境（synchronize=false）请手工执行本 SQL（或用 migration:run）。
--   列名采用 camelCase，与现有实体（quotaPhoto/usedPhoto）及 manual-media-polymorphic.sql 保持一致。
--   全部用 IF NOT EXISTS / 幂等写法，可重复执行。

-- 1) users 扩展会员状态字段
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS memberExpireAt DATETIME NULL,
  ADD COLUMN IF NOT EXISTS autoRenew   TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS memberSinceAt DATETIME NULL;

-- 2) 新建 member_plans 套餐配置表
CREATE TABLE IF NOT EXISTS member_plans (
  id                    VARCHAR(36)   NOT NULL PRIMARY KEY,
  code                  VARCHAR(32)   NOT NULL,
  name                  VARCHAR(64)   NOT NULL,
  priceCent             INT           NOT NULL,
  periodDays            INT           NOT NULL,
  autoRenew             TINYINT(1)    NOT NULL,
  originalPriceCent     INT           NULL,
  firstMonthDiscountCent INT          NULL,
  tag                   VARCHAR(32)   NULL,
  sort                  INT           NOT NULL DEFAULT 0,
  active                TINYINT(1)    NOT NULL DEFAULT 1,
  createdAt             DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updatedAt             DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY uk_member_plans_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3) orders 扩展会员/退款字段 + status 值域
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS planCode  VARCHAR(32) NULL,
  ADD COLUMN IF NOT EXISTS periodDays INT NULL,
  ADD COLUMN IF NOT EXISTS expireAt DATETIME NULL,
  ADD COLUMN IF NOT EXISTS autoRenew TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS couponId VARCHAR(36) NULL,
  ADD COLUMN IF NOT EXISTS refundId VARCHAR(64) NULL;

-- orders.status 值域扩展为 pending|paid|closed|refunded|expired
-- MySQL ENUM 变更需整体重写；若原 status 已是 VARCHAR(16) 则无需改类型，仅业务层接受新值即可。
-- 如确认为 VARCHAR 列，以下语句可选（无害）：
-- ALTER TABLE orders MODIFY COLUMN status VARCHAR(16) NOT NULL DEFAULT 'pending';
