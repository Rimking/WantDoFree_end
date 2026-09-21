/**
 * 统一响应包裹 { code, data, message }。
 * 全站由 ResponseWrapInterceptor 兜底包裹：业务代码只返回 data 本身，不要自己拼 code/message。
 * 仅两种情况需要自行处理：需要额外顶层字段（如 stats 的 range）时用本文件 ok() 自带包裹；
 * 非 JSON / 第三方契约响应用 @SkipResponseWrap() 豁免。
 * 错误响应由 HttpExceptionFilter 统一产生（同样带 code/data/message）。
 */

/** 业务成功码（前端按此判断成功，勿改）。 */
export const SUCCESS_CODE = 2000;

export interface ApiEnvelope<T = unknown> {
  code: number | string;
  data: T;
  message: string;
}

/** 包裹成功响应：数据一律放在 data 中。 */
export function ok<T>(
  data: T,
  message = '',
): { code: number; data: T; message: string } {
  return { code: SUCCESS_CODE, data, message };
}

/** 是否已是统一结构：拦截器据此避免二次包裹（如 stats 自带 range 的响应）。 */
export function isEnvelope(body: unknown): body is ApiEnvelope {
  return (
    !!body &&
    typeof body === 'object' &&
    !Array.isArray(body) &&
    'code' in body &&
    'data' in body &&
    'message' in body
  );
}
