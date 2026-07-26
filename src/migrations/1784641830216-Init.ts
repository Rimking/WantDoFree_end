import { MigrationInterface, QueryRunner } from "typeorm";

export class Init1784641830216 implements MigrationInterface {
    name = 'Init1784641830216'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE \`media\` (\`id\` varchar(36) NOT NULL, \`entryId\` varchar(36) NOT NULL, \`kind\` varchar(16) NOT NULL, \`url\` text NOT NULL, \`cdnUrl\` text NULL, \`size\` int NOT NULL DEFAULT '0', \`tier\` varchar(16) NOT NULL DEFAULT 'hot', \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`locations\` (\`id\` varchar(36) NOT NULL, \`entryId\` varchar(36) NOT NULL, \`lat\` double NOT NULL, \`lng\` double NOT NULL, \`name\` varchar(255) NULL, \`encryptedPoly\` text NULL COMMENT '密文(PIPL)', \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), UNIQUE INDEX \`IDX_f3566133c68370d386f8a412f8\` (\`entryId\`), UNIQUE INDEX \`REL_f3566133c68370d386f8a412f8\` (\`entryId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`expenses\` (\`id\` varchar(36) NOT NULL, \`entryId\` varchar(36) NOT NULL, \`amountCent\` int NOT NULL COMMENT '金额(分)', \`currency\` varchar(8) NOT NULL DEFAULT 'CNY', \`category\` varchar(16) NOT NULL DEFAULT 'other', \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), UNIQUE INDEX \`IDX_8ab147dcec01f2f3af13766f91\` (\`entryId\`), UNIQUE INDEX \`REL_8ab147dcec01f2f3af13766f91\` (\`entryId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`entries\` (\`id\` varchar(36) NOT NULL, \`journeyId\` varchar(36) NOT NULL, \`type\` varchar(16) NOT NULL, \`content\` text NULL, \`clientId\` varchar(64) NOT NULL COMMENT '离线幂等键(clientId)', \`syncVersion\` int NOT NULL DEFAULT '1', \`status\` varchar(16) NOT NULL DEFAULT 'synced', \`payload\` json NULL COMMENT '灵活字段', \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`idx_entries_journey_created\` (\`journeyId\`, \`createdAt\`), UNIQUE INDEX \`IDX_61ca7613f00652075b11e768f1\` (\`clientId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`journeys\` (\`id\` varchar(36) NOT NULL, \`userId\` varchar(36) NOT NULL, \`title\` varchar(128) NOT NULL, \`destination\` varchar(128) NULL, \`startDate\` date NULL, \`endDate\` date NULL, \`status\` varchar(16) NOT NULL DEFAULT 'planned', \`cover\` varchar(512) NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`orders\` (\`id\` varchar(36) NOT NULL, \`userId\` varchar(36) NOT NULL, \`product\` varchar(32) NOT NULL, \`amountCent\` int NOT NULL, \`status\` varchar(16) NOT NULL DEFAULT 'pending', \`transactionId\` varchar(64) NULL, \`paidAt\` datetime NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`users\` (\`id\` varchar(36) NOT NULL, \`openid\` varchar(64) NOT NULL, \`nick\` varchar(64) NULL, \`avatar\` varchar(512) NULL, \`plan\` varchar(16) NOT NULL DEFAULT 'free', \`quotaPhoto\` int NOT NULL COMMENT '免费照片配额(张)' DEFAULT '50', \`quotaVoiceSec\` int NOT NULL COMMENT '免费语音配额(秒)' DEFAULT '3600', \`usedPhoto\` int NOT NULL COMMENT '已用照片数' DEFAULT '0', \`usedVoiceSec\` int NOT NULL COMMENT '已用语音秒数' DEFAULT '0', \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX \`IDX_9c98f005249412c8333a3b2c59\` (\`openid\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`guides\` (\`id\` varchar(36) NOT NULL, \`journeyId\` varchar(36) NOT NULL, \`posterUrl\` text NULL, \`totalCost\` int NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), UNIQUE INDEX \`IDX_24cddcac4076181d8ed9b5f295\` (\`journeyId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`share_events\` (\`id\` varchar(36) NOT NULL, \`guideId\` varchar(36) NOT NULL, \`channel\` varchar(16) NOT NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`ALTER TABLE \`media\` ADD CONSTRAINT \`FK_b553b2a6ea6d75d0878b63241f0\` FOREIGN KEY (\`entryId\`) REFERENCES \`entries\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`locations\` ADD CONSTRAINT \`FK_f3566133c68370d386f8a412f87\` FOREIGN KEY (\`entryId\`) REFERENCES \`entries\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`expenses\` ADD CONSTRAINT \`FK_8ab147dcec01f2f3af13766f919\` FOREIGN KEY (\`entryId\`) REFERENCES \`entries\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`entries\` ADD CONSTRAINT \`FK_0ff33ccdfb660726981cd08bb4b\` FOREIGN KEY (\`journeyId\`) REFERENCES \`journeys\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`journeys\` ADD CONSTRAINT \`FK_1ff87a35d91c146eb26842948d0\` FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`orders\` ADD CONSTRAINT \`FK_151b79a83ba240b0cb31b2302d1\` FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`guides\` ADD CONSTRAINT \`FK_24cddcac4076181d8ed9b5f2953\` FOREIGN KEY (\`journeyId\`) REFERENCES \`journeys\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`share_events\` ADD CONSTRAINT \`FK_015d0caf73c2e4fd50eee7724a9\` FOREIGN KEY (\`guideId\`) REFERENCES \`guides\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`share_events\` DROP FOREIGN KEY \`FK_015d0caf73c2e4fd50eee7724a9\``);
        await queryRunner.query(`ALTER TABLE \`guides\` DROP FOREIGN KEY \`FK_24cddcac4076181d8ed9b5f2953\``);
        await queryRunner.query(`ALTER TABLE \`orders\` DROP FOREIGN KEY \`FK_151b79a83ba240b0cb31b2302d1\``);
        await queryRunner.query(`ALTER TABLE \`journeys\` DROP FOREIGN KEY \`FK_1ff87a35d91c146eb26842948d0\``);
        await queryRunner.query(`ALTER TABLE \`entries\` DROP FOREIGN KEY \`FK_0ff33ccdfb660726981cd08bb4b\``);
        await queryRunner.query(`ALTER TABLE \`expenses\` DROP FOREIGN KEY \`FK_8ab147dcec01f2f3af13766f919\``);
        await queryRunner.query(`ALTER TABLE \`locations\` DROP FOREIGN KEY \`FK_f3566133c68370d386f8a412f87\``);
        await queryRunner.query(`ALTER TABLE \`media\` DROP FOREIGN KEY \`FK_b553b2a6ea6d75d0878b63241f0\``);
        await queryRunner.query(`DROP TABLE \`share_events\``);
        await queryRunner.query(`DROP INDEX \`IDX_24cddcac4076181d8ed9b5f295\` ON \`guides\``);
        await queryRunner.query(`DROP TABLE \`guides\``);
        await queryRunner.query(`DROP INDEX \`IDX_9c98f005249412c8333a3b2c59\` ON \`users\``);
        await queryRunner.query(`DROP TABLE \`users\``);
        await queryRunner.query(`DROP TABLE \`orders\``);
        await queryRunner.query(`DROP TABLE \`journeys\``);
        await queryRunner.query(`DROP INDEX \`IDX_61ca7613f00652075b11e768f1\` ON \`entries\``);
        await queryRunner.query(`DROP INDEX \`idx_entries_journey_created\` ON \`entries\``);
        await queryRunner.query(`DROP TABLE \`entries\``);
        await queryRunner.query(`DROP INDEX \`REL_8ab147dcec01f2f3af13766f91\` ON \`expenses\``);
        await queryRunner.query(`DROP INDEX \`IDX_8ab147dcec01f2f3af13766f91\` ON \`expenses\``);
        await queryRunner.query(`DROP TABLE \`expenses\``);
        await queryRunner.query(`DROP INDEX \`REL_f3566133c68370d386f8a412f8\` ON \`locations\``);
        await queryRunner.query(`DROP INDEX \`IDX_f3566133c68370d386f8a412f8\` ON \`locations\``);
        await queryRunner.query(`DROP TABLE \`locations\``);
        await queryRunner.query(`DROP TABLE \`media\``);
    }

}
