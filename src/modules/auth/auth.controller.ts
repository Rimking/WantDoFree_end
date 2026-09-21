import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { BindPhoneDto, WechatLoginDto } from './auth.dto';
import { ok } from '../../common/response';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('wechat-login')
  async wechatLogin(@Body() dto: WechatLoginDto) {
    // 前端约定：外层 { code, message }，业务数据（token/user）全部放 data
    return ok(await this.auth.wechatLogin(dto.code));
  }

  /** 绑定 / 更换手机号（需登录态） */
  @Post('bind-phone')
  @UseGuards(JwtAuthGuard)
  async bindPhone(
    @CurrentUser() u: { id: string },
    @Body() dto: BindPhoneDto,
  ) {
    return ok(await this.auth.bindPhone(u.id, dto.code));
  }
}
