import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { InviteCode } from '../../entities/invite-code.entity';
import { InviteRecord } from '../../entities/invite-record.entity';
import { User } from '../../entities/user.entity';
import { MemberBenefitService } from '../membership/member-benefit.service';

const PER_INVITE_DAYS = 30;
const THRESHOLD = 3;
const BONUS_DAYS = 365;

@Injectable()
export class InviteService {
  constructor(
    @InjectRepository(InviteCode)
    private readonly codes: Repository<InviteCode>,
    @InjectRepository(InviteRecord)
    private readonly records: Repository<InviteRecord>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly benefit: MemberBenefitService,
    private readonly dataSource: DataSource,
  ) {}

  private async genCode(): Promise<string> {
    for (let i = 0; i < 8; i++) {
      const code = randomBytes(4).toString('hex').slice(0, 8).toUpperCase();
      const exists = await this.codes.findOne({ where: { code } });
      if (!exists) return code;
    }
    throw new BadRequestException('invite code generation failed');
  }

  async getOrCreateCode(userId: string) {
    let row = await this.codes.findOne({ where: { userId } });
    if (!row) {
      row = await this.codes.save(
        this.codes.create({
          userId,
          code: await this.genCode(),
          bonusGranted: false,
        }),
      );
    }
    return {
      code: row.code,
      sharePath: `/pages/Invite/Invite?code=${row.code}`,
      perInviteDays: PER_INVITE_DAYS,
      threshold: THRESHOLD,
      bonusDays: BONUS_DAYS,
    };
  }

  async getStats(userId: string) {
    await this.getOrCreateCode(userId);
    const rows = await this.records.find({
      where: { inviterId: userId },
      order: { createdAt: 'DESC' },
    });
    const activated = rows.filter(
      (r) => r.status === 'ACTIVATED' || r.status === 'REWARDED',
    );
    const totalRewardDays = rows.reduce((s, r) => s + (r.rewardDays || 0), 0);
    const codeRow = await this.codes.findOne({ where: { userId } });

    const inviteeIds = rows.map((r) => r.inviteeId);
    const users =
      inviteeIds.length > 0
        ? await this.users.find({ where: { id: In(inviteeIds) } })
        : [];
    const nickMap = new Map(users.map((u) => [u.id, u.nick ?? '旅人']));

    return {
      code: codeRow?.code,
      invitedCount: activated.length,
      registeredCount: rows.length,
      threshold: THRESHOLD,
      totalRewardDays,
      bonusGranted: !!codeRow?.bonusGranted,
      nextMilestone:
        activated.length >= THRESHOLD
          ? null
          : {
              need: THRESHOLD - activated.length,
              rewardDays: BONUS_DAYS,
            },
      records: rows.map((r) => ({
        inviteeId: r.inviteeId,
        nickname: nickMap.get(r.inviteeId) ?? '旅人',
        status: r.status,
        rewardDays: r.rewardDays,
        rewardedAt: r.rewardedAt ?? null,
        createdAt: r.createdAt,
      })),
    };
  }

  /** 被邀请人绑定邀请码（须登录，一般为新用户）。 */
  async accept(userId: string, codeRaw: string) {
    const code = String(codeRaw || '')
      .trim()
      .toUpperCase();
    if (!code) throw new BadRequestException('code required');

    const inviterCode = await this.codes.findOne({ where: { code } });
    if (!inviterCode) throw new NotFoundException('invite code not found');
    if (inviterCode.userId === userId) {
      throw new BadRequestException('cannot invite yourself');
    }

    const existing = await this.records.findOne({
      where: { inviteeId: userId },
    });
    if (existing) {
      return {
        ok: true,
        alreadyBound: true,
        status: existing.status,
        inviterId: existing.inviterId,
      };
    }

    const row = await this.records.save(
      this.records.create({
        inviterId: inviterCode.userId,
        inviteeId: userId,
        code,
        status: 'REGISTERED',
        rewardDays: 0,
      }),
    );
    return {
      ok: true,
      alreadyBound: false,
      status: row.status,
      inviterId: row.inviterId,
    };
  }

  /**
   * 被邀请人首次开通会员成功后发奖：双方各 +30 天；满 3 人邀请人额外 +365。
   */
  async onInviteeActivated(inviteeId: string) {
    const record = await this.records.findOne({
      where: { inviteeId },
    });
    if (!record) return { rewarded: false };
    if (record.status === 'REWARDED') return { rewarded: false, already: true };

    return this.dataSource.transaction(async (manager) => {
      const rec = await manager.findOne(InviteRecord, {
        where: { id: record.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!rec || rec.status === 'REWARDED') {
        return { rewarded: false, already: true };
      }

      const invitee = await manager.findOne(User, {
        where: { id: inviteeId },
        lock: { mode: 'pessimistic_write' },
      });
      const inviter = await manager.findOne(User, {
        where: { id: rec.inviterId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!invitee || !inviter) return { rewarded: false };

      this.benefit.extendMembershipDays(invitee, PER_INVITE_DAYS);
      this.benefit.extendMembershipDays(inviter, PER_INVITE_DAYS);
      await manager.save(invitee);
      await manager.save(inviter);

      rec.status = 'REWARDED';
      rec.rewardDays = PER_INVITE_DAYS;
      rec.rewardedAt = new Date();
      await manager.save(rec);

      const rewardedCount = await manager.count(InviteRecord, {
        where: { inviterId: rec.inviterId, status: 'REWARDED' },
      });
      const codeRow = await manager.findOne(InviteCode, {
        where: { userId: rec.inviterId },
        lock: { mode: 'pessimistic_write' },
      });
      let bonusGranted = false;
      if (
        codeRow &&
        !codeRow.bonusGranted &&
        rewardedCount >= THRESHOLD
      ) {
        this.benefit.extendMembershipDays(inviter, BONUS_DAYS);
        await manager.save(inviter);
        codeRow.bonusGranted = true;
        await manager.save(codeRow);
        bonusGranted = true;
      }

      return {
        rewarded: true,
        rewardDays: PER_INVITE_DAYS,
        bonusGranted,
        bonusDays: bonusGranted ? BONUS_DAYS : 0,
      };
    });
  }
}
