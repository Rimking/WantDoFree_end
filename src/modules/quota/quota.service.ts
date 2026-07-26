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
        message: '照片配额已用尽，请升级容量包',
      });
    }
    if (kind === 'voice' && u.usedVoiceSec + n > u.quotaVoiceSec) {
      throw new BadRequestException({
        code: 'QUOTA_EXCEEDED',
        message: '语音配额已用尽，请升级容量包',
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

  async getStatus(userId: string) {
    const u = await this.users.findOne({ where: { id: userId } });
    if (!u) throw new NotFoundException('user not found');
    // 读取时惰性降级：pro 且过期 → free（配额回退），仅变更时落库（幂等）。
    if (this.benefit.reconcileExpiry(u)) await this.users.save(u);
    return {
      plan: u.plan,
      photo: {
        used: u.usedPhoto,
        quota: u.quotaPhoto,
        limit: u.quotaPhoto,
        remaining: Math.max(0, u.quotaPhoto - u.usedPhoto),
      },
      voiceSec: {
        used: u.usedVoiceSec,
        quota: u.quotaVoiceSec,
        limit: u.quotaVoiceSec,
        remaining: Math.max(0, u.quotaVoiceSec - u.usedVoiceSec),
        /** 单位：秒（统计 /stats/storage 同源） */
        unit: 'second' as const,
      },
    };
  }
}
