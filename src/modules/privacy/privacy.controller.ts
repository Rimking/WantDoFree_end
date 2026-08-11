import { Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { PrivacyService } from './privacy.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('me')
@UseGuards(JwtAuthGuard)
export class PrivacyController {
  constructor(private readonly privacy: PrivacyService) {}

  /** PIPL：导出本人全部旅程与记录（JSON） */
  @Get('export')
  export(@CurrentUser() u: { id: string }) {
    return this.privacy.exportAll(u.id);
  }

  /** 账号注销（软删） */
  @Post('delete')
  @HttpCode(200)
  deleteAccount(@CurrentUser() u: { id: string }) {
    return this.privacy.deleteAccount(u.id);
  }
}
