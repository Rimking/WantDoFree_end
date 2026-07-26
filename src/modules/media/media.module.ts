import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Media } from '../../entities/media.entity';
import { Entry } from '../../entities/entry.entity';
import { Journey } from '../../entities/journey.entity';
import { Destination } from '../../entities/destination.entity';
import { Guide } from '../../entities/guide.entity';
import { User } from '../../entities/user.entity';
import { MediaService } from './media.service';
import { MediaController } from './media.controller';
import { FilesController } from './files.controller';
import { StorageModule } from '../../infrastructure/storage/storage.module';
import { QuotaModule } from '../quota/quota.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Media,
      Entry,
      Journey,
      Destination,
      Guide,
      User,
    ]),
    StorageModule,
    QuotaModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        secret: cfg.get('JWT_SECRET') || 'dev_secret',
      }),
    }),
  ],
  controllers: [MediaController, FilesController],
  providers: [MediaService],
  exports: [MediaService],
})
export class MediaModule {}
