import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** 生产环境禁止调试路由（/pay/dev-complete 等） */
@Injectable()
export class DevOnlyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(_context: ExecutionContext): boolean {
    if (this.config.get('NODE_ENV') === 'production') {
      throw new ForbiddenException({
        code: 'DEV_DISABLED',
        message: '调试接口在生产环境不可用',
      });
    }
    return true;
  }
}
