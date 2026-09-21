import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Schema 对齐迁移：让「仅跑迁移链的全新生产库」与「dev synchronize 出的库」结构一致。
 *
 * 背景（2026-08 审计）：dev 依赖 synchronize=true 建表，而 TS 迁移链缺 8 张表
 * （checklist_items/drafts/invite_codes/invite_records/shares/travel_identity_dict/
 * user_identities/user_stats_snapshots）、media 仍是旧的多态前结构、users/orders/
 * entries/expenses 缺列。手工 SQL（manual-media-polymorphic.sql / member-schema.sql /
 * share-schema.sql）属于带外修复，本迁移将其全部收编，此后 SQL 文件删除。
 *
 * 生成方式：空库跑完旧链后 `migration:generate` 自动 diff 实体得到，再人工修正：
 * - media 重构改为「加列 → 回填 → 删旧列」，不丢历史媒体 URL；
 * - users.nick 长度 64→12 改为截断后 MODIFY，不清空昵称；
 * - 对可能跑过手工 SQL 的库做存在性防护（幂等）。
 */

async function tableExists(qr: QueryRunner, table: string): Promise<boolean> {
  const rows: unknown[] = await qr.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`,
    [table],
  );
  return rows.length > 0;
}

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

/** 表排序规则（无表返回 null） */
async function tableCollation(qr: QueryRunner, table: string): Promise<string | null> {
  const rows: Array<{ TABLE_COLLATION: string | null }> = await qr.query(
    `SELECT TABLE_COLLATION FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table],
  );
  return rows[0]?.TABLE_COLLATION ?? null;
}

export class AlignSchemaWithEntities1787996011562 implements MigrationInterface {
    name = 'AlignSchemaWithEntities1787996011562'

    public async up(queryRunner: QueryRunner): Promise<void> {
        const q = (sql: string) => queryRunner.query(sql);
        const qg = async (sql: string, ok: boolean) => { if (ok) await q(sql); };
        const addColumn = async (table: string, ddl: string, col: string) =>
            qg(`ALTER TABLE \`${table}\` ADD \`${col}\` ${ddl}`, !(await columnExists(queryRunner, table, col)));

        // ── 0) 约束名对齐：先建实体命名的新索引（additive），再摘旧命名外键，最后删旧索引 ──
        await qg(`CREATE INDEX \`IDX_1ff87a35d91c146eb26842948d\` ON \`journeys\` (\`userId\`)`, !(await indexExists(queryRunner, 'journeys', 'IDX_1ff87a35d91c146eb26842948d')));
        await qg(`CREATE INDEX \`IDX_f862857ddf9dcac50f38c31203\` ON \`share_events\` (\`journeyId\`)`, !(await indexExists(queryRunner, 'share_events', 'IDX_f862857ddf9dcac50f38c31203')));
        await qg(`CREATE UNIQUE INDEX \`IDX_f9c91aec8b0da75c2b682b5835\` ON \`journey_plans\` (\`journeyId\`)`, !(await indexExists(queryRunner, 'journey_plans', 'IDX_f9c91aec8b0da75c2b682b5835')));
        await qg(`CREATE UNIQUE INDEX \`REL_f9c91aec8b0da75c2b682b5835\` ON \`journey_plans\` (\`journeyId\`)`, !(await indexExists(queryRunner, 'journey_plans', 'REL_f9c91aec8b0da75c2b682b5835')));
        // 旧命名外键（随后在步骤 5 以实体哈希名重建）
        await qg(`ALTER TABLE \`share_events\` DROP FOREIGN KEY \`FK_share_guide\``, await fkExists(queryRunner, 'share_events', 'FK_share_guide'));
        await qg(`ALTER TABLE \`share_events\` DROP FOREIGN KEY \`FK_share_journey\``, await fkExists(queryRunner, 'share_events', 'FK_share_journey'));
        await qg(`ALTER TABLE \`share_events\` DROP FOREIGN KEY \`FK_share_sharer\``, await fkExists(queryRunner, 'share_events', 'FK_share_sharer'));
        await qg(`ALTER TABLE \`year_budgets\` DROP FOREIGN KEY \`FK_year_budgets_user\``, await fkExists(queryRunner, 'year_budgets', 'FK_year_budgets_user'));
        await qg(`ALTER TABLE \`journey_plans\` DROP FOREIGN KEY \`FK_journey_plans_journey\``, await fkExists(queryRunner, 'journey_plans', 'FK_journey_plans_journey'));
        // 旧命名索引（新索引已就位，可安全删除）
        await qg(`DROP INDEX \`IDX_journeys_userId\` ON \`journeys\``, await indexExists(queryRunner, 'journeys', 'IDX_journeys_userId'));
        await qg(`DROP INDEX \`IDX_year_budgets_userId\` ON \`year_budgets\``, await indexExists(queryRunner, 'year_budgets', 'IDX_year_budgets_userId'));
        await qg(`DROP INDEX \`IDX_share_events_journeyId\` ON \`share_events\``, await indexExists(queryRunner, 'share_events', 'IDX_share_events_journeyId'));
        await qg(`DROP INDEX \`REL_journey_plans_journeyId\` ON \`journey_plans\``, await indexExists(queryRunner, 'journey_plans', 'REL_journey_plans_journeyId'));

        // ── 1) 字典与关联表 ──
        await q(`CREATE TABLE IF NOT EXISTS \`travel_identity_dict\` (\`code\` varchar(32) NOT NULL, \`name\` varchar(32) NOT NULL, \`sort\` int NOT NULL DEFAULT '0', PRIMARY KEY (\`code\`)) ENGINE=InnoDB`);
        await q(`CREATE TABLE IF NOT EXISTS \`user_identities\` (\`userId\` varchar(36) NOT NULL, \`identityCode\` varchar(32) NOT NULL, PRIMARY KEY (\`userId\`, \`identityCode\`)) ENGINE=InnoDB`);
        await q(`CREATE TABLE IF NOT EXISTS \`user_stats_snapshots\` (\`id\` varchar(36) NOT NULL, \`userId\` varchar(36) NOT NULL, \`date\` date NOT NULL, \`totalRecords\` int NOT NULL DEFAULT '0', \`totalDays\` int NOT NULL DEFAULT '0', \`totalPlaces\` int NOT NULL DEFAULT '0', \`streakDays\` int NOT NULL DEFAULT '0', \`totalExpense\` bigint NOT NULL DEFAULT '0', \`updatedAt\` datetime(0) NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, UNIQUE INDEX \`UQ_stats_user_date\` (\`userId\`, \`date\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await q(`CREATE TABLE IF NOT EXISTS \`shares\` (\`id\` varchar(36) NOT NULL, \`token\` varchar(32) NOT NULL, \`journeyId\` varchar(36) NOT NULL, \`guideId\` varchar(36) NULL, \`sharerId\` varchar(36) NOT NULL, \`visibility\` varchar(16) NOT NULL DEFAULT 'unlisted', \`expireAt\` datetime NULL, \`createdAt\` datetime(0) NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE INDEX \`IDX_f51f54e33eac0d4d7ada7422cf\` (\`token\`), INDEX \`IDX_dcdf2cda9752ed47dc6407e10a\` (\`journeyId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await q(`CREATE TABLE IF NOT EXISTS \`member_plans\` (\`id\` varchar(36) NOT NULL, \`code\` varchar(32) NOT NULL, \`name\` varchar(64) NOT NULL, \`priceCent\` int NOT NULL, \`periodDays\` int NOT NULL, \`autoRenew\` tinyint NOT NULL, \`originalPriceCent\` int NULL, \`firstMonthDiscountCent\` int NULL, \`tag\` varchar(32) NULL, \`sort\` int NOT NULL DEFAULT '0', \`active\` tinyint NOT NULL DEFAULT 1, \`createdAt\` datetime(0) NOT NULL DEFAULT CURRENT_TIMESTAMP, \`updatedAt\` datetime(0) NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, UNIQUE INDEX \`IDX_2e2c18c956add5659af27b6e03\` (\`code\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await q(`CREATE TABLE IF NOT EXISTS \`invite_records\` (\`id\` varchar(36) NOT NULL, \`inviterId\` varchar(36) NOT NULL, \`inviteeId\` varchar(36) NOT NULL, \`code\` varchar(16) NOT NULL, \`status\` varchar(16) NOT NULL DEFAULT 'REGISTERED', \`rewardDays\` int NOT NULL DEFAULT '0', \`rewardedAt\` datetime NULL, \`createdAt\` datetime(0) NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX \`IDX_13ab34c060d046bb315fe5594e\` (\`inviterId\`), INDEX \`IDX_787a6825df6b92e95959138619\` (\`inviteeId\`), UNIQUE INDEX \`IDX_4b46452f6205d3986bb5d7db27\` (\`inviterId\`, \`inviteeId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await q(`CREATE TABLE IF NOT EXISTS \`invite_codes\` (\`id\` varchar(36) NOT NULL, \`userId\` varchar(36) NOT NULL, \`code\` varchar(16) NOT NULL, \`bonusGranted\` tinyint NOT NULL DEFAULT 0, \`createdAt\` datetime(0) NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE INDEX \`IDX_63026e9e18216bebdc60ea02c0\` (\`userId\`), UNIQUE INDEX \`IDX_e8034125cb28e0814cd5a526c2\` (\`code\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await q(`CREATE TABLE IF NOT EXISTS \`drafts\` (\`id\` varchar(36) NOT NULL, \`userId\` varchar(36) NOT NULL, \`journeyId\` varchar(36) NULL, \`kind\` varchar(16) NOT NULL, \`payload\` json NOT NULL, \`createdAt\` datetime(0) NOT NULL DEFAULT CURRENT_TIMESTAMP, \`updatedAt\` datetime(0) NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX \`IDX_6b4e9f2a1131fc1e9c5ba6ceae\` (\`userId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await q(`CREATE TABLE IF NOT EXISTS \`checklist_items\` (\`id\` varchar(36) NOT NULL, \`journeyId\` varchar(36) NOT NULL, \`title\` varchar(60) NOT NULL, \`isDefaultChecked\` tinyint NOT NULL DEFAULT 0, \`remindBeforeDays\` int NULL, \`sortOrder\` int NOT NULL DEFAULT '0', \`isChecked\` tinyint NOT NULL DEFAULT 0, \`createdAt\` datetime(0) NOT NULL DEFAULT CURRENT_TIMESTAMP, \`updatedAt\` datetime(0) NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, \`deletedAt\` datetime NULL, INDEX \`idx_checklist_journey_deleted\` (\`journeyId\`, \`deletedAt\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);

        // ── 2) 旧表补列 ──
        await addColumn('expenses', 'varchar(255) NULL', 'note');
        await addColumn('entries', 'datetime NULL', 'recordedAt');
        await addColumn('entries', 'int NULL', 'dayIndex');
        await addColumn('entries', 'varchar(64) NULL', 'city');
        await addColumn('entries', 'datetime(0) NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'updatedAt');
        await addColumn('orders', 'varchar(32) NULL', 'planCode');
        await addColumn('orders', 'int NULL', 'periodDays');
        await addColumn('orders', 'datetime NULL', 'expireAt');
        await addColumn('orders', 'tinyint NOT NULL DEFAULT 0', 'autoRenew');
        await addColumn('orders', 'varchar(36) NULL', 'couponId');
        await addColumn('orders', 'varchar(64) NULL', 'refundId');
        await addColumn('users', 'varchar(64) NULL', 'unionid');
        await addColumn('users', 'varchar(32) NULL', 'appId');
        await addColumn('users', "varchar(12) NOT NULL DEFAULT 'user'", 'role');
        await addColumn('users', "varchar(12) NOT NULL DEFAULT 'active'", 'status');
        await addColumn('users', "varchar(16) NOT NULL DEFAULT 'UNKNOWN'", 'gender');
        await addColumn('users', 'date NULL', 'birthday');
        await addColumn('users', 'char(6) NULL', 'provinceCode');
        await addColumn('users', 'char(6) NULL', 'cityCode');
        await addColumn('users', 'varchar(64) NULL', 'departureCity');
        await addColumn('users', 'varchar(40) NULL', 'bio');
        await addColumn('users', 'varchar(64) NULL', 'phone');
        await addColumn('users', 'datetime NULL', 'memberExpireAt');
        await addColumn('users', 'tinyint NOT NULL DEFAULT 0', 'autoRenew');
        await addColumn('users', 'datetime NULL', 'memberSinceAt');
        await addColumn('users', 'datetime(0) NULL', 'deletedAt');

        // unionid 唯一索引（nullable，允许多个 NULL）
        await qg(
            `ALTER TABLE \`users\` ADD UNIQUE INDEX \`IDX_69b681c3b2de828aa15fa9cc54\` (\`unionid\`)`,
            !(await indexExists(queryRunner, 'users', 'IDX_69b681c3b2de828aa15fa9cc54')) &&
            !(await indexExists(queryRunner, 'users', 'uk_users_unionid')),
        );
        // 免费语音配额默认值对齐实体（1800 = 30 分钟）
        await q(`ALTER TABLE \`users\` CHANGE \`quotaVoiceSec\` \`quotaVoiceSec\` int NOT NULL COMMENT '免费语音配额(秒)，对应 30 分钟' DEFAULT '1800'`);

        // nick 长度对齐实体（12）：先截断超长旧数据再 MODIFY，不清空昵称
        await q(`UPDATE \`users\` SET \`nick\` = LEFT(\`nick\`, 12) WHERE CHAR_LENGTH(\`nick\`) > 12`);
        await q(`ALTER TABLE \`users\` MODIFY \`nick\` varchar(12) NULL`);

        // ── 3) media 多态重构（保数据：加列 → 回填 → 删旧列）──
        if (!(await tableExists(queryRunner, 'media'))) {
            await q(`CREATE TABLE \`media\` (\`id\` varchar(36) NOT NULL, \`ownerType\` varchar(24) NOT NULL, \`ownerId\` varchar(36) NULL, \`kind\` varchar(12) NOT NULL, \`url\` varchar(512) NOT NULL DEFAULT '', \`thumbUrl\` varchar(512) NULL, \`mime\` varchar(64) NOT NULL DEFAULT 'application/octet-stream', \`ext\` varchar(8) NULL, \`sizeBytes\` bigint NOT NULL DEFAULT '0', \`width\` int NULL, \`height\` int NULL, \`durationSec\` int NULL, \`checksum\` varchar(64) NULL, \`sortOrder\` int NOT NULL DEFAULT '0', \`status\` varchar(12) NOT NULL DEFAULT 'active', \`storageTier\` varchar(8) NOT NULL DEFAULT 'hot', \`driver\` varchar(8) NOT NULL DEFAULT 'local', \`storageKey\` varchar(255) NULL, \`createdBy\` varchar(36) NULL, \`createdAt\` datetime(0) NOT NULL DEFAULT CURRENT_TIMESTAMP, \`updatedAt\` datetime(0) NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, \`deletedAt\` datetime(0) NULL, INDEX \`idx_media_owner\` (\`ownerType\`, \`ownerId\`, \`deletedAt\`), INDEX \`idx_media_checksum\` (\`checksum\`), INDEX \`idx_media_created\` (\`createdBy\`, \`createdAt\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        } else {
            await qg(`ALTER TABLE \`media\` DROP FOREIGN KEY \`FK_b553b2a6ea6d75d0878b63241f0\``, await fkExists(queryRunner, 'media', 'FK_b553b2a6ea6d75d0878b63241f0'));
            await addColumn('media', 'varchar(24) NULL', 'ownerType');
            await addColumn('media', 'varchar(36) NULL', 'ownerId');
            await addColumn('media', 'varchar(512) NULL', 'thumbUrl');
            await addColumn('media', "varchar(64) NOT NULL DEFAULT 'application/octet-stream'", 'mime');
            await addColumn('media', 'varchar(8) NULL', 'ext');
            await addColumn('media', "bigint NOT NULL DEFAULT '0'", 'sizeBytes');
            await addColumn('media', 'int NULL', 'width');
            await addColumn('media', 'int NULL', 'height');
            await addColumn('media', 'int NULL', 'durationSec');
            await addColumn('media', 'varchar(64) NULL', 'checksum');
            await addColumn('media', "int NOT NULL DEFAULT '0'", 'sortOrder');
            await addColumn('media', "varchar(12) NOT NULL DEFAULT 'active'", 'status');
            await addColumn('media', "varchar(8) NOT NULL DEFAULT 'hot'", 'storageTier');
            await addColumn('media', "varchar(8) NOT NULL DEFAULT 'local'", 'driver');
            await addColumn('media', 'varchar(255) NULL', 'storageKey');
            await addColumn('media', 'varchar(36) NULL', 'createdBy');
            await addColumn('media', 'datetime(0) NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'updatedAt');
            await addColumn('media', 'datetime(0) NULL', 'deletedAt');

            // 回填旧结构数据（entryId 旧列存在时）：URL 必须在删列前落到新列
            if (await columnExists(queryRunner, 'media', 'entryId')) {
                await q(`UPDATE \`media\` SET
                    \`ownerType\` = 'entry',
                    \`ownerId\` = \`entryId\`,
                    \`kind\` = CASE WHEN \`kind\` IN ('voice','audio') THEN 'audio' ELSE 'image' END,
                    \`mime\` = CASE WHEN \`kind\` IN ('voice','audio') THEN 'audio/m4a' ELSE 'image/jpeg' END,
                    \`url\` = COALESCE(\`cdnUrl\`, \`url\`),
                    \`sizeBytes\` = COALESCE(\`size\`, 0),
                    \`storageTier\` = COALESCE(\`tier\`, 'hot'),
                    \`driver\` = 'local',
                    \`status\` = 'active'
                  WHERE \`entryId\` IS NOT NULL`);
            }
            // kind 规范值 image|audio；url 收敛为 varchar(512)（ModTIFY 在回填后执行）
            await q(`ALTER TABLE \`media\` MODIFY \`kind\` varchar(12) NOT NULL`);
            await q(`ALTER TABLE \`media\` MODIFY \`url\` varchar(512) NOT NULL DEFAULT ''`);

            await qg(`ALTER TABLE \`media\` DROP COLUMN \`cdnUrl\``, await columnExists(queryRunner, 'media', 'cdnUrl'));
            await qg(`ALTER TABLE \`media\` DROP COLUMN \`entryId\``, await columnExists(queryRunner, 'media', 'entryId'));
            await qg(`ALTER TABLE \`media\` DROP COLUMN \`size\``, await columnExists(queryRunner, 'media', 'size'));
            await qg(`ALTER TABLE \`media\` DROP COLUMN \`tier\``, await columnExists(queryRunner, 'media', 'tier'));

            await qg(`CREATE INDEX \`idx_media_owner\` ON \`media\` (\`ownerType\`, \`ownerId\`, \`deletedAt\`)`, !(await indexExists(queryRunner, 'media', 'idx_media_owner')));
            await qg(`CREATE INDEX \`idx_media_checksum\` ON \`media\` (\`checksum\`)`, !(await indexExists(queryRunner, 'media', 'idx_media_checksum')));
            await qg(`CREATE INDEX \`idx_media_created\` ON \`media\` (\`createdBy\`, \`createdAt\`)`, !(await indexExists(queryRunner, 'media', 'idx_media_created')));
        }

        // ownerType 收紧为 NOT NULL（回填完成后）
        await q(`ALTER TABLE \`media\` MODIFY \`ownerType\` varchar(24) NOT NULL`);

        // ── 4) 时间精度对齐实体（datetime(6) → datetime(0)）──
        await q(`ALTER TABLE \`locations\` CHANGE \`createdAt\` \`createdAt\` datetime(0) NOT NULL DEFAULT CURRENT_TIMESTAMP`);
        await q(`ALTER TABLE \`expenses\` CHANGE \`createdAt\` \`createdAt\` datetime(0) NOT NULL DEFAULT CURRENT_TIMESTAMP`);
        // idx_entries_journey_created 被 entries→journeys 外键占用：先摘外键再重建索引
        const entriesJourneyFk = 'FK_0ff33ccdfb660726981cd08bb4b';
        const hadEntriesFk = await fkExists(queryRunner, 'entries', entriesJourneyFk);
        await qg(`ALTER TABLE \`entries\` DROP FOREIGN KEY \`${entriesJourneyFk}\``, hadEntriesFk);
        await qg(`DROP INDEX \`idx_entries_journey_created\` ON \`entries\``, await indexExists(queryRunner, 'entries', 'idx_entries_journey_created'));
        await q(`ALTER TABLE \`entries\` CHANGE \`createdAt\` \`createdAt\` datetime(0) NOT NULL DEFAULT CURRENT_TIMESTAMP`);
        await q(`ALTER TABLE \`journeys\` CHANGE \`createdAt\` \`createdAt\` datetime(0) NOT NULL DEFAULT CURRENT_TIMESTAMP`);
        await q(`ALTER TABLE \`journeys\` CHANGE \`updatedAt\` \`updatedAt\` datetime(0) NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`);
        await qg(`ALTER TABLE \`orders\` ADD UNIQUE INDEX \`IDX_221e94c27106e7135995b49640\` (\`transactionId\`)`, !(await indexExists(queryRunner, 'orders', 'IDX_221e94c27106e7135995b49640')));
        await q(`ALTER TABLE \`orders\` CHANGE \`createdAt\` \`createdAt\` datetime(0) NOT NULL DEFAULT CURRENT_TIMESTAMP`);
        await q(`ALTER TABLE \`users\` CHANGE \`createdAt\` \`createdAt\` datetime(0) NOT NULL DEFAULT CURRENT_TIMESTAMP`);
        await q(`ALTER TABLE \`users\` CHANGE \`updatedAt\` \`updatedAt\` datetime(0) NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`);
        await q(`ALTER TABLE \`year_budgets\` CHANGE \`amountCent\` \`amountCent\` int NOT NULL COMMENT '年度预算(分)' DEFAULT '0'`);
        await q(`ALTER TABLE \`year_budgets\` CHANGE \`createdAt\` \`createdAt\` datetime(0) NOT NULL DEFAULT CURRENT_TIMESTAMP`);
        await q(`ALTER TABLE \`year_budgets\` CHANGE \`updatedAt\` \`updatedAt\` datetime(0) NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`);
        await q(`ALTER TABLE \`guides\` CHANGE \`createdAt\` \`createdAt\` datetime(0) NOT NULL DEFAULT CURRENT_TIMESTAMP`);
        await q(`ALTER TABLE \`share_events\` CHANGE \`guideId\` \`guideId\` varchar(36) NULL`);
        await q(`ALTER TABLE \`share_events\` CHANGE \`createdAt\` \`createdAt\` datetime(0) NOT NULL DEFAULT CURRENT_TIMESTAMP`);
        await q(`ALTER TABLE \`media\` CHANGE \`createdAt\` \`createdAt\` datetime(0) NOT NULL DEFAULT CURRENT_TIMESTAMP`);
        await qg(`ALTER TABLE \`journey_plans\` ADD UNIQUE INDEX \`IDX_f9c91aec8b0da75c2b682b5835\` (\`journeyId\`)`, !(await indexExists(queryRunner, 'journey_plans', 'IDX_f9c91aec8b0da75c2b682b5835')));
        await q(`ALTER TABLE \`journey_plans\` CHANGE \`createdAt\` \`createdAt\` datetime(0) NOT NULL DEFAULT CURRENT_TIMESTAMP`);
        await q(`ALTER TABLE \`journey_plans\` CHANGE \`updatedAt\` \`updatedAt\` datetime(0) NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`);
        await qg(`CREATE INDEX \`idx_entries_journey_day_recorded\` ON \`entries\` (\`journeyId\`, \`dayIndex\`, \`recordedAt\`)`, !(await indexExists(queryRunner, 'entries', 'idx_entries_journey_day_recorded')));
        await qg(`CREATE INDEX \`idx_entries_journey_created\` ON \`entries\` (\`journeyId\`, \`createdAt\`)`, !(await indexExists(queryRunner, 'entries', 'idx_entries_journey_created')));
        await qg(`ALTER TABLE \`entries\` ADD CONSTRAINT \`${entriesJourneyFk}\` FOREIGN KEY (\`journeyId\`) REFERENCES \`journeys\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`, hadEntriesFk);
        await qg(`CREATE INDEX \`IDX_1ff87a35d91c146eb26842948d\` ON \`journeys\` (\`userId\`)`, !(await indexExists(queryRunner, 'journeys', 'IDX_1ff87a35d91c146eb26842948d')));
        await qg(`CREATE INDEX \`IDX_f862857ddf9dcac50f38c31203\` ON \`share_events\` (\`journeyId\`)`, !(await indexExists(queryRunner, 'share_events', 'IDX_f862857ddf9dcac50f38c31203')));

        // ── 5) 外键补齐（与实体一致）──
        await qg(`ALTER TABLE \`user_identities\` ADD CONSTRAINT \`FK_084cef3785217102f222e90ea7c\` FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`, !(await fkExists(queryRunner, 'user_identities', 'FK_084cef3785217102f222e90ea7c')));
        await qg(`ALTER TABLE \`user_identities\` ADD CONSTRAINT \`FK_dce14509335b19373626b3fefc3\` FOREIGN KEY (\`identityCode\`) REFERENCES \`travel_identity_dict\`(\`code\`) ON DELETE CASCADE ON UPDATE NO ACTION`, !(await fkExists(queryRunner, 'user_identities', 'FK_dce14509335b19373626b3fefc3')));
        await qg(`ALTER TABLE \`year_budgets\` ADD CONSTRAINT \`FK_2cf2a5e150e96c59fd286f7a1b6\` FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`, !(await fkExists(queryRunner, 'year_budgets', 'FK_2cf2a5e150e96c59fd286f7a1b6')));
        await qg(`ALTER TABLE \`share_events\` ADD CONSTRAINT \`FK_f862857ddf9dcac50f38c31203e\` FOREIGN KEY (\`journeyId\`) REFERENCES \`journeys\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`, !(await fkExists(queryRunner, 'share_events', 'FK_f862857ddf9dcac50f38c31203e')));
        await qg(`ALTER TABLE \`share_events\` ADD CONSTRAINT \`FK_015d0caf73c2e4fd50eee7724a9\` FOREIGN KEY (\`guideId\`) REFERENCES \`guides\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`, !(await fkExists(queryRunner, 'share_events', 'FK_015d0caf73c2e4fd50eee7724a9')));
        await qg(`ALTER TABLE \`share_events\` ADD CONSTRAINT \`FK_37b82fa95718fb322e9b6bc99a4\` FOREIGN KEY (\`sharerId\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`, !(await fkExists(queryRunner, 'share_events', 'FK_37b82fa95718fb322e9b6bc99a4')));
        await qg(`ALTER TABLE \`journey_plans\` ADD CONSTRAINT \`FK_f9c91aec8b0da75c2b682b5835e\` FOREIGN KEY (\`journeyId\`) REFERENCES \`journeys\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`, !(await fkExists(queryRunner, 'journey_plans', 'FK_f9c91aec8b0da75c2b682b5835e')));
        await qg(`ALTER TABLE \`drafts\` ADD CONSTRAINT \`FK_6b4e9f2a1131fc1e9c5ba6ceaeb\` FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`, !(await fkExists(queryRunner, 'drafts', 'FK_6b4e9f2a1131fc1e9c5ba6ceaeb')));
        await qg(`ALTER TABLE \`checklist_items\` ADD CONSTRAINT \`FK_0d7e12327b739a3c6116ec18092\` FOREIGN KEY (\`journeyId\`) REFERENCES \`journeys\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`, !(await fkExists(queryRunner, 'checklist_items', 'FK_0d7e12327b739a3c6116ec18092')));

        // ── 6) 排序规则统一：清掉手工 SQL 引入的 utf8mb4_unicode_ci（JOIN 会报 Illegal mix）──
        for (const t of ['shares', 'share_events']) {
            if ((await tableCollation(queryRunner, t)) === 'utf8mb4_unicode_ci') {
                await q(`ALTER TABLE \`${t}\` CONVERT TO CHARACTER SET utf8mb4`);
            }
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // down 仅作应急回退；对齐迁移通常不应回滚（数据列会被丢弃）
        await queryRunner.query(`ALTER TABLE \`checklist_items\` DROP FOREIGN KEY \`FK_0d7e12327b739a3c6116ec18092\``);
        await queryRunner.query(`ALTER TABLE \`drafts\` DROP FOREIGN KEY \`FK_6b4e9f2a1131fc1e9c5ba6ceaeb\``);
        await queryRunner.query(`ALTER TABLE \`journey_plans\` DROP FOREIGN KEY \`FK_f9c91aec8b0da75c2b682b5835e\``);
        await queryRunner.query(`ALTER TABLE \`share_events\` DROP FOREIGN KEY \`FK_37b82fa95718fb322e9b6bc99a4\``);
        await queryRunner.query(`ALTER TABLE \`share_events\` DROP FOREIGN KEY \`FK_015d0caf73c2e4fd50eee7724a9\``);
        await queryRunner.query(`ALTER TABLE \`share_events\` DROP FOREIGN KEY \`FK_f862857ddf9dcac50f38c31203e\``);
        await queryRunner.query(`ALTER TABLE \`year_budgets\` DROP FOREIGN KEY \`FK_2cf2a5e150e96c59fd286f7a1b6\``);
        await queryRunner.query(`ALTER TABLE \`user_identities\` DROP FOREIGN KEY \`FK_dce14509335b19373626b3fefc3\``);
        await queryRunner.query(`ALTER TABLE \`user_identities\` DROP FOREIGN KEY \`FK_084cef3785217102f222e90ea7c\``);
        await queryRunner.query(`DROP INDEX \`REL_f9c91aec8b0da75c2b682b5835\` ON \`journey_plans\``);
        await queryRunner.query(`DROP INDEX \`idx_media_owner\` ON \`media\``);
        await queryRunner.query(`DROP INDEX \`idx_media_checksum\` ON \`media\``);
        await queryRunner.query(`DROP INDEX \`idx_media_created\` ON \`media\``);
        await queryRunner.query(`DROP INDEX \`IDX_f862857ddf9dcac50f38c31203\` ON \`share_events\``);
        await queryRunner.query(`DROP INDEX \`IDX_1ff87a35d91c146eb26842948d\` ON \`journeys\``);
        await queryRunner.query(`DROP INDEX \`idx_entries_journey_created\` ON \`entries\``);
        await queryRunner.query(`DROP INDEX \`idx_entries_journey_day_recorded\` ON \`entries\``);
        await queryRunner.query(`ALTER TABLE \`journey_plans\` DROP INDEX \`IDX_f9c91aec8b0da75c2b682b5835\``);
        await queryRunner.query(`ALTER TABLE \`share_events\` CHANGE \`guideId\` \`guideId\` varchar(36) NOT NULL`);
        await queryRunner.query(`ALTER TABLE \`orders\` DROP INDEX \`IDX_221e94c27106e7135995b49640\``);
        await queryRunner.query(`ALTER TABLE \`users\` DROP INDEX \`IDX_69b681c3b2de828aa15fa9cc54\``);
        await queryRunner.query(`DROP TABLE IF EXISTS \`checklist_items\``);
        await queryRunner.query(`DROP TABLE IF EXISTS \`drafts\``);
        await queryRunner.query(`DROP TABLE IF EXISTS \`invite_codes\``);
        await queryRunner.query(`DROP TABLE IF EXISTS \`invite_records\``);
        await queryRunner.query(`DROP TABLE IF EXISTS \`member_plans\``);
        await queryRunner.query(`DROP TABLE IF EXISTS \`shares\``);
        await queryRunner.query(`DROP TABLE IF EXISTS \`user_stats_snapshots\``);
        await queryRunner.query(`DROP TABLE IF EXISTS \`user_identities\``);
        await queryRunner.query(`DROP TABLE IF EXISTS \`travel_identity_dict\``);
    }
}
