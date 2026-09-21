import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { isDevPayEnabled } from '../env';

/**
 * 调试路由守卫（/pay/dev-complete、/membership/orders/:no/pay）。
 * 仅当「非生产 且 ENABLE_DEV_PAY=true」时放行——只判断 NODE_ENV 会在
 * 忘配 / 拼错环境变量时把调试支付口暴露到线上。
 */
@Injectable()
export class DevOnlyGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    if (!isDevPayEnabled()) {
      throw new ForbiddenException({
        code: 'DEV_DISABLED',
        message: '调试接口不可用（需非生产环境且 ENABLE_DEV_PAY=true）',
      });
    }
    return true;
  }
}
