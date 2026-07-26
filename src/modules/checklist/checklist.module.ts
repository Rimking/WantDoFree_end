import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChecklistItem } from '../../entities/checklist-item.entity';
import { Journey } from '../../entities/journey.entity';
import { ChecklistService } from './checklist.service';
import {
  ChecklistController,
  ChecklistJourneyController,
} from './checklist.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ChecklistItem, Journey])],
  controllers: [ChecklistJourneyController, ChecklistController],
  providers: [ChecklistService],
  exports: [ChecklistService],
})
export class ChecklistModule {}
