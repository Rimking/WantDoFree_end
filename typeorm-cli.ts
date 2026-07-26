import 'dotenv/config';
import { DataSource } from 'typeorm';

/**
 * 独立 DataSource，仅供 typeorm CLI 使用（生成/执行 migration）。
 * 与 database.module.ts 的运行时连接配置保持一致（字符集、时区）。
 * 注意：dotenv 不会覆盖已存在的环境变量，因此可用
 *   DB_DATABASE=xxx npm run migration:generate -- ./src/migrations/Init
 * 临时指向空库来生成「全量建表」迁移。
 */
export default new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  username: process.env.DB_USERNAME || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_DATABASE || 'tuji',
  charset: 'utf8mb4',
  timezone: '+08:00',
  entities: ['src/entities/**/*.entity.ts'],
  migrations: ['src/migrations/**/*.ts'],
});
