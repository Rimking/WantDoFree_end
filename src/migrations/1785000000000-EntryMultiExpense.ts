import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 一条 entry 支持多笔花费：去掉 expenses.entryId 唯一约束，增加 sortOrder。
 * 所有 DDL 均先做存在性检查——禁止 .catch(() => undefined) 吞错：
 * 真实失败（如外键创建失败）会让 schema 处于半更新状态且被标记为已执行。
 */

async function columnExists(qr: QueryRunner, table: string, column: string): Promise<boolean> {
  const rows: unknown[] = await qr.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
    [table, column],
  );
  return rows.length > 0;
}

async function indexExists(qr: QueryRunner, table: string, index: string): Promise<boolean> {
  const rows: unknown[] = await qr.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1`,
    [table, index],
  );
  return rows.length > 0;
}

async function fkExists(qr: QueryRunner, table: string, fk: string): Promise<boolean> {
  const rows: unknown[] = await qr.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? AND CONSTRAINT_TYPE = 'FOREIGN KEY' LIMIT 1`,
    [table, fk],
  );
  return rows.length > 0;
}

const FK_EXPENSES_ENTRY = 'FK_8ab147dcec01f2f3af13766f919';

export class EntryMultiExpense1785000000000 implements MigrationInterface {
  name = 'EntryMultiExpense1785000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await fkExists(queryRunner, 'expenses', FK_EXPENSES_ENTRY)) {
      await queryRunner.query(
        `ALTER TABLE \`expenses\` DROP FOREIGN KEY \`${FK_EXPENSES_ENTRY}\``,
      );
    }

    // TypeORM OneToOne 可能生成 REL_ / IDX_ 两种唯一索引名
    for (const idx of [
      'REL_8ab147dcec01f2f3af13766f91',
      'IDX_8ab147dcec01f2f3af13766f91',
      'UQ_expenses_entryId',
    ]) {
      if (await indexExists(queryRunner, 'expenses', idx)) {
        await queryRunner.query(`DROP INDEX \`${idx}\` ON \`expenses\``);
      }
    }

    if (!(await columnExists(queryRunner, 'expenses', 'sortOrder'))) {
      await queryRunner.query(
        `ALTER TABLE \`expenses\` ADD COLUMN \`sortOrder\` int NOT NULL DEFAULT 0`,
      );
    }

    if (!(await indexExists(queryRunner, 'expenses', 'idx_expenses_entry'))) {
      await queryRunner.query(
        `CREATE INDEX \`idx_expenses_entry\` ON \`expenses\` (\`entryId\`)`,
      );
    }

    if (!(await fkExists(queryRunner, 'expenses', FK_EXPENSES_ENTRY))) {
      await queryRunner.query(
        `ALTER TABLE \`expenses\` ADD CONSTRAINT \`${FK_EXPENSES_ENTRY}\` FOREIGN KEY (\`entryId\`) REFERENCES \`entries\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 回滚前需保证每 entry 至多一行；此处不强制清理
    if (await fkExists(queryRunner, 'expenses', FK_EXPENSES_ENTRY)) {
      await queryRunner.query(
        `ALTER TABLE \`expenses\` DROP FOREIGN KEY \`${FK_EXPENSES_ENTRY}\``,
      );
    }
    if (await indexExists(queryRunner, 'expenses', 'idx_expenses_entry')) {
      await queryRunner.query(`DROP INDEX \`idx_expenses_entry\` ON \`expenses\``);
    }
    if (!(await indexExists(queryRunner, 'expenses', 'IDX_8ab147dcec01f2f3af13766f91'))) {
      await queryRunner.query(
        `CREATE UNIQUE INDEX \`IDX_8ab147dcec01f2f3af13766f91\` ON \`expenses\` (\`entryId\`)`,
      );
    }
    if (!(await fkExists(queryRunner, 'expenses', FK_EXPENSES_ENTRY))) {
      await queryRunner.query(
        `ALTER TABLE \`expenses\` ADD CONSTRAINT \`${FK_EXPENSES_ENTRY}\` FOREIGN KEY (\`entryId\`) REFERENCES \`entries\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
      );
    }
  }
}
