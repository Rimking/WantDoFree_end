import { formatDateTime } from '../../common/datetime.util';

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { User } from '../../entities/user.entity';
import { YearBudget } from '../../entities/year-budget.entity';
import { Journey } from '../../entities/journey.entity';
import { Location } from '../../entities/location.entity';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { MemberBenefitService } from '../membership/member-benefit.service';
import {
  AvatarPresignDto,
  PatchUserProfileDto,
  UpsertBudgetDto,
} from './user.dto';
import { toUserResponse } from './user-response';
import {
  maskPhone,
  validateNickname,
  containsSensitive,
} from './profile.catalog';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(YearBudget)
    private readonly budgets: Repository<YearBudget>,
    @InjectRepository(Journey)
    private readonly journeys: Repository<Journey>,
    @InjectRepository(Location)
    private readonly locations: Repository<Location>,
    private readonly storage: StorageService,
    private readonly benefit: MemberBenefitService,
  ) {}

  private memberLevel(plan: string) {
    return plan === 'pro' ? 'PRO' : 'FREE';
  }

  async getById(id: string) {
    const u = await this.users.findOne({ where: { id } });
    if (!u) throw new NotFoundException('user not found');
    // 读取时惰性降级：pro 且过期 → free（配额回退），仅变更时落库（幂等）。
    if (this.benefit.reconcileExpiry(u)) await this.users.save(u);
    const tripCount = await this.journeys.count({ where: { userId: id } });
    const footprintCities = await this.countFootprintCities(id);
    return toUserResponse(u, {
      footprintCities,
      tripCount,
    });
  }

  async getBudget(userId: string, year?: number) {
    const y = year ?? new Date().getFullYear();
    const row = await this.budgets.findOne({ where: { userId, year: y } });
    return {
      year: y,
      amountCent: row?.amountCent ?? 0,
      updatedAt: formatDateTime(row?.updatedAt),
    };
  }

  async upsertBudget(userId: string, dto: UpsertBudgetDto) {
    let row = await this.budgets.findOne({
      where: { userId, year: dto.year },
    });
    if (!row) {
      row = this.budgets.create({
        userId,
        year: dto.year,
        amountCent: dto.amountCent,
      });
    } else {
      row.amountCent = dto.amountCent;
    }
    const saved = await this.budgets.save(row);
    return {
      year: saved.year,
      amountCent: saved.amountCent,
      updatedAt: formatDateTime(saved.updatedAt),
    };
  }

  // ─── 个人信息编辑 ─────────────────────────────────────

  async getProfile(userId: string) {
    const u = await this.users.findOne({ where: { id: userId } });
    if (!u) throw new NotFoundException('user not found');
    if (this.benefit.reconcileExpiry(u)) await this.users.save(u);

    const tripCount = await this.journeys.count({ where: { userId } });
    const footprintCities = await this.countFootprintCities(userId);

    return {
      userId: u.id,
      nickname: u.nick ?? null,
      avatarUrl: u.avatar ?? null,
      gender: u.gender ?? 'FEMALE',
      bio: u.bio ?? null,
      phoneMasked: maskPhone(u.phone),
      memberLevel: this.memberLevel(u.plan),
      stats: {
        footprintCities,
        tripCount,
      },
      updatedAt: formatDateTime(u.updatedAt),
    };
  }

  private async countFootprintCities(userId: string) {
    const raw = await this.locations
      .createQueryBuilder('loc')
      .innerJoin('loc.entry', 'entry')
      .innerJoin('entry.journey', 'journey')
      .select('COUNT(DISTINCT loc.name)', 'cnt')
      .where('journey.userId = :userId', { userId })
      .andWhere('loc.name IS NOT NULL')
      .andWhere("loc.name <> ''")
      .getRawOne();
    return Number(raw?.cnt ?? 0);
  }

  async patchProfile(userId: string, dto: PatchUserProfileDto) {
    const u = await this.users.findOne({ where: { id: userId } });
    if (!u) throw new NotFoundException('user not found');

    if (dto.nickname !== undefined) {
      const v = validateNickname(dto.nickname);
      if (!v.ok) {
        throw new BadRequestException({ code: v.code, message: v.message });
      }
      const taken = await this.users.findOne({
        where: { nick: v.value, id: Not(userId) },
      });
      if (taken) {
        throw new BadRequestException({
          code: '40002',
          message: '昵称已被占用',
        });
      }
      u.nick = v.value;
    }

    if (dto.avatarUrl !== undefined) u.avatar = dto.avatarUrl || undefined;

    if (dto.gender !== undefined) {
      u.gender = dto.gender as User['gender'];
    }

    if (dto.bio !== undefined) {
      if (dto.bio === null || dto.bio === '') {
        u.bio = undefined;
      } else if (dto.bio.length > 40) {
        throw new BadRequestException({
          code: '40003',
          message: '签名过长',
        });
      } else if (containsSensitive(dto.bio)) {
        throw new BadRequestException({
          code: '40001',
          message: '签名含敏感词',
        });
      } else {
        u.bio = dto.bio;
      }
    }

    await this.users.save(u);
    const profile = await this.getProfile(userId);
    return {
      updatedAt: formatDateTime(profile.updatedAt),
      profile,
    };
  }

  async checkNickname(userId: string, nickname: string) {
    const v = validateNickname(nickname);
    if (!v.ok) {
      return { available: false, code: v.code, message: v.message };
    }
    const taken = await this.users.findOne({
      where: { nick: v.value, id: Not(userId) },
    });
    if (taken) {
      return {
        available: false,
        code: '40002',
        message: '昵称已被占用',
      };
    }
    return { available: true };
  }

  async avatarPresign(userId: string, dto: AvatarPresignDto) {
    const ext = dto.ext === 'jpeg' ? 'jpg' : dto.ext;
    const allowed = ['jpg', 'png', 'webp'];
    if (!allowed.includes(ext)) {
      throw new BadRequestException({
        code: '40001',
        message: '头像仅支持 jpg/png/webp',
      });
    }
    const expectedType =
      ext === 'png'
        ? 'image/png'
        : ext === 'webp'
          ? 'image/webp'
          : 'image/jpeg';
    if (dto.contentType !== expectedType && !(ext === 'jpg' && dto.contentType === 'image/jpeg')) {
      throw new BadRequestException({
        code: '40001',
        message: 'contentType 与 ext 不匹配',
      });
    }

    const key = `avatars/${userId}_${Date.now()}.${ext}`;
    const data = await this.storage.getAvatarPresign(key, 300);
    return data;
  }
}
