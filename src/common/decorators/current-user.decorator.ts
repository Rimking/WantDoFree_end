import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** 取当前登录用户：JwtStrategy.validate 返回 { id }，挂在 req.user 上。 */
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest();
    return req.user;
  },
);
