import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 前端联调对齐：origin / destination 可选 / 状态枚举 /
 * journey_plans / year_budgets / clientId
 */
export class FrontendAlign1784800000000 implements MigrationInterface {
  name = 'FrontendAlign1784800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE journeys SET status='planned' WHERE status='planning'`,
    );
    await queryRunner.query(
      `UPDATE journeys SET status='finished' WHERE status='ended'`,
    );
    await queryRunner.query(
      `ALTER TABLE journeys ALTER status SET DEFAULT 'planned'`,
    );

    await queryRunner.query(
      `ALTER TABLE journeys ADD COLUMN origin varchar(128) NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE journeys MODIFY destination varchar(128) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE journeys ADD COLUMN clientId varchar(64) NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX UQ_journeys_user_client ON journeys (userId, clientId)`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS journey_plans (
        id varchar(36) NOT NULL,
        journeyId varchar(36) NOT NULL,
        places json NOT NULL,
        checks json NOT NULL,
        budgetEstimate int NOT NULL DEFAULT 0,
        createdAt datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updatedAt datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        UNIQUE INDEX REL_journey_plans_journeyId (journeyId),
        PRIMARY KEY (id),
        CONSTRAINT FK_journey_plans_journey FOREIGN KEY (journeyId) REFERENCES journeys(id) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS year_budgets (
        id varchar(36) NOT NULL,
        userId varchar(36) NOT NULL,
        year int NOT NULL,
        amountCent int NOT NULL DEFAULT 0,
        createdAt datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updatedAt datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        UNIQUE INDEX UQ_year_budgets_user_year (userId, year),
        INDEX IDX_year_budgets_userId (userId),
        PRIMARY KEY (id),
        CONSTRAINT FK_year_budgets_user FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS year_budgets`);
    await queryRunner.query(`DROP TABLE IF EXISTS journey_plans`);
    await queryRunner.query(
      `DROP INDEX UQ_journeys_user_client ON journeys`,
    );
    await queryRunner.query(`ALTER TABLE journeys DROP COLUMN clientId`);
    await queryRunner.query(`ALTER TABLE journeys DROP COLUMN origin`);
    await queryRunner.query(
      `UPDATE journeys SET status='planning' WHERE status='planned'`,
    );
    await queryRunner.query(
      `UPDATE journeys SET status='ended' WHERE status='finished'`,
    );
  }
}
