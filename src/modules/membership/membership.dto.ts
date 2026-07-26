import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/** 创建会员订单：指定套餐 code（对应 member_plans.code）。 */
export class CreateMembershipOrderDto {
  @IsString()
  @IsNotEmpty()
  planCode: string;
}

/** 开关自动续费。 */
export class SetRenewalDto {
  @IsBoolean()
  autoRenew: boolean;
}

/** 申请退款（mock）：可指定订单号，缺省取当前用户最近一笔已支付会员订单。 */
export class RefundDto {
  @IsOptional()
  @IsString()
  orderNo?: string;
}
