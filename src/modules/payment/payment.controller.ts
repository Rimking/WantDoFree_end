import {
  Body,
  Controller,
  Headers,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { PaymentService } from './payment.service';
import { CreateOrderDto, DevPayNotifyDto } from './payment.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { DevOnlyGuard } from '../../common/guards/dev-only.guard';

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class PaymentController {
  constructor(private readonly payment: PaymentService) {}

  @Post()
  create(@CurrentUser() u: { id: string }, @Body() dto: CreateOrderDto) {
    return this.payment.createOrder(u.id, dto);
  }
}

@Controller('pay')
export class PayNotifyController {
  constructor(private readonly payment: PaymentService) {}

  /**
   * 本地联调：模拟支付成功。
   * Header: X-Dev-Pay-Secret: <DEV_PAY_NOTIFY_SECRET>
   * Body: { orderId, transactionId? }
   */
  @Post('dev-complete')
  @UseGuards(DevOnlyGuard)
  devComplete(
    @Headers('x-dev-pay-secret') secret: string | undefined,
    @Body() body: DevPayNotifyDto,
  ) {
    return this.payment.completeMockPayment(
      body.orderId,
      secret,
      body.transactionId,
    );
  }

  /**
   * 微信平台回调占位。未配置验签前一律拒绝，避免被刷配额。
   */
  @Post('notify')
  notify(
    @Headers() headers: Record<string, string>,
    @Req() req: { body: any; rawBody?: string },
  ) {
    const orderId = req.body?.orderId ?? req.body?.out_trade_no;
    const transactionId = req.body?.transactionId ?? req.body?.transaction_id;
    return this.payment.handlePlatformNotify(
      headers,
      req.rawBody ?? JSON.stringify(req.body ?? {}),
      orderId,
      transactionId,
    );
  }
}
