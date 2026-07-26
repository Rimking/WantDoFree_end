import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Journey } from '../../entities/journey.entity';
import { Entry } from '../../entities/entry.entity';
import { Location } from '../../entities/location.entity';
import { Expense } from '../../entities/expense.entity';
import { Media } from '../../entities/media.entity';
import { RecordingService } from './recording.service';
import {
  RecordingController,
  RecordsController,
} from './recording.controller';
import { QuotaModule } from '../quota/quota.module';
import { WechatModule } from '../../infrastructure/wechat/wechat.module';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Journey, Entry, Location, Expense, Media]),
    QuotaModule,
    WechatModule,
    MediaModule,
  ],
  controllers: [RecordingController, RecordsController],
  providers: [RecordingService],
  exports: [RecordingService],
})
export class RecordingModule {}
