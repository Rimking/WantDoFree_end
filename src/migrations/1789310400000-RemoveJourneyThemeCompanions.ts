import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 下线「主题（themeTags）」与「同行人（companions）」两个维度（2026-09-13）：
 * 1. journeys 表删除 themeTags / companions 两列；
 * 2. 清洗历史 JSON 残留：guides.payload.meta.themeTags、drafts.payload.themeTags。
 *
 * 幂等防护：dev 环境 synchronize=true 可能已先行删列，故用存在性检查。
 */
export class RemoveJourneyThemeCompanions1789310400000
  implements MigrationInterface
{
  name = 'RemoveJourneyThemeCompanions1789310400000';

  private async columnExists(
    qr: QueryRunner,
    table: string,
    column: string,
  ): Promise<boolean> {
    const rows: unknown[] = await qr.query(
      `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
      [table, column],
    );
    return rows.length > 0;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await this.columnExists(queryRunner, 'journeys', 'themeTags')) {
      await queryRunner.query(`ALTER TABLE journeys DROP COLUMN themeTags`);
    }
    if (await this.columnExists(queryRunner, 'journeys', 'companions')) {
      await queryRunner.query(`ALTER TABLE journeys DROP COLUMN companions`);
    }
    // 历史游记 payload 中的 meta.themeTags 残留
    await queryRunner.query(
      `UPDATE guides SET payload = JSON_REMOVE(payload, '$.meta.themeTags')
       WHERE payload IS NOT NULL AND JSON_EXTRACT(payload, '$.meta.themeTags') IS NOT NULL`,
    );
    // 历史草稿 payload 顶层的 themeTags 残留
    await queryRunner.query(
      `UPDATE drafts SET payload = JSON_REMOVE(payload, '$.themeTags')
       WHERE payload IS NOT NULL AND JSON_EXTRACT(payload, '$.themeTags') IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await this.columnExists(queryRunner, 'journeys', 'themeTags'))) {
      await queryRunner.query(
        `ALTER TABLE journeys ADD COLUMN themeTags json NULL`,
      );
    }
    if (!(await this.columnExists(queryRunner, 'journeys', 'companions'))) {
      await queryRunner.query(
        `ALTER TABLE journeys ADD COLUMN companions json NULL`,
      );
    }
  }
}
