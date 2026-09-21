import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 性别收敛（2026-09-18）：取消「保密」（UNKNOWN）——
 * 1. 存量 UNKNOWN 用户一律转为 FEMALE（默认女生）；
 * 2. users.gender 列默认值改为 FEMALE。
 *
 * 幂等防护：dev 环境 synchronize=true 可能已先行改默认值，故用存在性检查。
 */
export class GenderDefaultFemale1789600000000 implements MigrationInterface {
  name = 'GenderDefaultFemale1789600000000';

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
    await queryRunner.query(
      `UPDATE users SET gender = 'FEMALE' WHERE gender = 'UNKNOWN'`,
    );
    if (await this.columnExists(queryRunner, 'users', 'gender')) {
      await queryRunner.query(
        `ALTER TABLE users MODIFY COLUMN gender varchar(16) NOT NULL DEFAULT 'FEMALE'`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 数据不可逆（UNKNOWN 已并入 FEMALE），仅回退列默认值
    if (await this.columnExists(queryRunner, 'users', 'gender')) {
      await queryRunner.query(
        `ALTER TABLE users MODIFY COLUMN gender varchar(16) NOT NULL DEFAULT 'UNKNOWN'`,
      );
    }
  }
}
