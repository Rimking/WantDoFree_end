import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';

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
        const { message: _m, error: _e, statusCode: _s, stack: _st, ...rest } =
          r;
        extra = rest;
      }
    }

    if (Array.isArray(message)) message = message.join('; ');

    response.status(status).json({
      code,
      message,
      ...extra,
      timestamp: new Date().toISOString(),
      path: request.url,
      ...(!isProd && exception instanceof Error
        ? { stack: exception.stack }
        : {}),
    });
  }
}
