import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { MembershipService } from './membership.service';
import {
  CreateMembershipOrderDto,
  RefundDto,
  SetRenewalDto,
} from './membership.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('membership')
@UseGuards(JwtAuthGuard)
export class MembershipController {
  constructor(private readonly membership: MembershipService) {}

  /** 套餐列表（运营配置驱动）。 */
  @Get('plans')
  plans() {
    return this.membership.listPlans();
  }

  /** 我的会员状态（含惰性降级判定）。 */
  @Get('me')
  me(@CurrentUser() u: { id: string }) {
    return this.membership.getMe(u.id);
  }

  /** 创建会员订单（mock，不调微信）。 */
  @Post('orders')
  createOrder(
    @CurrentUser() u: { id: string },
    @Body() dto: CreateMembershipOrderDto,
  ) {
    return this.membership.createOrder(u.id, dto);
  }

  /** Mock 确认支付：订单置 paid → 激活会员 → 联动配额。 */
  @Post('orders/:orderNo/pay')
  pay(@CurrentUser() u: { id: string }, @Param('orderNo') orderNo: string) {
    return this.membership.payOrder(orderNo, u.id);
  }

  /** 订单状态查询（轮询兜底）。 */
  @Get('orders/:orderNo')
  order(@CurrentUser() u: { id: string }, @Param('orderNo') orderNo: string) {
    return this.membership.getOrder(orderNo, u.id);
  }

  /** 取消未支付订单。 */
  @Post('orders/:orderNo/cancel')
  cancel(
    @CurrentUser() u: { id: string },
    @Param('orderNo') orderNo: string,
  ) {
    return this.membership.cancelOrder(orderNo, u.id);
  }

  /** 开关自动续费。 */
  @Patch('renewal')
  renewal(@CurrentUser() u: { id: string }, @Body() dto: SetRenewalDto) {
    return this.membership.setRenewal(u.id, dto);
  }

  /** 申请退款（mock）。 */
  @Post('refund')
  refund(@CurrentUser() u: { id: string }, @Body() dto: RefundDto) {
    return this.membership.refund(u.id, dto);
  }
}
