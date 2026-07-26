import { Entity, Column, ManyToOne, JoinColumn, PrimaryColumn } from 'typeorm';
import { User } from './user.entity';
import { TravelIdentityDict } from './travel-identity-dict.entity';

/** 用户 ↔ 旅行身份 */
@Entity('user_identities')
export class UserIdentity {
  @PrimaryColumn({ length: 36 })
  userId: string;

  @PrimaryColumn({ length: 32 })
  identityCode: string;

  @ManyToOne(() => User, (u) => u.identities, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => TravelIdentityDict, (d) => d.users, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'identityCode' })
  identity: TravelIdentityDict;
}
