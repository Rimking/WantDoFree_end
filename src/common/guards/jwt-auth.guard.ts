import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** JWT 鉴权守卫，保护需要登录的路由。 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
