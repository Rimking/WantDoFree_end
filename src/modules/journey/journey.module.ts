import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Journey } from '../../entities/journey.entity';
import { JourneyPlan } from '../../entities/journey-plan.entity';
import { Expense } from '../../entities/expense.entity';
import { Entry } from '../../entities/entry.entity';
import { Location } from '../../entities/location.entity';
import { Destination } from '../../entities/destination.entity';
import { ChecklistItem } from '../../entities/checklist-item.entity';
import { Guide } from '../../entities/guide.entity';
import { Share } from '../../entities/share.entity';
import { ShareEvent } from '../../entities/share-event.entity';
import { JourneyService } from './journey.service';
import { JourneyAggregateService } from './journey-aggregate.service';
import { JourneyController } from './journey.controller';
import { ChecklistModule } from '../checklist/checklist.module';
import { RecordingModule } from '../recording/recording.module';
import { ExpenseModule } from '../expense/expense.module';
import { GuideModule } from '../guide/guide.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Journey,
      JourneyPlan,
      Expense,
      Entry,
      Location,
      Destination,
      ChecklistItem,
      Guide,
      Share,
      ShareEvent,
    ]),
    ChecklistModule,
    forwardRef(() => RecordingModule),
    ExpenseModule,
    GuideModule,
  ],
  controllers: [JourneyController],
  providers: [JourneyService, JourneyAggregateService],
  exports: [JourneyService, JourneyAggregateService],
})
export class JourneyModule {}
