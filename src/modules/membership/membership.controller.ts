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
export class MembershipController {
  constructor(private readonly membership: MembershipService) {}

  /** 套餐列表（可未登录）；首购有效价请结合 GET /membership/me.firstMonthEligible */
  @Get('plans')
  plans() {
    return this.membership.listPlans();
  }

  /** 我的会员状态 */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() u: { id: string }) {
    return this.membership.getMe(u.id);
  }

  /** PRD 别名：同 /membership/me */
  @Get('status')
  @UseGuards(JwtAuthGuard)
  status(@CurrentUser() u: { id: string }) {
    return this.membership.getMe(u.id);
  }

  /** 流失挽回 stub */
  @Get('winback')
  @UseGuards(JwtAuthGuard)
  winback(@CurrentUser() u: { id: string }) {
    return this.membership.getWinback(u.id);
  }

  @Post('orders')
  @UseGuards(JwtAuthGuard)
  createOrder(
    @CurrentUser() u: { id: string },
    @Body() dto: CreateMembershipOrderDto,
  ) {
    return this.membership.createOrder(u.id, dto);
  }

  @Post('orders/:orderNo/pay')
  @UseGuards(JwtAuthGuard)
  pay(@CurrentUser() u: { id: string }, @Param('orderNo') orderNo: string) {
    return this.membership.payOrder(orderNo, u.id);
  }

  @Get('orders/:orderNo')
  @UseGuards(JwtAuthGuard)
  order(@CurrentUser() u: { id: string }, @Param('orderNo') orderNo: string) {
    return this.membership.getOrder(orderNo, u.id);
  }

  @Post('orders/:orderNo/cancel')
  @UseGuards(JwtAuthGuard)
  cancel(
    @CurrentUser() u: { id: string },
    @Param('orderNo') orderNo: string,
  ) {
    return this.membership.cancelOrder(orderNo, u.id);
  }

  @Patch('renewal')
  @UseGuards(JwtAuthGuard)
  renewal(@CurrentUser() u: { id: string }, @Body() dto: SetRenewalDto) {
    return this.membership.setRenewal(u.id, dto);
  }

  @Post('refund')
  @UseGuards(JwtAuthGuard)
  refund(@CurrentUser() u: { id: string }, @Body() dto: RefundDto) {
    return this.membership.refund(u.id, dto);
  }
}
