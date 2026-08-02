import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 一条 entry 支持多笔花费：去掉 expenses.entryId 唯一约束，增加 sortOrder。
 */
export class EntryMultiExpense1785000000000 implements MigrationInterface {
  name = 'EntryMultiExpense1785000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`expenses\` DROP FOREIGN KEY \`FK_8ab147dcec01f2f3af13766f919\``,
    ).catch(() => undefined);

    // TypeORM OneToOne 可能生成 REL_ / IDX_ 两种唯一索引名
    for (const idx of [
      'REL_8ab147dcec01f2f3af13766f91',
      'IDX_8ab147dcec01f2f3af13766f91',
      'UQ_expenses_entryId',
    ]) {
      await queryRunner
        .query(`DROP INDEX \`${idx}\` ON \`expenses\``)
        .catch(() => undefined);
    }

    const cols: Array<{ COLUMN_NAME: string }> = await queryRunner.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'expenses' AND COLUMN_NAME = 'sortOrder'`,
    );
    if (!cols.length) {
      await queryRunner.query(
        `ALTER TABLE \`expenses\` ADD COLUMN \`sortOrder\` int NOT NULL DEFAULT 0`,
      );
    }

    await queryRunner
      .query(`CREATE INDEX \`idx_expenses_entry\` ON \`expenses\` (\`entryId\`)`)
      .catch(() => undefined);

    await queryRunner
      .query(
        `ALTER TABLE \`expenses\` ADD CONSTRAINT \`FK_8ab147dcec01f2f3af13766f919\` FOREIGN KEY (\`entryId\`) REFERENCES \`entries\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
      )
      .catch(() => undefined);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner
      .query(
        `ALTER TABLE \`expenses\` DROP FOREIGN KEY \`FK_8ab147dcec01f2f3af13766f919\``,
      )
      .catch(() => undefined);
    await queryRunner
      .query(`DROP INDEX \`idx_expenses_entry\` ON \`expenses\``)
      .catch(() => undefined);
    // 回滚前需保证每 entry 至多一行；此处不强制清理
    await queryRunner.query(
      `CREATE UNIQUE INDEX \`IDX_8ab147dcec01f2f3af13766f91\` ON \`expenses\` (\`entryId\`)`,
    );
    await queryRunner.query(
      `ALTER TABLE \`expenses\` ADD CONSTRAINT \`FK_8ab147dcec01f2f3af13766f919\` FOREIGN KEY (\`entryId\`) REFERENCES \`entries\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }
}
