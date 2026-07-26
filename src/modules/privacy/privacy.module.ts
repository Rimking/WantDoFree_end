import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../entities/user.entity';
import { Journey } from '../../entities/journey.entity';
import { Entry } from '../../entities/entry.entity';
import { PrivacyService } from './privacy.service';
import { PrivacyController } from './privacy.controller';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Journey, Entry]),
    MediaModule,
  ],
  controllers: [PrivacyController],
  providers: [PrivacyService],
})
export class PrivacyModule {}
