import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../entities/user.entity';
import { Order } from '../../entities/order.entity';
import { MemberPlan } from '../../entities/member-plan.entity';
import { MembershipService } from './membership.service';
import { MembershipController } from './membership.controller';
import { MemberBenefitModule } from './member-benefit.module';
import { InviteModule } from '../invite/invite.module';

@Module({
  imports: [
    MemberBenefitModule,
    TypeOrmModule.forFeature([User, Order, MemberPlan]),
    forwardRef(() => InviteModule),
  ],
  controllers: [MembershipController],
  providers: [MembershipService],
  exports: [MembershipService],
})
export class MembershipModule {}
