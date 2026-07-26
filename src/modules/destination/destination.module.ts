import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Destination } from '../../entities/destination.entity';
import { Journey } from '../../entities/journey.entity';
import { DestinationService } from './destination.service';
import {
  DestinationController,
  DestinationJourneyController,
} from './destination.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Destination, Journey])],
  controllers: [DestinationJourneyController, DestinationController],
  providers: [DestinationService],
  exports: [DestinationService],
})
export class DestinationModule {}
