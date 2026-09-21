import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class AddUserProgress1790000000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    const users = await queryRunner.getTable('users');
    const userId = users?.findColumnByName('id');
    const reference = {
      type: 'varchar',
      length: '36',
      charset: userId?.charset,
      collation: userId?.collation,
    };
    if (!(await queryRunner.hasTable('user_progress'))) {
      await queryRunner.createTable(
        new Table({
          name: 'user_progress',
          columns: [
            { name: 'userId', ...reference, isPrimary: true },
            { name: 'xp', type: 'int', unsigned: true, default: '0' },
            { name: 'highestXp', type: 'int', unsigned: true, default: '0' },
            { name: 'level', type: 'tinyint', unsigned: true, default: '1' },
            {
              name: 'levelReachedAt',
              type: 'datetime',
              precision: 0,
              isNullable: true,
            },
            {
              name: 'lastAcknowledgedLevel',
              type: 'tinyint',
              unsigned: true,
              default: '1',
            },
            {
              name: 'updatedAt',
              type: 'datetime',
              precision: 0,
              default: 'CURRENT_TIMESTAMP',
              onUpdate: 'CURRENT_TIMESTAMP',
            },
          ],
          foreignKeys: [
            new TableForeignKey({
              name: 'FK_user_progress_user',
              columnNames: ['userId'],
              referencedTableName: 'users',
              referencedColumnNames: ['id'],
              onDelete: 'CASCADE',
            }),
          ],
        }),
      );
    }
    if (!(await queryRunner.hasTable('user_badges'))) {
      await queryRunner.createTable(
        new Table({
          name: 'user_badges',
          columns: [
            { name: 'id', ...reference, isPrimary: true },
            { name: 'userId', ...reference },
            { name: 'badgeKey', type: 'varchar', length: '64' },
            { name: 'unlockedAt', type: 'datetime', precision: 0 },
          ],
          indices: [
            new TableIndex({
              name: 'UQ_user_badges_user_key',
              columnNames: ['userId', 'badgeKey'],
              isUnique: true,
            }),
          ],
          foreignKeys: [
            new TableForeignKey({
              name: 'FK_user_badges_user',
              columnNames: ['userId'],
              referencedTableName: 'users',
              referencedColumnNames: ['id'],
              onDelete: 'CASCADE',
            }),
          ],
        }),
      );
    }
    if (
      !users?.indices.some((index) => index.name === 'idx_users_created_id')
    ) {
      await queryRunner.createIndex(
        'users',
        new TableIndex({
          name: 'idx_users_created_id',
          columnNames: ['createdAt', 'id'],
        }),
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // 仅在明确执行回滚时删除成长数据，部署流程不自动调用 down。
    await queryRunner.dropTable('user_badges', true);
    await queryRunner.dropTable('user_progress', true);
    const users = await queryRunner.getTable('users');
    if (users?.indices.some((index) => index.name === 'idx_users_created_id')) {
      await queryRunner.dropIndex('users', 'idx_users_created_id');
    }
  }
}
