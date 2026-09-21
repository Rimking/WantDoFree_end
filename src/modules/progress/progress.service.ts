import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { User } from '../../entities/user.entity';
import { UserProgress } from '../../entities/user-progress.entity';
import { UserBadge } from '../../entities/user-badge.entity';
import { beijingDateTime } from '../../common/progress-sql';
import { ProgressMetricsService } from './progress.metrics';
import {
  ACTIVE_BADGE_KEYS,
  calculateGrowth,
  calculateLevel,
  evaluateBadges,
  levelOverview,
} from './progress.rules';

@Injectable()
export class ProgressService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly metrics: ProgressMetricsService,
  ) {}

  private async assertUser(manager: EntityManager, userId: string) {
    const user = await manager.findOne(User, {
      where: { id: userId, status: 'active' },
      select: ['id'],
    });
    if (!user) throw new UnauthorizedException('账号不可用');
  }

  async overview(userId: string) {
    // READ COMMITTED 避免等待行锁期间形成的旧快照覆盖较新计算结果。
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      await this.assertUser(manager, userId);
      // 插入或无操作更新都会持有唯一主键写锁，覆盖首次并发初始化。
      await manager.query(
        `INSERT INTO user_progress (userId) VALUES (?)
        ON DUPLICATE KEY UPDATE userId = VALUES(userId)`,
        [userId],
      );
      const state = await manager.findOneOrFail(UserProgress, {
        where: { userId },
        lock: { mode: 'pessimistic_write' },
      });
      const initial = state.levelReachedAt == null;
      // 与 datetime(0) 对齐，避免 MySQL 四舍五入导致首次响应与回读时间不一致。
      const now = new Date(Math.floor(Date.now() / 1000) * 1000);
      const collected = await this.metrics.collect(
        manager,
        userId,
        beijingDateTime(now),
      );
      const growth = calculateGrowth(collected.journeys, collected.global);
      const evaluations = evaluateBadges(growth.metrics);
      const existing = await manager.find(UserBadge, { where: { userId } });
      const unlocked = new Map(
        existing.map((badge) => [badge.badgeKey, badge]),
      );
      for (const evaluation of evaluations) {
        if (!evaluation.earned || unlocked.has(evaluation.key)) continue;
        const badge = await manager.save(
          UserBadge,
          manager.create(UserBadge, {
            userId,
            badgeKey: evaluation.key,
            unlockedAt: now,
          }),
        );
        unlocked.set(badge.badgeKey, badge);
      }
      const badgeCount = ACTIVE_BADGE_KEYS.filter((key) =>
        unlocked.has(key),
      ).length;
      state.xp = growth.xp;
      state.highestXp = Math.max(state.highestXp, growth.xp);
      const level = calculateLevel(state.highestXp, badgeCount, state.level);
      if (initial || level > state.level) state.levelReachedAt = now;
      state.level = level;
      // 老用户首次补算只建立基线，不制造一串历史升级弹窗。
      if (initial) state.lastAcknowledgedLevel = level;
      await manager.save(UserProgress, state);
      return {
        ...growth,
        ...levelOverview(level, state.highestXp, badgeCount),
        highestXp: state.highestXp,
        levelReachedAt: state.levelReachedAt
          ? beijingDateTime(state.levelReachedAt)
          : null,
        pendingCelebrationLevel:
          state.level > state.lastAcknowledgedLevel ? state.level : null,
        badges: evaluations.map(({ earned: _earned, ...evaluation }) => {
          const saved = unlocked.get(evaluation.key);
          return {
            ...evaluation,
            unlocked: !!saved,
            unlockedAt: saved ? beijingDateTime(saved.unlockedAt) : null,
          };
        }),
      };
    });
  }

  async acknowledge(userId: string, level: number) {
    if (!Number.isInteger(level) || level < 1 || level > 6)
      throw new BadRequestException('等级无效');
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      await this.assertUser(manager, userId);
      const state = await manager.findOne(UserProgress, {
        where: { userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!state || level > state.level)
        throw new BadRequestException('尚未达到该等级');
      state.lastAcknowledgedLevel = Math.max(
        state.lastAcknowledgedLevel,
        level,
      );
      await manager.save(UserProgress, state);
      return { acknowledgedLevel: state.lastAcknowledgedLevel };
    });
  }
}
