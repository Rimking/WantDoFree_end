import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InviteCode } from '../../entities/invite-code.entity';
import { InviteRecord } from '../../entities/invite-record.entity';
import { User } from '../../entities/user.entity';
import { InviteService } from './invite.service';
import { MemberBenefitModule } from '../membership/member-benefit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([InviteCode, InviteRecord, User]),
    MemberBenefitModule,
  ],
  providers: [InviteService],
  exports: [InviteService],
})
export class InviteModule {}
