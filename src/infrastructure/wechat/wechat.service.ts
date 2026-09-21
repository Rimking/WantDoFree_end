import { Injectable, UnauthorizedException, Logger, ForbiddenException } from '@nestjs/common';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { isMockLoginEnabled, isProd } from '../../common/env';

/**
 * 微信小程序适配：code2Session。
 * 未配置 WX_APPID/WX_SECRET 时只有显式开启 ENABLE_MOCK_LOGIN（且非生产）才能
 * 用 code 直接换取身份，用于本地联调；否则一律拒绝。
 */
@Injectable()
export class WechatService {
  private readonly logger = new Logger(WechatService.name);
  private cachedToken: { value: string; expireAt: number } | null = null;

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.config.get('WX_APPID') && this.config.get('WX_SECRET'));
  }

  async code2Session(code: string): Promise<{ openid: string; mock: boolean }> {
    if (isProd() && !this.isConfigured()) {
      throw new ForbiddenException({
        code: 'WX_NOT_CONFIGURED',
        message: '生产环境必须配置 WX_APPID/WX_SECRET',
      });
    }

    // 模拟登录仅限显式开启 ENABLE_MOCK_LOGIN 的非生产环境；
    // 未开启时任何 code 都不能换取身份，防止「忘配生产环境变量」被冒名登录。
    if (isMockLoginEnabled()) {
      if (code === 'dev_openid_demo') {
        const bound =
          this.config.get<string>('DEMO_USER_OPENID') || 'dev_openid_demo';
        this.logger.warn(
          `使用种子账号 openid=${bound}（code=dev_openid_demo，仅限模拟登录开启时）`,
        );
        return { openid: bound, mock: true };
      }
      if (!this.isConfigured()) {
        this.logger.warn('WX_APPID/WX_SECRET 未配置，使用 code 作为 openid（模拟登录）');
        return { openid: code, mock: true };
      }
    }

    if (!this.isConfigured()) {
      throw new ForbiddenException({
        code: 'WX_NOT_CONFIGURED',
        message: '微信登录未配置，且未开启 ENABLE_MOCK_LOGIN',
      });
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

  /**
   * getPhoneNumber（基础库 2.21.2+）：授权 code 换手机号。
   * 未配置微信时：模拟登录开启则把 code 直接作为手机号（本地联调），否则拒绝。
   */
  async getPhoneNumber(code: string): Promise<{ phone: string; mock: boolean }> {
    if (!this.isConfigured()) {
      if (isMockLoginEnabled()) {
        this.logger.warn('WX_APPID/WX_SECRET 未配置，以 code 作为手机号（模拟绑定）');
        return { phone: code, mock: true };
      }
      throw new ForbiddenException({
        code: 'WX_NOT_CONFIGURED',
        message: '微信手机号服务未配置',
      });
    }
    const token = await this.getAccessToken();
    const { data } = await axios.post(
      `https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${token}`,
      { code },
    );
    if (data.errcode !== 0) {
      throw new UnauthorizedException(
        `wx phone failed: ${data.errcode} ${data.errmsg}`,
      );
    }
    const phone: string =
      data.phone_info?.purePhoneNumber || data.phone_info?.phoneNumber || '';
    if (!phone) {
      throw new UnauthorizedException('wx phone: empty phone_info');
    }
    return { phone, mock: false };
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

  /**
   * 小程序码（无限量）。未配置微信时返回 null（由上层生成占位图）。
   * scene 最长 32 字符。
   */
  async getUnlimitedWxaCode(input: {
    scene: string;
    page?: string;
    width?: number;
  }): Promise<{ buffer: Buffer; mock: boolean } | null> {
    if (!this.isConfigured()) {
      return null;
    }
    const token = await this.getAccessToken();
    const { data } = await axios.post(
      `https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${token}`,
      {
        scene: input.scene.slice(0, 32),
        page: input.page || 'pages/ShareView/ShareView',
        width: input.width ?? 430,
        check_path: false,
        env_version: isProd() ? 'release' : 'trial',
      },
      { responseType: 'arraybuffer' },
    );
    const buf = Buffer.from(data);
    // 失败时微信返回 JSON
    if (buf[0] === 0x7b) {
      const err = JSON.parse(buf.toString('utf8'));
      this.logger.warn(`wxacode failed: ${err.errcode} ${err.errmsg}`);
      throw new UnauthorizedException(
        `wxacode failed: ${err.errcode} ${err.errmsg}`,
      );
    }
    return { buffer: buf, mock: false };
  }
}
