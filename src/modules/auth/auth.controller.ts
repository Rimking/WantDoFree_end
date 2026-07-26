import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { WechatLoginDto } from './auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('wechat-login')
  wechatLogin(@Body() dto: WechatLoginDto) {
    return this.auth.wechatLogin(dto.code);
  }
}
