import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ShareService } from './share.service';
import { CreateShareDto, ViewShareDto } from './share.dto';

@Controller()
export class ShareController {
  constructor(private readonly share: ShareService) {}

  /** 创建分享票据（需登录）。 */
  @Post('shares')
  @UseGuards(JwtAuthGuard)
  create(
    @CurrentUser() u: { id: string },
    @Body() dto: CreateShareDto,
  ) {
    return this.share.createShare(u.id, dto);
  }

  /** 免登录只读内容（脱敏）。 */
  @Get('shares/:token')
  get(@Param('token') token: string) {
    return this.share.getShare(token);
  }

  /** 归因（免登录，幂等）。 */
  @Post('shares/:token/view')
  view(@Param('token') token: string, @Body() dto: ViewShareDto) {
    return this.share.viewShare(token, dto?.viewerId);
  }

  /** owner 分享统计（需登录）。 */
  @Get('me/share-stats')
  @UseGuards(JwtAuthGuard)
  stats(@CurrentUser() u: { id: string }) {
    return this.share.getShareStats(u.id);
  }

  /** 当前用户导出/海报水印策略（分享面板用）。 */
  @Get('share/export-policy')
  @UseGuards(JwtAuthGuard)
  exportPolicy(@CurrentUser() u: { id: string }) {
    return this.share.exportPolicyForUser(u.id);
  }
}
