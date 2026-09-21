import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import {
  citySql,
  eligibleEntrySql,
  validLocationSql,
} from '../../common/progress-sql';
import {
  ANNUAL_BADGES,
  GlobalMetrics,
  JourneyMetrics,
  PLACE_TYPES,
} from './progress.rules';

/** 所有大表在 SQL 内聚合，仅返回每旅程一行和全局标量。 */
@Injectable()
export class ProgressMetricsService {
  async collect(manager: EntityManager, userId: string, now: string) {
    const records = `WITH valid_records AS (
      SELECT e.id, e.journeyId, e.content, ${citySql('e')} AS city,
        COALESCE(e.recordedAt, e.createdAt) AS happenedAt,
        CASE WHEN ${validLocationSql('l')} THEN 1 ELSE 0 END AS located,
        CASE WHEN ${validLocationSql('l')} THEN l.name ELSE NULL END AS placeName
      FROM entries e
      INNER JOIN journeys j ON j.id = e.journeyId AND j.userId = ?
      LEFT JOIN locations l ON l.entryId = e.id
      WHERE ${eligibleEntrySql('e', '?')}
    )`;
    const rows = await manager.query(
      `${records},
      entry_totals AS (
        SELECT journeyId, COUNT(*) AS recordCount, SUM(located) AS locatedRecordCount,
          SUM(CASE WHEN TRIM(COALESCE(content, '')) <> '' THEN 1 ELSE 0 END) AS textCount
        FROM valid_records GROUP BY journeyId
      ),
      media_totals AS (
        SELECT e.journeyId,
          SUM(m.kind IN ('image', 'photo')) AS photoCount,
          SUM(m.kind IN ('audio', 'voice')) AS voiceCount,
          SUM(CASE WHEN m.kind IN ('audio', 'voice') THEN GREATEST(COALESCE(m.durationSec, 0), 0) ELSE 0 END) AS voiceSeconds
        FROM valid_records e INNER JOIN media m ON m.ownerType = 'entry' AND m.ownerId = e.id
        WHERE m.status = 'active' AND m.deletedAt IS NULL
        GROUP BY e.journeyId
      ),
      record_days AS (
        SELECT DISTINCT journeyId, DATE(happenedAt) AS d FROM valid_records
      ),
      islands AS (
        SELECT journeyId, d,
          DATE_SUB(d, INTERVAL ROW_NUMBER() OVER (PARTITION BY journeyId ORDER BY d) DAY) AS island
        FROM record_days
      ),
      runs AS (
        SELECT journeyId, COUNT(*) AS days FROM islands GROUP BY journeyId, island
      ),
      streaks AS (
        SELECT journeyId, MAX(days) AS longestStreak FROM runs GROUP BY journeyId
      )
      SELECT (j.status IN ('finished', 'ended')) AS completed,
        COALESCE(e.recordCount, 0) AS recordCount,
        COALESCE(e.locatedRecordCount, 0) AS locatedRecordCount,
        COALESCE(e.textCount, 0) AS textCount,
        COALESCE(m.photoCount, 0) AS photoCount,
        COALESCE(m.voiceCount, 0) AS voiceCount,
        COALESCE(m.voiceSeconds, 0) AS voiceSeconds,
        (g.id IS NOT NULL) AS guideCount,
        COALESCE(s.longestStreak, 0) AS longestStreak,
        (j.status IN ('finished', 'ended') AND YEAR(j.endDate) = ?) AS annualCompleted
      FROM journeys j
      LEFT JOIN entry_totals e ON e.journeyId = j.id
      LEFT JOIN media_totals m ON m.journeyId = j.id
      LEFT JOIN streaks s ON s.journeyId = j.id
      LEFT JOIN guides g ON g.journeyId = j.id
      WHERE j.userId = ?`,
      [userId, now, ANNUAL_BADGES[0].year, userId],
    );

    const [summary] = await manager.query(
      `${records}
      SELECT COUNT(DISTINCT city) AS cityCount,
        COALESCE(SUM(TIME(happenedAt) BETWEEN '05:00:00' AND '07:30:00'), 0) AS dawnRecordCount,
        COUNT(DISTINCT CASE WHEN TIME(happenedAt) BETWEEN '05:00:00' AND '07:30:00' THEN DATE(happenedAt) END) AS dawnRecordDays,
        ${PLACE_TYPES.map(() => "COALESCE(MAX(INSTR(COALESCE(placeName, ''), ?) > 0), 0)").join(' + ')} AS placeTypeCount
      FROM valid_records`,
      [userId, now, ...PLACE_TYPES],
    );

    // 原始查询有意包含软删除及注销账号；同秒注册以稳定的 id 顺序打破平局。
    const [rank] = await manager.query(
      `SELECT COUNT(*) + 1 AS registeredRank
      FROM users u INNER JOIN users me ON me.id = ?
      WHERE u.createdAt < me.createdAt OR (u.createdAt = me.createdAt AND u.id < me.id)`,
      [userId],
    );
    const journeys: JourneyMetrics[] = rows.map(
      (row: Record<string, unknown>) =>
        Object.fromEntries(
          Object.entries(row).map(([key, value]) => [key, Number(value) || 0]),
        ) as unknown as JourneyMetrics,
    );
    const global: GlobalMetrics = {
      cityCount: Number(summary.cityCount),
      dawnRecordCount: Number(summary.dawnRecordCount),
      dawnRecordDays: Number(summary.dawnRecordDays),
      placeTypeCount: Number(summary.placeTypeCount),
      registeredRank: Number(rank.registeredRank),
    };
    return { journeys, global };
  }
}
