/**
 * 时间统一输出工具。
 * 后端所有返回给前端的日期时间统一为 `YYYY-MM-DD HH:mm:ss`（本地时间，无小数秒），
 * 与数据库 datetime(0) 列 / 前端 formatApiDateTime 保持一致。
 */

/** Date 或可解析字符串 → `YYYY-MM-DD HH:mm:ss`；无效/空返回 null */
export function formatDateTime(
  v: Date | string | null | undefined,
): string | null {
  if (v == null) return null;
  const d = typeof v === 'string' ? new Date(v) : v;
  if (Number.isNaN(d.getTime())) return null;
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  );
}

/** 同上，但输入为 null 时返回 null（不参与 JSON 序列化） */
export function dateTimeOrNull(
  v: Date | string | null | undefined,
): string | null {
  return formatDateTime(v);
}
