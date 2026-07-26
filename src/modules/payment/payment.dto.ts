import { IsEnum, IsOptional, IsString } from 'class-validator';

export enum ProductCode {
  capacity_pack = 'capacity_pack',
  pro_monthly = 'pro_monthly',
}

/** 服务端定价表（单位：分）。金额不由客户端决定。 */
export const PRODUCT_PRICES: Record<ProductCode, number> = {
  [ProductCode.capacity_pack]: 990,
  [ProductCode.pro_monthly]: 1990,
};

export class CreateOrderDto {
  @IsEnum(ProductCode)
  product: ProductCode;
}

/** 本地联调用的假回调 body；生产应由微信平台推送并验签。 */
export class DevPayNotifyDto {
  @IsString()
  orderId: string;

  @IsOptional()
  @IsString()
  transactionId?: string;
}
