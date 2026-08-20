/**
 * D1 历史数据清理：清理 plan.places 中「无坐标 + 无关联 entry」的旧城市级地点
 * （旧 destination 种子产物，如 seedWishPlaces/seedDestPlaces 塞入的城市名）。
 *
 * 判定规则（保守）：
 *   1. 地点 lat/lng 均为空 → 无坐标（地图无法打点）
 *   2. 该旅程无任何 entry 的 location.name 与之同名 → 无关联记录
 * 同时满足才进入待删清单；有坐标或有记录引用的地点一律保留。
 *
 * 默认 dry-run：只打印待删清单；加 --apply 才真正写入。
 * 执行前请先全量备份数据库。
 *
 * 用法：
 *   npm run cleanup:legacy-places             # dry-run
 *   npm run cleanup:legacy-places -- --apply  # 真删
 */
import 'reflect-metadata';
import { DataSource } from 'typeorm';

async function main() {
  const apply = process.argv.includes('--apply');
  const ds = new DataSource({
    type: 'mysql',
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    username: process.env.DB_USERNAME || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || 'tuji',
    charset: 'utf8mb4',
    timezone: '+08:00',
    synchronize: false,
  });
  await ds.initialize();

  // 各旅程已关联记录的 location.name 集合（entry → location，有记录引用即视为关联）
  const linked = new Map<string, Set<string>>();
  const locRows: Array<{ journeyId: string; name: string }> = await ds.query(
    `SELECT e.journeyId AS journeyId, l.name AS name
     FROM locations l
     JOIN entries e ON e.id = l.entryId
     WHERE l.name IS NOT NULL AND l.name <> ''`,
  );
  for (const r of locRows) {
    const name = String(r.name || '').trim();
    if (!name) continue;
    const set = linked.get(r.journeyId) || new Set<string>();
    set.add(name);
    linked.set(r.journeyId, set);
  }

  const plans: Array<{ journeyId: string; places: string | null }> = await ds.query(
    `SELECT journeyId, places FROM journey_plans`,
  );
  let candidateCount = 0;
  let affectedPlans = 0;

  console.log('== 待删清单（lat/lng 为空 且 无同名 entry 引用）==');
  for (const plan of plans) {
    // mysql2 对 JSON 列会原生解析为数组；极端情况下也可能是字符串
    let places: unknown[] = [];
    if (typeof plan.places === 'string') {
      try {
        places = JSON.parse(plan.places);
      } catch {
        continue; // 脏 JSON 不动，交给人工处理
      }
    } else if (Array.isArray(plan.places)) {
      places = plan.places;
    } else {
      continue;
    }
    const keep: unknown[] = [];
    let removed = 0;
    for (const p of places) {
      const obj = p as Record<string, unknown>;
      const noCoord = obj.lat == null && obj.lng == null;
      const name = String(obj.name || '').trim();
      const isLinked = !!name && !!linked.get(plan.journeyId)?.has(name);
      if (noCoord && !isLinked) {
        console.log(
          `  - journeyId=${plan.journeyId}  地点="${name}"  ` +
            `(该旅程共 ${places.length} 个地点)`,
        );
        candidateCount += 1;
        removed += 1;
      } else {
        keep.push(p);
      }
    }
    if (removed === 0) continue;
    affectedPlans += 1;
    if (!apply) continue;
    await ds.query(`UPDATE journey_plans SET places = ? WHERE journeyId = ?`, [
      JSON.stringify(keep),
      plan.journeyId,
    ]);
  }

  console.log(
    `\n共 ${candidateCount} 个无坐标地点待删，涉及 ${affectedPlans} 个 journey_plans。`,
  );
  if (!apply) {
    console.log('dry-run：未写入。确认无误后执行 npm run cleanup:legacy-places -- --apply');
  } else {
    console.log(`✓ 已删除 ${candidateCount} 个地点，plan.places 已落库。`);
  }
  await ds.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
