import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../entities/user.entity';
import { QuotaService } from './quota.service';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [QuotaService],
  exports: [QuotaService],
})
export class QuotaModule {}
