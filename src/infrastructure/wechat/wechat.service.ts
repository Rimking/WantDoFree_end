import { Injectable, UnauthorizedException, Logger, ForbiddenException } from '@nestjs/common';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';

/**
 * 微信小程序适配：code2Session。
 * 未配置 WX_APPID/WX_SECRET 时进入开发模式（code 当作 openid），仅用于本地联调。
 */
@Injectable()
export class WechatService {
  private readonly logger = new Logger(WechatService.name);
  private cachedToken: { value: string; expireAt: number } | null = null;

  constructor(private readonly config: ConfigService) {}

  private get isProd() {
    return this.config.get('NODE_ENV') === 'production';
  }

  isConfigured(): boolean {
    return Boolean(this.config.get('WX_APPID') && this.config.get('WX_SECRET'));
  }

  async code2Session(code: string): Promise<{ openid: string; mock: boolean }> {
    // 生产：禁止开发登录与 code 当 openid
    if (this.isProd) {
      if (code === 'dev_openid_demo') {
        throw new ForbiddenException({
          code: 'DEV_DISABLED',
          message: '生产环境禁止开发登录',
        });
      }
      if (!this.isConfigured()) {
        throw new ForbiddenException({
          code: 'WX_NOT_CONFIGURED',
          message: '生产环境必须配置 WX_APPID/WX_SECRET',
        });
      }
    }

    // 本地种子账号：开发环境允许用固定 code 登录，即使已配置真实 AppId
    if (!this.isProd && code === 'dev_openid_demo') {
      this.logger.warn('使用种子账号 openid=dev_openid_demo（仅非生产）');
      return { openid: 'dev_openid_demo', mock: true };
    }

    if (!this.isConfigured()) {
      this.logger.warn('WX_APPID/WX_SECRET 未配置，使用 code 作为 openid（dev）');
      return { openid: code, mock: true };
    }
    const { data } = await axios.get(
      'https://api.weixin.qq.com/sns/jscode2session',
      {
        params: {
          appid: this.config.get('WX_APPID'),
          secret: this.config.get('WX_SECRET'),
          js_code: code,
          grant_type: 'authorization_code',
        },
      },
    );
    if (data.errcode) {
      throw new UnauthorizedException(
        `wx login failed: ${data.errcode} ${data.errmsg}`,
      );
    }
    return { openid: data.openid, mock: false };
  }

  async getAccessToken(): Promise<string> {
    if (!this.isConfigured()) return 'dev_access_token';

    const now = Date.now();
    if (this.cachedToken && this.cachedToken.expireAt > now) {
      return this.cachedToken.value;
    }

    const { data } = await axios.get(
      'https://api.weixin.qq.com/cgi-bin/token',
      {
        params: {
          grant_type: 'client_credential',
          appid: this.config.get('WX_APPID'),
          secret: this.config.get('WX_SECRET'),
        },
      },
    );
    if (data.errcode) {
      throw new UnauthorizedException(`wx token failed: ${data.errmsg}`);
    }
    // 提前 5 分钟过期
    this.cachedToken = {
      value: data.access_token,
      expireAt: now + (data.expires_in - 300) * 1000,
    };
    return data.access_token;
  }

  /** 内容安全检查；未配置微信时默认通过。当前业务层未强制调用。 */
  async msgSecCheck(content: string): Promise<boolean> {
    if (!this.isConfigured()) return true;
    try {
      const token = await this.getAccessToken();
      const { data } = await axios.post(
        `https://api.weixin.qq.com/wxa/msg_sec_check?access_token=${token}`,
        { content },
      );
      return data.errcode === 0;
    } catch {
      return false;
    }
  }
}
