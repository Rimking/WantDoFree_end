-- 目的地重构（批次四 D2）：删除 destinations 表 + journeys.destinations 列
-- ⚠️ 高影响操作：执行前请先全量备份（mysqldump）。
--    本机开发库备份已存于 storage/backups/destinations-refactor_*.sql（含 journey_plans + destinations）。
-- 前置条件：全仓库已无 Destination 引用（模块/实体已删、D1 历史清理已完成）；
--    已用 information_schema 核对 destinations 无外键引用，可安全删除。

-- 1) 表内再保险备份
CREATE TABLE IF NOT EXISTS destinations_backup AS SELECT * FROM destinations;

-- 2) 删表
DROP TABLE IF EXISTS destinations;

-- 3) journeys.destinations JSON 列（实体已移除；条件删列防列不存在报错）
SET @has_dest_col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'journeys' AND COLUMN_NAME = 'destinations'
);
SET @sql := IF(@has_dest_col > 0, 'ALTER TABLE journeys DROP COLUMN destinations', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
