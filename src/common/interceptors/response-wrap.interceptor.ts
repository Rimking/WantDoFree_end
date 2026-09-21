import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, map } from 'rxjs';
import { SKIP_RESPONSE_WRAP } from '../decorators/skip-response-wrap.decorator';
import { isEnvelope, ok } from '../response';

/**
 * 全局响应包裹：所有 HTTP 接口一律返回 { code, data, message }，禁止裸返回业务数据。
 * - data = handler 返回值（无返回值时为 null，message 默认空串）；
 * - handler 已返回统一结构时原样透传（如 stats 的 { code, data, message, range }），避免二次嵌套；
 * - 非 JSON / 第三方契约响应用 @SkipResponseWrap() 豁免。
 * 错误响应不走这里，由 HttpExceptionFilter 输出同样结构。
 */
@Injectable()
export class ResponseWrapInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_RESPONSE_WRAP, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return next.handle();

    return next
      .handle()
      .pipe(map((body) => (isEnvelope(body) ? body : ok(body ?? null))));
  }
}
