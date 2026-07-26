import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '../../entities/order.entity';
import { User } from '../../entities/user.entity';
import { PaymentService } from './payment.service';
import { PaymentController, PayNotifyController } from './payment.controller';
import { WechatPayService } from './wechat-pay.service';
import { ConfigModule } from '@nestjs/config';
import { DevOnlyGuard } from '../../common/guards/dev-only.guard';

@Module({
  imports: [TypeOrmModule.forFeature([Order, User]), ConfigModule],
  controllers: [PaymentController, PayNotifyController],
  providers: [PaymentService, WechatPayService, DevOnlyGuard],
})
export class PaymentModule {}
