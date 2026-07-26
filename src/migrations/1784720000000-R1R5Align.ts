import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * R1/R5 规划对齐：journeys 扩展字段与 status=planning；
 * guides 落地 payload；share_events 完整归因字段。
 */
export class R1R5Align1784720000000 implements MigrationInterface {
  name = 'R1R5Align1784720000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // journeys
    await queryRunner.query(
      `UPDATE journeys SET status='planning' WHERE status='planned'`,
    );
    await queryRunner.query(
      `ALTER TABLE journeys ALTER status SET DEFAULT 'planning'`,
    );
    await queryRunner.query(
      `UPDATE journeys SET destination=COALESCE(destination,'未填写') WHERE destination IS NULL`,
    );
    await queryRunner.query(
      `UPDATE journeys SET startDate=CURDATE() WHERE startDate IS NULL`,
    );
    await queryRunner.query(
      `UPDATE journeys SET endDate=CURDATE() WHERE endDate IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE journeys MODIFY destination varchar(128) NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE journeys MODIFY startDate date NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE journeys MODIFY endDate date NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE journeys ADD COLUMN themeTags json NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE journeys ADD COLUMN companions json NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE journeys ADD COLUMN budgetAmount int NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE journeys ADD COLUMN isPublic tinyint NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE journeys ADD COLUMN syncVersion int NOT NULL DEFAULT 1`,
    );
    await queryRunner.query(
      `CREATE INDEX IDX_journeys_userId ON journeys (userId)`,
    );

    // guides
    await queryRunner.query(
      `ALTER TABLE guides ADD COLUMN template varchar(32) NOT NULL DEFAULT 'basic'`,
    );
    await queryRunner.query(`ALTER TABLE guides ADD COLUMN payload json NULL`);
    await queryRunner.query(`ALTER TABLE guides ADD COLUMN coverUrl text NULL`);
    await queryRunner.query(
      `ALTER TABLE guides ADD COLUMN isFavorited tinyint NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `UPDATE guides SET coverUrl = posterUrl WHERE posterUrl IS NOT NULL`,
    );
    await queryRunner.query(`ALTER TABLE guides DROP COLUMN posterUrl`);

    // share_events：重建以对齐 NOT NULL 新列（开发库数据量小）
    await queryRunner.query(`DROP TABLE IF EXISTS share_events`);
    await queryRunner.query(`
      CREATE TABLE share_events (
        id varchar(36) NOT NULL,
        journeyId varchar(36) NOT NULL,
        guideId varchar(36) NOT NULL,
        channel varchar(16) NOT NULL,
        sharerId varchar(36) NOT NULL,
        viewerId varchar(36) NULL,
        createdAt datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        INDEX IDX_share_events_journeyId (journeyId),
        PRIMARY KEY (id),
        CONSTRAINT FK_share_guide FOREIGN KEY (guideId) REFERENCES guides(id) ON DELETE CASCADE,
        CONSTRAINT FK_share_journey FOREIGN KEY (journeyId) REFERENCES journeys(id) ON DELETE CASCADE,
        CONSTRAINT FK_share_sharer FOREIGN KEY (sharerId) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS share_events`);
    await queryRunner.query(`
      CREATE TABLE share_events (
        id varchar(36) NOT NULL,
        guideId varchar(36) NOT NULL,
        channel varchar(16) NOT NULL,
        createdAt datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id)
      ) ENGINE=InnoDB
    `);
    await queryRunner.query(
      `ALTER TABLE guides ADD COLUMN posterUrl text NULL`,
    );
    await queryRunner.query(
      `UPDATE guides SET posterUrl = coverUrl WHERE coverUrl IS NOT NULL`,
    );
    await queryRunner.query(`ALTER TABLE guides DROP COLUMN isFavorited`);
    await queryRunner.query(`ALTER TABLE guides DROP COLUMN coverUrl`);
    await queryRunner.query(`ALTER TABLE guides DROP COLUMN payload`);
    await queryRunner.query(`ALTER TABLE guides DROP COLUMN template`);
    await queryRunner.query(`ALTER TABLE journeys DROP COLUMN syncVersion`);
    await queryRunner.query(`ALTER TABLE journeys DROP COLUMN isPublic`);
    await queryRunner.query(`ALTER TABLE journeys DROP COLUMN budgetAmount`);
    await queryRunner.query(`ALTER TABLE journeys DROP COLUMN companions`);
    await queryRunner.query(`ALTER TABLE journeys DROP COLUMN themeTags`);
    await queryRunner.query(
      `UPDATE journeys SET status='planned' WHERE status='planning'`,
    );
  }
}
