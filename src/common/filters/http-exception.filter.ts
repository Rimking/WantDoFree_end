import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';

/** class-validator / Nest 默认英文约束文案 → 对前端只展示「参数错误」 */
function isTechnicalParamMessage(message: unknown): boolean {
  if (Array.isArray(message)) return true;
  if (typeof message !== 'string') return false;
  const m = message.trim();
  if (!m) return true;
  if (
    /\bmust be\b/i.test(m) ||
    /\bshould not\b/i.test(m) ||
    /\bshould be\b/i.test(m) ||
    /\bmust match\b/i.test(m) ||
    /\beach value in\b/i.test(m) ||
    /\bwhitelisted\b/i.test(m) ||
    /\bproperty .+ should not exist\b/i.test(m) ||
    /\brequired\b/i.test(m) ||
    /\binvalid\b/i.test(m) ||
    /\bmust be a URL\b/i.test(m) ||
    /\bmust be an? (string|number|boolean|array|object|email|uuid)\b/i.test(m)
  ) {
    return true;
  }
  if (/\w+\.\d+\./.test(m) && /must |should /i.test(m)) return true;
  return false;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const isProd = process.env.NODE_ENV === 'production';

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let message: string | string[] = 'Internal server error';
    let code: string | number = 'INTERNAL_ERROR';
    let extra: Record<string, unknown> = {};

    if (exception instanceof HttpException) {
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
        code = status;
      } else if (typeof res === 'object' && res !== null) {
        const r = res as Record<string, any>;
        message = r.message ?? exception.message;
        code = r.code ?? r.error ?? status;
        const {
          message: _m,
          error: _e,
          statusCode: _s,
          stack: _st,
          details: _d,
          ...rest
        } = r;
        // 禁止把校验原文细节透出给前端
        extra = rest;
      }
    }

    if (Array.isArray(message)) message = message.join('; ');

    const isParamError =
      (status === HttpStatus.BAD_REQUEST ||
        status === HttpStatus.UNPROCESSABLE_ENTITY) &&
      (code === '40001' ||
        code === 'Bad Request' ||
        code === 'BadRequest' ||
        code === HttpStatus.BAD_REQUEST ||
        isTechnicalParamMessage(message));

    if (isParamError) {
      const hasBusinessCode =
        typeof code === 'string' &&
        /^[45]\d{4}$/.test(code) &&
        code !== '40001' &&
        !isTechnicalParamMessage(message);
      if (!hasBusinessCode) {
        message = '参数错误';
        code = '40001';
        // 去掉可能残留的 details / 校验字段
        const { details: _drop, ...safe } = extra as Record<string, unknown>;
        extra = safe;
      }
    }

    response.status(status).json({
      code,
      message,
      ...extra,
      timestamp: new Date().toISOString(),
      path: request.url,
      // 入参错误不返回 stack，避免原文进响应
      ...(!isProd &&
      !isParamError &&
      exception instanceof Error
        ? { stack: exception.stack }
        : {}),
    });
  }
}
