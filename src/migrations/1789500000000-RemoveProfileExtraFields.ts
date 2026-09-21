import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 下线「生日 / 所在地 / 旅行身份 / 常用出发地」四项资料（2026-09-17）：
 * 1. users 表删除 birthday / provinceCode / cityCode / departureCity 四列；
 * 2. 删除旅行身份相关表 user_identities、travel_identity_dict。
 *
 * 幂等防护：dev 环境 synchronize=true 可能已先行删列，故用存在性检查。
 */
export class RemoveProfileExtraFields1789500000000
  implements MigrationInterface
{
  name = 'RemoveProfileExtraFields1789500000000';

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

  private async tableExists(qr: QueryRunner, table: string): Promise<boolean> {
    const rows: unknown[] = await qr.query(
      `SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`,
      [table],
    );
    return rows.length > 0;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await this.tableExists(queryRunner, 'user_identities')) {
      await queryRunner.query(`DROP TABLE user_identities`);
    }
    if (await this.tableExists(queryRunner, 'travel_identity_dict')) {
      await queryRunner.query(`DROP TABLE travel_identity_dict`);
    }
    if (await this.columnExists(queryRunner, 'users', 'birthday')) {
      await queryRunner.query(`ALTER TABLE users DROP COLUMN birthday`);
    }
    if (await this.columnExists(queryRunner, 'users', 'provinceCode')) {
      await queryRunner.query(`ALTER TABLE users DROP COLUMN provinceCode`);
    }
    if (await this.columnExists(queryRunner, 'users', 'cityCode')) {
      await queryRunner.query(`ALTER TABLE users DROP COLUMN cityCode`);
    }
    if (await this.columnExists(queryRunner, 'users', 'departureCity')) {
      await queryRunner.query(`ALTER TABLE users DROP COLUMN departureCity`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await this.columnExists(queryRunner, 'users', 'birthday'))) {
      await queryRunner.query(`ALTER TABLE users ADD COLUMN birthday date NULL`);
    }
    if (!(await this.columnExists(queryRunner, 'users', 'provinceCode'))) {
      await queryRunner.query(
        `ALTER TABLE users ADD COLUMN provinceCode char(6) NULL`,
      );
    }
    if (!(await this.columnExists(queryRunner, 'users', 'cityCode'))) {
      await queryRunner.query(
        `ALTER TABLE users ADD COLUMN cityCode char(6) NULL`,
      );
    }
    if (!(await this.columnExists(queryRunner, 'users', 'departureCity'))) {
      await queryRunner.query(
        `ALTER TABLE users ADD COLUMN departureCity varchar(64) NULL`,
      );
    }
    if (!(await this.tableExists(queryRunner, 'travel_identity_dict'))) {
      await queryRunner.query(
        `CREATE TABLE travel_identity_dict (` +
          '`code` varchar(32) NOT NULL, `name` varchar(32) NOT NULL, ' +
          "`sort` int NOT NULL DEFAULT '0', PRIMARY KEY (`code`)) ENGINE=InnoDB",
      );
    }
    if (!(await this.tableExists(queryRunner, 'user_identities'))) {
      await queryRunner.query(
        `CREATE TABLE user_identities (` +
          '`userId` varchar(36) NOT NULL, `identityCode` varchar(32) NOT NULL, ' +
          'PRIMARY KEY (`userId`, `identityCode`)) ENGINE=InnoDB',
      );
    }
  }
}
