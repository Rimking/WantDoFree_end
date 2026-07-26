import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Location } from '../../entities/location.entity';
import { Entry } from '../../entities/entry.entity';
import { Journey } from '../../entities/journey.entity';

@Injectable()
export class LocationService {
  constructor(
    @InjectRepository(Location) private readonly locations: Repository<Location>,
    @InjectRepository(Entry) private readonly entries: Repository<Entry>,
    @InjectRepository(Journey) private readonly journeys: Repository<Journey>,
  ) {}

  /** 清除当前用户全部位置点。 */
  async clearByUser(userId: string) {
    const rows = await this.locations
      .createQueryBuilder('loc')
      .leftJoin('loc.entry', 'entry')
      .leftJoin('entry.journey', 'journey')
      .where('journey.userId = :userId', { userId })
      .getMany();
    await this.locations.remove(rows);
    return { deleted: rows.length };
  }

  /** 清除某旅程下全部位置点（需归属当前用户）。 */
  async clearByJourney(userId: string, journeyId: string) {
    const journey = await this.journeys.findOne({
      where: { id: journeyId, userId },
    });
    if (!journey) throw new NotFoundException('journey not found');

    const rows = await this.locations
      .createQueryBuilder('loc')
      .leftJoin('loc.entry', 'entry')
      .where('entry.journeyId = :journeyId', { journeyId })
      .getMany();
    await this.locations.remove(rows);
    return { deleted: rows.length };
  }
}
