/**
 * 迁移链完整性验证：全新临时库从零跑完整迁移链 → 与实体做 schema diff → 要求零差异。
 *
 * 背景（2026-08 审计）：dev 依赖 synchronize 自动建表，迁移链与实体脱节导致
 * 生产库无法正确建出。本脚本作为长期回归资产，防止再次漂移。
 *
 * 用法：npm run verify:migrations
 * 前置：.env 的 DB_* 指向可建库的 MySQL（脚本会创建/销毁临时库 tuji_migcheck）。
 * 退出码：0 = 零差异；1 = 存在差异或链路执行失败。
 */
import 'dotenv/config';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import mysql from 'mysql2/promise';

const TEMP_DB = 'tuji_migcheck';
const CHECK_MIGRATION = 'src/migrations/__verify_no_diff.ts';

async function withTempDb(fn: (conn: mysql.Connection) => Promise<void>) {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: +(process.env.DB_PORT || 3306),
    user: process.env.DB_USERNAME || 'root',
    password: process.env.DB_PASSWORD || '',
  });
  try {
    await conn.query(`DROP DATABASE IF EXISTS \`${TEMP_DB}\``);
    await conn.query(`CREATE DATABASE \`${TEMP_DB}\` CHARACTER SET utf8mb4`);
    await fn(conn);
  } finally {
    await conn.query(`DROP DATABASE IF EXISTS \`${TEMP_DB}\``);
    await conn.end();
  }
}

function cli(args: string): void {
  execSync(`npx typeorm-ts-node-commonjs -d ./typeorm-cli.ts ${args}`, {
    stdio: 'inherit',
    env: { ...process.env, DB_DATABASE: TEMP_DB },
  });
}

async function main(): Promise<void> {
  console.log(`▶ 迁移链验证：临时库 ${TEMP_DB} 从零跑链 → 与实体 diff（要求零差异）`);
  if (fs.existsSync(CHECK_MIGRATION)) fs.rmSync(CHECK_MIGRATION);

  let failed = false;
  await withTempDb(async () => {
    cli('migration:run');

    // 对齐验证：diff 为空时 generate 不产出文件（且以退出码 1 结束，需容错）
    try {
      execSync(
        `npx typeorm-ts-node-commonjs -d ./typeorm-cli.ts migration:generate ${CHECK_MIGRATION.replace(/\.ts$/, '')}`,
        {
          stdio: 'pipe',
          env: { ...process.env, DB_DATABASE: TEMP_DB },
        },
      );
    } catch (e: unknown) {
      const out = String((e as { stdout?: Buffer })?.stdout ?? '');
      const err = String((e as { stderr?: Buffer })?.stderr ?? '');
      if (!/No changes in database schema were found/.test(out + err)) {
        console.error(out, err);
        throw e;
      }
    }

    if (fs.existsSync(CHECK_MIGRATION)) {
      failed = true;
      console.error('\n✗ 迁移链与实体存在差异，生成内容如下：\n');
      console.error(fs.readFileSync(CHECK_MIGRATION, 'utf8'));
    }
  });

  if (fs.existsSync(CHECK_MIGRATION)) fs.rmSync(CHECK_MIGRATION);

  if (failed) {
    console.error('\n❌ 验证失败：请以实体为准补充迁移后重跑 npm run verify:migrations');
    process.exit(1);
  }
  console.log('\n✅ 迁移链验证通过：空库建出的 schema 与实体零差异');
}

main().catch((e) => {
  console.error('验证脚本异常:', e?.message ?? e);
  process.exit(1);
});
