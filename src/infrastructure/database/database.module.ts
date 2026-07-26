import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'path';

/**
 * TypeORM 数据库连接（MySQL）。
 * - 开发环境 synchronize=true，entity 自动建表（无需手工迁移即可跑通）。
 * - 生产环境关闭 synchronize，改为 migration：migrationsRun=true 在启动时自动执行待跑迁移。
 *   迁移脚本：npm run migration:generate / migration:run / migration:revert（见 typeorm-cli.ts）。
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'mysql',
        host: config.get('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 3306),
        username: config.get('DB_USERNAME', 'root'),
        password: config.get('DB_PASSWORD', ''),
        database: config.get('DB_DATABASE', 'tuji'),
        charset: 'utf8mb4',
        autoLoadEntities: true,
        synchronize: config.get('NODE_ENV') !== 'production',
        migrationsRun: config.get('NODE_ENV') === 'production',
        migrations: [join(__dirname, '../../migrations/*.js')],
        timezone: '+08:00',
        extra: { connectionLimit: 10 },
      }),
    }),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
