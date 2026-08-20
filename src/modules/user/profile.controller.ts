import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { UserService } from './user.service';
import {
  AvatarPresignDto,
  NicknameCheckDto,
  PatchUserProfileDto,
} from './user.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

/**
 * 个人信息编辑页 API（需求：渡清川_个人信息编辑页）
 * 路径前缀：/dream/v1/user
 * PATCH /user/profile 兼容端点已于 2026-08-20 下线，统一 POST /user/profile/update。
 */
@Controller('user')
@UseGuards(JwtAuthGuard)
export class ProfileController {
  constructor(private readonly user: UserService) {}

  @Get('profile')
  getProfile(@CurrentUser() u: { id: string }) {
    return this.user.getProfile(u.id);
  }

  @Post('profile/update')
  updateProfilePost(
    @CurrentUser() u: { id: string },
    @Body() dto: PatchUserProfileDto,
  ) {
    return this.user.patchProfile(u.id, dto);
  }

  @Post('avatar/presign')
  avatarPresign(
    @CurrentUser() u: { id: string },
    @Body() dto: AvatarPresignDto,
  ) {
    return this.user.avatarPresign(u.id, dto);
  }

  @Get('identities')
  identities() {
    return this.user.listIdentities();
  }

  /** 省市区联动选项（校验用白名单同源） */
  @Get('regions')
  regions() {
    return this.user.listRegions();
  }

  @Post('nickname/check')
  nicknameCheck(
    @CurrentUser() u: { id: string },
    @Body() dto: NicknameCheckDto,
  ) {
    return this.user.checkNickname(u.id, dto.nickname);
  }
}
