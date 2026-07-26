import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { ProfileController } from './profile.controller';
import { User } from '../../entities/user.entity';
import { YearBudget } from '../../entities/year-budget.entity';
import { Journey } from '../../entities/journey.entity';
import { Location } from '../../entities/location.entity';
import { TravelIdentityDict } from '../../entities/travel-identity-dict.entity';
import { UserIdentity } from '../../entities/user-identity.entity';
import { MemberPlan } from '../../entities/member-plan.entity';
import { StorageModule } from '../../infrastructure/storage/storage.module';
import { MemberBenefitModule } from '../membership/member-benefit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      YearBudget,
      Journey,
      Location,
      TravelIdentityDict,
      UserIdentity,
      MemberPlan,
    ]),
    StorageModule,
    MemberBenefitModule,
  ],
  controllers: [UserController, ProfileController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
