import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Draft } from '../../entities/draft.entity';
import { DraftService } from './draft.service';
import { DraftController } from './draft.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Draft])],
  controllers: [DraftController],
  providers: [DraftService],
})
export class DraftModule {}
