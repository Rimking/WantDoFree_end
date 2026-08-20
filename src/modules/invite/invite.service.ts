import {
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
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
