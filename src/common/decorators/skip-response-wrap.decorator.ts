import { SetMetadata } from '@nestjs/common';

/** 拦截器读取的元数据键：命中后该路由返回值不做统一包裹。 */
export const SKIP_RESPONSE_WRAP = 'skip_response_wrap';

/**
 * 跳过全局响应包裹。仅限两类场景：
 * 1) 非 JSON 响应（文件回读等二进制/流式）；
 * 2) 第三方定义的外部契约（微信支付回调等）。
 * 业务接口一律不要用：所有响应必须保持 { code, data, message } 结构。
 */
export const SkipResponseWrap = () => SetMetadata(SKIP_RESPONSE_WRAP, true);
