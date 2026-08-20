import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../entities/user.entity';
import { QuotaService } from './quota.service';
import { MemberBenefitModule } from '../membership/member-benefit.module';

@Module({
  imports: [TypeOrmModule.forFeature([User]), MemberBenefitModule],
  providers: [QuotaService],
  exports: [QuotaService],
})
export class QuotaModule {}
