import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../entities/user.entity';
import { MemberBenefitService } from '../membership/member-benefit.service';

@Injectable()
export class QuotaService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly benefit: MemberBenefitService,
  ) {}

  /** 上传前校验免费配额，超额抛错引导付费（记录/分享永不收费，仅容量收费）。 */
  async assertWithin(userId: string, kind: 'photo' | 'voice', n = 1) {
    const u = await this.users.findOne({ where: { id: userId } });
    if (!u) throw new NotFoundException('user not found');
    if (kind === 'photo' && u.usedPhoto + n > u.quotaPhoto) {
      throw new BadRequestException({
        code: 'QUOTA_EXCEEDED',
        message: '照片配额已用尽，升级会员解锁 300 张 / 180 分钟',
      });
    }
    if (kind === 'voice' && u.usedVoiceSec + n > u.quotaVoiceSec) {
      throw new BadRequestException({
        code: 'QUOTA_EXCEEDED',
        message: '语音配额已用尽，升级会员解锁 300 张 / 180 分钟',
      });
    }
  }

  /** 计量已用配额。 */
  async addUsage(userId: string, kind: 'photo' | 'voice', amount: number) {
    const u = await this.users.findOne({ where: { id: userId } });
    if (!u) return;
    if (kind === 'photo') u.usedPhoto += amount;
    else u.usedVoiceSec += amount;
    await this.users.save(u);
  }
}
