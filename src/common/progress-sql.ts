/** DATETIME 采用项目既有的北京时间存储；不依赖数据库会话时区。 */
export const BEIJING_NOW_SQL = '(UTC_TIMESTAMP() + INTERVAL 8 HOUR)';

/** alias/now 只允许由服务端代码传入，不能接收外部参数。 */
export function eligibleEntrySql(alias: string, now = BEIJING_NOW_SQL): string {
  return `COALESCE(JSON_UNQUOTE(JSON_EXTRACT(${alias}.payload, '$.source')), '') <> 'plan_place'
    AND COALESCE(${alias}.recordedAt, ${alias}.createdAt) <= ${now}`;
}

export function validLocationSql(alias: string): string {
  return `${alias}.lat BETWEEN -90 AND 90 AND ${alias}.lng BETWEEN -180 AND 180`;
}

export function citySql(alias: string): string {
  return `NULLIF(TRIM(${alias}.city), '')`;
}

export function beijingDateTime(now = new Date()): string {
  return new Date(now.getTime() + 8 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 19)
    .replace('T', ' ');
}
