import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { Entry } from './entry.entity';

/** 位置点。encryptedPoly 预留加密列，当前业务写明文 lat/lng。 */
@Entity('locations')
export class Location {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 36, unique: true })
  entryId: string;

  @OneToOne(() => Entry, (e) => e.location, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'entryId' })
  entry: Entry;

  @Column({ type: 'double' })
  lat: number;

  @Column({ type: 'double' })
  lng: number;

  @Column({ nullable: true, length: 255 })
  name?: string;

  @Column({ type: 'text', nullable: true, comment: '密文(PIPL)' })
  encryptedPoly?: string;

  @CreateDateColumn()
  createdAt: Date;
}
