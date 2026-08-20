import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Journey } from '../../entities/journey.entity';
import { Entry } from '../../entities/entry.entity';
import { Location } from '../../entities/location.entity';
import { Media } from '../../entities/media.entity';
import { FootprintController } from './footprint.controller';
import { FootprintService } from './footprint.service';

@Module({
  imports: [TypeOrmModule.forFeature([Journey, Entry, Location, Media])],
  controllers: [FootprintController],
  providers: [FootprintService],
  exports: [FootprintService],
})
export class FootprintModule {}
