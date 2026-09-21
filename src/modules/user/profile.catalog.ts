/** 个人资料公共工具：昵称校验 / 敏感词 / 手机号脱敏。 */

const SENSITIVE = ['傻逼', '共产党', '法轮', '微信官方', '管理员'];

export function containsSensitive(text: string): boolean {
  const t = text.toLowerCase();
  return SENSITIVE.some((w) => t.includes(w));
}

/** 昵称：2–12，trim 后非空，至少一个汉字/字母/数字 */
export function validateNickname(raw: string): { ok: true; value: string } | { ok: false; code: string; message: string } {
  const value = raw.trim();
  if (value.length < 2 || value.length > 12) {
    return { ok: false, code: '40001', message: '昵称需为 2–12 个字符' };
  }
  if (!/[\u4e00-\u9fa5a-zA-Z0-9]/.test(value)) {
    return { ok: false, code: '40001', message: '昵称不能为纯符号或纯 emoji' };
  }
  if (containsSensitive(value)) {
    return { ok: false, code: '40001', message: '昵称含敏感词' };
  }
  return { ok: true, value };
}

export function maskPhone(phone?: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7) return '****';
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
  }
  return `${digits.slice(0, 2)}****${digits.slice(-2)}`;
}
