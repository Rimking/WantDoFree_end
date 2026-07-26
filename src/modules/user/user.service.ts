import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { User } from '../../entities/user.entity';
import { YearBudget } from '../../entities/year-budget.entity';
import { Journey } from '../../entities/journey.entity';
import { Location } from '../../entities/location.entity';
import { TravelIdentityDict } from '../../entities/travel-identity-dict.entity';
import { UserIdentity } from '../../entities/user-identity.entity';
import { StorageService } from '../../infrastructure/storage/storage.service';
import {
  AvatarPresignDto,
  PatchUserProfileDto,
  UpdateProfileDto,
  UpsertBudgetDto,
} from './user.dto';
import {
  IDENTITY_MAX_SELECT,
  TRAVEL_IDENTITIES,
  findCity,
  formatRegion,
  listProvinces,
  maskPhone,
  validateNickname,
  containsSensitive,
} from './profile.catalog';

@Injectable()
export class UserService implements OnModuleInit {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(YearBudget)
    private readonly budgets: Repository<YearBudget>,
    @InjectRepository(Journey)
    private readonly journeys: Repository<Journey>,
    @InjectRepository(Location)
    private readonly locations: Repository<Location>,
    @InjectRepository(TravelIdentityDict)
    private readonly identityDict: Repository<TravelIdentityDict>,
    @InjectRepository(UserIdentity)
    private readonly userIdentities: Repository<UserIdentity>,
    private readonly storage: StorageService,
  ) {}

  async onModuleInit() {
    for (const item of TRAVEL_IDENTITIES) {
      const exists = await this.identityDict.findOne({
        where: { code: item.code },
      });
      if (!exists) {
        await this.identityDict.save(
          this.identityDict.create({
            code: item.code,
            name: item.name,
            sort: item.sort,
          }),
        );
      }
    }
  }

  private memberLevel(plan: string) {
    return plan === 'pro' ? 'PRO' : 'FREE';
  }

  private toLegacyUserResponse(u: User) {
    return {
      ...u,
      nick: u.nick ?? null,
      nickname: u.nick ?? null,
      avatarUrl: u.avatar ?? null,
      memberLevel: this.memberLevel(u.plan),
    };
  }

  async getById(id: string) {
    const u = await this.users.findOne({ where: { id } });
    if (!u) throw new NotFoundException('user not found');
    return this.toLegacyUserResponse(u);
  }

  async updateProfile(id: string, dto: UpdateProfileDto) {
    const u = await this.users.findOne({ where: { id } });
    if (!u) throw new NotFoundException('user not found');
    const nick = dto.nick ?? dto.nickname;
    if (nick !== undefined) {
      const v = validateNickname(nick);
      if (!v.ok) {
        throw new BadRequestException({ code: v.code, message: v.message });
      }
      u.nick = v.value;
    }
    const avatar = dto.avatarUrl ?? dto.avatar;
    if (avatar !== undefined) u.avatar = avatar;
    const saved = await this.users.save(u);
    return this.toLegacyUserResponse(saved);
  }

  async getBudget(userId: string, year?: number) {
    const y = year ?? new Date().getFullYear();
    const row = await this.budgets.findOne({ where: { userId, year: y } });
    return {
      year: y,
      amountCent: row?.amountCent ?? 0,
      updatedAt: row?.updatedAt ?? null,
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
      updatedAt: saved.updatedAt,
    };
  }

  // ─── 个人信息编辑 ─────────────────────────────────────

  async getProfile(userId: string) {
    const u = await this.users.findOne({ where: { id: userId } });
    if (!u) throw new NotFoundException('user not found');

    const identities = await this.userIdentities.find({
      where: { userId },
    });

    const tripCount = await this.journeys.count({ where: { userId } });
    const footprintCities = await this.countFootprintCities(userId);

    return {
      userId: u.id,
      nickname: u.nick ?? null,
      avatarUrl: u.avatar ?? null,
      gender: u.gender ?? 'UNKNOWN',
      birthday: u.birthday ?? null,
      provinceCode: u.provinceCode ?? null,
      cityCode: u.cityCode ?? null,
      region: formatRegion(u.provinceCode, u.cityCode),
      departureCity: u.departureCity ?? null,
      bio: u.bio ?? null,
      phoneMasked: maskPhone(u.phone),
      memberLevel: this.memberLevel(u.plan),
      identities: identities.map((i) => i.identityCode),
      stats: {
        footprintCities,
        tripCount,
      },
      updatedAt: u.updatedAt,
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

    if (dto.birthday !== undefined) {
      if (dto.birthday === null || dto.birthday === '') {
        u.birthday = undefined;
      } else {
        this.assertBirthday(dto.birthday);
        u.birthday = dto.birthday;
      }
    }

    if (dto.cityCode !== undefined || dto.provinceCode !== undefined) {
      if (dto.cityCode === null || dto.cityCode === '') {
        u.cityCode = undefined;
        u.provinceCode = undefined;
      } else {
        const cityCode = dto.cityCode!;
        const city = findCity(cityCode);
        if (!city) {
          throw new BadRequestException({
            code: '40006',
            message: '所在地编码无效',
          });
        }
        const provinceCode = dto.provinceCode ?? city.provinceCode;
        if (provinceCode !== city.provinceCode) {
          throw new BadRequestException({
            code: '40006',
            message: '省市编码不匹配',
          });
        }
        u.cityCode = city.cityCode;
        u.provinceCode = city.provinceCode;
      }
    }

    if (dto.departureCity !== undefined) {
      if (dto.departureCity === null || dto.departureCity === '') {
        u.departureCity = undefined;
      } else if (dto.departureCity.length > 64) {
        throw new BadRequestException({
          code: '40001',
          message: '常用出发地过长',
        });
      } else {
        u.departureCity = dto.departureCity;
      }
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

    if (dto.identities !== undefined) {
      await this.replaceIdentities(userId, dto.identities);
    }

    await this.users.save(u);
    const profile = await this.getProfile(userId);
    return {
      updatedAt: profile.updatedAt,
      profile,
    };
  }

  private assertBirthday(ymd: string) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
    if (!m) {
      throw new BadRequestException({
        code: '40001',
        message: '生日格式应为 YYYY-MM-DD',
      });
    }
    const y = Number(m[1]);
    const d = new Date(`${ymd}T00:00:00`);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException({
        code: '40001',
        message: '生日日期无效',
      });
    }
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    if (y < 1900 || d > today) {
      throw new BadRequestException({
        code: '40001',
        message: '生日须在 1900-01-01 至今天之间',
      });
    }
  }

  private async replaceIdentities(userId: string, codes: string[]) {
    if (codes.length > IDENTITY_MAX_SELECT) {
      throw new BadRequestException({
        code: '40005',
        message: `旅行身份最多选 ${IDENTITY_MAX_SELECT} 个`,
      });
    }
    const unique = [...new Set(codes)];
    if (unique.length) {
      const found = await this.identityDict.find({
        where: { code: In(unique) },
      });
      if (found.length !== unique.length) {
        throw new BadRequestException({
          code: '40004',
          message: '旅行身份非法',
        });
      }
    }
    await this.userIdentities.delete({ userId });
    for (const code of unique) {
      await this.userIdentities.save(
        this.userIdentities.create({ userId, identityCode: code }),
      );
    }
  }

  listIdentities() {
    return {
      maxSelect: IDENTITY_MAX_SELECT,
      options: TRAVEL_IDENTITIES.map((i) => ({
        code: i.code,
        name: i.name,
      })),
    };
  }

  listRegions() {
    return { provinces: listProvinces() };
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
