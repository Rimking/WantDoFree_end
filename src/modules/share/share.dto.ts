import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

/** POST /shares — 创建分享票据（需登录）。 */
export class CreateShareDto {
  @IsUUID()
  journeyId: string;

  @IsOptional()
  @IsUUID()
  guideId?: string;

  /** 权限分级，默认 unlisted（仅持链接可见）。 */
  @IsOptional()
  @IsIn(['public', 'unlisted'])
  visibility?: 'public' | 'unlisted';
}

/** POST /shares/:token/view — 归因（免登录，幂等）。 */
export class ViewShareDto {
  /** 浏览者用户 id（注册/进入小程序后回填，用于归因转化）。 */
  @IsOptional()
  @IsString()
  viewerId?: string;
}
