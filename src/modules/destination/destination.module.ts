import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Destination } from '../../entities/destination.entity';
import { Journey } from '../../entities/journey.entity';
import { JourneyPlan } from '../../entities/journey-plan.entity';
import { DestinationService } from './destination.service';
import {
  DestinationController,
  DestinationJourneyController,
} from './destination.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Destination, Journey, JourneyPlan])],
  controllers: [DestinationJourneyController, DestinationController],
  providers: [DestinationService],
  exports: [DestinationService],
})
export class DestinationModule {}
