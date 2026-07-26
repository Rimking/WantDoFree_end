import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * 微信支付适配。
 * 未配置 WX_MCH_ID 时返回 mock prepay，仅供本地联调。
 * 已配置商户号但未接证书时明确报错，避免假装可支付。
 */
@Injectable()
export class WechatPayService {
  private readonly logger = new Logger(WechatPayService.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.config.get('WX_MCH_ID'));
  }

  async createPrepay(
    userId: string,
    product: string,
    amountCent: number,
  ): Promise<{ prepayId: string; mock: boolean; amountCent: number }> {
    if (!this.isConfigured()) {
      this.logger.warn('WX_MCH_ID 未配置，返回 mock prepay（不可用于真实支付）');
      return {
        prepayId: `mock_prepay_${userId.slice(0, 8)}_${Date.now()}`,
        mock: true,
        amountCent,
      };
    }

    throw new ServiceUnavailableException(
      `微信支付 v3 未接入（product=${product}）。请配置商户证书后再启用真实下单。`,
    );
  }

  /** 生产回调验签占位：未配置商户时一律失败。 */
  verifyNotifySignature(_headers: Record<string, string>, _rawBody: string): boolean {
    if (!this.isConfigured()) return false;
    // TODO: 微信 v3 平台证书验签
    return false;
  }
}
