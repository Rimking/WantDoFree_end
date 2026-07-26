import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../entities/user.entity';
import { QuotaService } from './quota.service';
import { QuotaController } from './quota.controller';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [QuotaController],
  providers: [QuotaService],
  exports: [QuotaService],
})
export class QuotaModule {}
