import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';

/** 统计接口简易限流：每用户 20 次 / 分钟 */
@Injectable()
export class StatsRateLimitGuard implements CanActivate {
  private readonly hits = new Map<string, number[]>();
  private readonly limit = 20;
  private readonly windowMs = 60_000;

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const userId = req.user?.id as string | undefined;
    if (!userId) return true;

    const now = Date.now();
    const arr = (this.hits.get(userId) ?? []).filter(
      (t) => now - t < this.windowMs,
    );
    if (arr.length >= this.limit) {
      throw new HttpException(
        { code: 429, message: '请求过于频繁，请稍后重试' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    arr.push(now);
    this.hits.set(userId, arr);
    return true;
  }
}
