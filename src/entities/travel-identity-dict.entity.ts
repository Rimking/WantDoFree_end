import { Entity, Column, PrimaryColumn, OneToMany } from 'typeorm';
import { UserIdentity } from './user-identity.entity';

/** 旅行身份字典 */
@Entity('travel_identity_dict')
export class TravelIdentityDict {
  @PrimaryColumn({ length: 32 })
  code: string;

  @Column({ length: 32 })
  name: string;

  @Column({ type: 'int', default: 0 })
  sort: number;

  @OneToMany(() => UserIdentity, (u) => u.identity)
  users: UserIdentity[];
}
