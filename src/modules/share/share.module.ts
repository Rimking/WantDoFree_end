import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Share } from '../../entities/share.entity';
import { Journey } from '../../entities/journey.entity';
import { Guide } from '../../entities/guide.entity';
import { User } from '../../entities/user.entity';
import { ShareEvent } from '../../entities/share-event.entity';
import { ShareService } from './share.service';
import { ShareController } from './share.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Share, Journey, Guide, User, ShareEvent]),
  ],
  controllers: [ShareController],
  providers: [ShareService],
  exports: [ShareService],
})
export class ShareModule {}
