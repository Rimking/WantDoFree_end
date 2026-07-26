import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Journey } from '../../entities/journey.entity';
import { Entry } from '../../entities/entry.entity';
import { Expense } from '../../entities/expense.entity';
import { Location } from '../../entities/location.entity';
import { Media } from '../../entities/media.entity';
import { Destination } from '../../entities/destination.entity';
import { ChecklistItem } from '../../entities/checklist-item.entity';
import { Guide } from '../../entities/guide.entity';
import { User } from '../../entities/user.entity';
import { UserStatsSnapshot } from '../../entities/user-stats-snapshot.entity';
import { StatsService } from './stats.service';
import { StatsController } from './stats.controller';
import { StatsRateLimitGuard } from './stats-rate-limit.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Journey,
      Entry,
      Expense,
      Location,
      Media,
      Destination,
      ChecklistItem,
      Guide,
      User,
      UserStatsSnapshot,
    ]),
  ],
  controllers: [StatsController],
  providers: [StatsService, StatsRateLimitGuard],
  exports: [StatsService],
})
export class StatsModule {}
