import { Module } from '@nestjs/common';
import { MapService } from './map.service';
import { MapController } from './map.controller';
import { PoisController } from './pois.controller';

@Module({
  controllers: [MapController, PoisController],
  providers: [MapService],
  exports: [MapService],
})
export class MapModule {}
