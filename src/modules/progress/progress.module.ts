import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../entities/user.entity';
import { UserBadge } from '../../entities/user-badge.entity';
import { UserProgress } from '../../entities/user-progress.entity';
import { ProgressController } from './progress.controller';
import { ProgressMetricsService } from './progress.metrics';
import { ProgressService } from './progress.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, UserBadge, UserProgress])],
  controllers: [ProgressController],
  providers: [ProgressService, ProgressMetricsService],
})
export class ProgressModule {}
