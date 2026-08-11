import {
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { GUIDE_TEMPLATE_IDS } from '../../common/handbook';

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

/**
 * 模版海报出图确认。
 * 当前约定：客户端 Canvas 渲染后经 /media 上传，再把 imageUrl 回传本接口登记。
 */
export class ExportPosterDto {
  @IsUUID()
  journeyId: string;

  @IsOptional()
  @IsIn([...GUIDE_TEMPLATE_IDS])
  templateId?: string;

  /** 已上传的海报图 URL（/dream/v1/files/... 或 CDN） */
  @IsUrl({ require_tld: false })
  imageUrl: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  shareToken?: string;
}

/** 生成分享小程序码 */
export class CreateWxaCodeDto {
  @IsOptional()
  @IsUUID()
  journeyId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  shareToken?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  page?: string;
}
