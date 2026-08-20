import { Module } from '@nestjs/common';
import { MapService } from './map.service';
import { PoisController } from './pois.controller';

@Module({
  controllers: [PoisController],
  providers: [MapService],
  exports: [MapService],
})
export class MapModule {}
