import { IsString, Length } from 'class-validator';

export class WechatLoginDto {
  @IsString() @Length(1, 64) code: string; // 前端 uni.login 拿到的 code（dev 模式即 openid）
}
