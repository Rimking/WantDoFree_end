import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../entities/user.entity';
import { Order } from '../../entities/order.entity';
import { MemberPlan } from '../../entities/member-plan.entity';
import { MembershipService } from './membership.service';
import { MembershipController } from './membership.controller';
import { MemberBenefitModule } from './member-benefit.module';

@Module({
  imports: [
    MemberBenefitModule,
    TypeOrmModule.forFeature([User, Order, MemberPlan]),
  ],
  controllers: [MembershipController],
  providers: [MembershipService],
})
export class MembershipModule {}
