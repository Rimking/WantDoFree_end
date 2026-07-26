-- =====================================================================
-- 会员体系迁移（member schema + 种子套餐）
-- ---------------------------------------------------------------------
-- 适用范围：生产环境手工执行（开发期 synchronize:true 已自动建表，无需执行）。
-- 设计依据：渡清川_会员体系落地设计.md §2.1 / §2.2 / §2.3。
-- 幂等：所有 DDL 用 information_schema 守卫；种子用 INSERT ... ON DUPLICATE KEY UPDATE。
-- 列名 camelCase（与实体一致，本仓无 naming strategy）。
-- =====================================================================

DELIMITER $$

-- 通用守卫：列不存在才 ALTER
DROP PROCEDURE IF EXISTS add_member_columns $$
CREATE PROCEDURE add_member_columns()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'member_expire_at'
  ) THEN
    ALTER TABLE users
      ADD COLUMN member_expire_at DATETIME NULL,
      ADD COLUMN auto_renew TINYINT(1) NOT NULL DEFAULT 0,
      ADD COLUMN member_since_at DATETIME NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'plan_code'
  ) THEN
    ALTER TABLE orders
      ADD COLUMN plan_code VARCHAR(32) NULL,
      ADD COLUMN period_days INT NULL,
      ADD COLUMN expire_at DATETIME NULL,
      ADD COLUMN auto_renew TINYINT(1) NOT NULL DEFAULT 0,
      ADD COLUMN coupon_id VARCHAR(36) NULL,
      ADD COLUMN refund_id VARCHAR(64) NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'refund_id'
  ) THEN
    -- 兼容旧表已部分加列的情况（仅补 refund_id）
    ALTER TABLE orders ADD COLUMN refund_id VARCHAR(64) NULL;
  END IF;
END $$

DELIMITER ;

CALL add_member_columns();
DROP PROCEDURE IF EXISTS add_member_columns;

-- 套餐配置表（不存在才建）
CREATE TABLE IF NOT EXISTS member_plans (
  id VARCHAR(36) NOT NULL,
  code VARCHAR(32) NOT NULL,
  name VARCHAR(64) NOT NULL,
  priceCent INT NOT NULL,
  periodDays INT NOT NULL,
  autoRenew TINYINT(1) NOT NULL DEFAULT 0,
  originalPriceCent INT NULL,
  firstMonthDiscountCent INT NULL,
  tag VARCHAR(32) NULL,
  sort INT NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  createdAt DATETIME(6) NOT NULL,
  updatedAt DATETIME(6) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_member_plans_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 订单 status 值域扩展（product 仍容纳 capacity_pack / pro_monthly）
-- 仅当使用 ENUM 时需要；本仓 orders.status 为 varchar，直接写入字符串即可，无需 ALTER。

-- =====================================================================
-- 种子套餐（与 PRD §4 定价一致）
--   连续包月 ¥18 / 首月特惠 ¥9 / 连续包年 ¥128（主推）/ 单年 ¥168
-- =====================================================================
INSERT INTO member_plans
  (id, code, name, priceCent, periodDays, autoRenew, originalPriceCent, firstMonthDiscountCent, tag, sort, active, createdAt, updatedAt)
VALUES
  (UUID(), 'monthly',     '连续包月', 1800,  30,  1, NULL, 900,  '首月特惠', 1, 1, NOW(6), NOW(6)),
  (UUID(), 'yearly',      '连续包年', 12800, 365, 1, NULL, NULL, '主推',     2, 1, NOW(6), NOW(6)),
  (UUID(), 'yearly_once', '单年',     16800, 365, 0, NULL, NULL, NULL,      3, 1, NOW(6), NOW(6))
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  priceCent = VALUES(priceCent),
  periodDays = VALUES(periodDays),
  autoRenew = VALUES(autoRenew),
  originalPriceCent = VALUES(originalPriceCent),
  firstMonthDiscountCent = VALUES(firstMonthDiscountCent),
  tag = VALUES(tag),
  sort = VALUES(sort),
  active = VALUES(active),
  updatedAt = NOW(6);
