import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { User } from '../../entities/user.entity';

export type QuotaKind = 'photo' | 'voice';

const QUOTA_COLS: Record<QuotaKind, { used: string; quota: string; label: string }> = {
  photo: { used: 'usedPhoto', quota: 'quotaPhoto', label: '照片' },
  voice: { used: 'usedVoiceSec', quota: 'quotaVoiceSec', label: '语音' },
};

@Injectable()
export class QuotaService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  /**
   * 原子消费配额：单条 UPDATE 同时完成校验与扣减
   * （`UPDATE users SET used = used + n WHERE id = ? AND used + n <= quota`）。
   * 旧实现「读→内存自增→save」在并发上传时互相覆盖、且检查与扣减分离存在
   * TOCTOU 窗口。传入 manager 时纳入调用方事务——随业务一起回滚，
   * 杜绝「事务回滚了、配额却被白扣」。返回 false = 配额不足。
   */
  async tryConsume(
    userId: string,
    kind: QuotaKind,
    amount: number,
    manager?: EntityManager,
  ): Promise<boolean> {
    const n = Math.max(0, Math.floor(Number(amount) || 0));
    if (n === 0) return true;
    const { used, quota } = QUOTA_COLS[kind];
    const result = await (manager ?? this.users.manager)
      .createQueryBuilder()
      .update(User)
      .set({ [used]: () => `\`${used}\` + ${n}` })
      .where(`\`id\` = :id AND \`${used}\` + ${n} <= \`${quota}\``, { id: userId })
      .execute();
    return (result.affected ?? 0) > 0;
  }

  /** tryConsume 的抛错包装：用户不存在抛 404，配额不足抛业务码 QUOTA_EXCEEDED。 */
  async consumeOrFail(
    userId: string,
    kind: QuotaKind,
    amount: number,
    manager?: EntityManager,
  ): Promise<void> {
    const ok = await this.tryConsume(userId, kind, amount, manager);
    if (ok) return;
    const exists = await (manager ?? this.users.manager)
      .getRepository(User)
      .findOne({ where: { id: userId }, select: ['id'] });
    if (!exists) throw new NotFoundException('user not found');
    const { label } = QUOTA_COLS[kind];
    throw new BadRequestException({
      code: 'QUOTA_EXCEEDED',
      message: `${label}配额已用尽，升级会员可扩容`,
    });
  }

  /**
   * 归还配额（删除媒体/移除附件时调用）。GREATEST 防御性下限 0，
   * 避免重复归还把 used 减成负数。建议传入 manager 纳入删除事务。
   */
  async release(
    userId: string,
    kind: QuotaKind,
    amount: number,
    manager?: EntityManager,
  ): Promise<void> {
    const n = Math.max(0, Math.floor(Number(amount) || 0));
    if (n === 0) return;
    const { used } = QUOTA_COLS[kind];
    await (manager ?? this.users.manager)
      .createQueryBuilder()
      .update(User)
      .set({ [used]: () => `GREATEST(0, \`${used}\` - ${n})` })
      .where('`id` = :id', { id: userId })
      .execute();
  }

  /** 只读校验（不扣减）；扣减请用 tryConsume/consumeOrFail。 */
  async assertWithin(userId: string, kind: QuotaKind, n = 1): Promise<void> {
    const u = await this.users.findOne({ where: { id: userId } });
    if (!u) throw new NotFoundException('user not found');
    const { used, quota, label } = QUOTA_COLS[kind];
    if (u[used] + n > u[quota]) {
      throw new BadRequestException({
        code: 'QUOTA_EXCEEDED',
        message: `${label}配额已用尽，升级会员可扩容`,
      });
    }
  }
}
