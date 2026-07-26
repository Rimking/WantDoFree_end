import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Journey } from '../../entities/journey.entity';
import { Entry } from '../../entities/entry.entity';
import { Guide } from '../../entities/guide.entity';
import { ShareEvent } from '../../entities/share-event.entity';
import { GuideService } from './guide.service';
import { GuideController } from './guide.controller';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Journey, Entry, Guide, ShareEvent]),
    MediaModule,
  ],
  controllers: [GuideController],
  providers: [GuideService],
  exports: [GuideService],
})
export class GuideModule {}
