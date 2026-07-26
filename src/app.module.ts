import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './infrastructure/database/database.module';
import { WechatModule } from './infrastructure/wechat/wechat.module';
import { StorageModule } from './infrastructure/storage/storage.module';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { JourneyModule } from './modules/journey/journey.module';
import { RecordingModule } from './modules/recording/recording.module';
import { LocationModule } from './modules/location/location.module';
import { ExpenseModule } from './modules/expense/expense.module';
import { GuideModule } from './modules/guide/guide.module';
import { MediaModule } from './modules/media/media.module';
import { QuotaModule } from './modules/quota/quota.module';
import { PaymentModule } from './modules/payment/payment.module';
import { PrivacyModule } from './modules/privacy/privacy.module';
import { MapModule } from './modules/map/map.module';
import { DraftModule } from './modules/draft/draft.module';
import { DestinationModule } from './modules/destination/destination.module';
import { ChecklistModule } from './modules/checklist/checklist.module';
import { StatsModule } from './modules/stats/stats.module';
import { MembershipModule } from './modules/membership/membership.module';
import { MemberBenefitModule } from './modules/membership/member-benefit.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    WechatModule,
    StorageModule,
    AuthModule,
    UserModule,
    JourneyModule,
    RecordingModule,
    LocationModule,
    ExpenseModule,
    GuideModule,
    MediaModule,
    QuotaModule,
    PaymentModule,
    PrivacyModule,
    MapModule,
    DraftModule,
    DestinationModule,
    ChecklistModule,
    StatsModule,
    MembershipModule,
    MemberBenefitModule,
  ],
})
export class AppModule {}
