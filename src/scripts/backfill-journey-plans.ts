/**
 * 存量补偿：为缺失 journey_plans 的旅程补建 plan + 默认清单。
 *
 * 背景：toListItem 已去掉 ensurePlan 写副作用（读路径不再写库），
 * 存量数据里缺 plan 的旅程列表会显示空进度。跑一次本脚本补齐即可；
 * 幂等，可重复执行。
 *
 * 用法：npm run backfill:plans
 */
import 'dotenv/config';
import 'reflect-metadata';
import { DataSource, IsNull } from 'typeorm';
import { Journey } from '../entities/journey.entity';
import { JourneyPlan } from '../entities/journey-plan.entity';
import { ChecklistItem } from '../entities/checklist-item.entity';
import { DEFAULT_PLAN_CHECKS } from '../common/enums/catalog';

async function main() {
  const ds = new DataSource({
    type: 'mysql',
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    username: process.env.DB_USERNAME || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || 'tuji',
    charset: 'utf8mb4',
    timezone: '+08:00',
    entities: ['src/entities/**/*.entity.ts'],
    synchronize: false,
  });
  await ds.initialize();

  if (process.env.NODE_ENV === 'production' && !process.env.ALLOW_BACKFILL) {
    console.error('拒绝执行：生产环境需显式设置 ALLOW_BACKFILL=true');
    await ds.destroy();
    process.exit(1);
  }

  const journeys = await ds.getRepository(Journey).find({ select: ['id'] });
  const plansRepo = ds.getRepository(JourneyPlan);
  const itemsRepo = ds.getRepository(ChecklistItem);

  let created = 0;
  let skipped = 0;
  for (const j of journeys) {
    const exists = await plansRepo.findOne({ where: { journeyId: j.id } });
    if (exists) {
      skipped += 1;
      continue;
    }
    await ds.transaction(async (manager) => {
      await manager.save(
        manager.create(JourneyPlan, {
          journeyId: j.id,
          places: [],
          checks: DEFAULT_PLAN_CHECKS.map((c) => ({ ...c })),
          budgetEstimate: 0,
        }),
      );
      const count = await manager.count(ChecklistItem, {
        where: { journeyId: j.id, deletedAt: IsNull() },
      });
      if (count === 0) {
        let order = 0;
        for (const c of DEFAULT_PLAN_CHECKS) {
          await manager.save(
            manager.create(ChecklistItem, {
              journeyId: j.id,
              title: c.text,
              isDefaultChecked: false,
              isChecked: !!c.done,
              remindBeforeDays: null,
              sortOrder: order++,
            }),
          );
        }
      }
    });
    created += 1;
    console.log(`+ 补建 plan: ${j.id}`);
  }

  console.log(`\n完成：补建 ${created}，已存在跳过 ${skipped}，共 ${journeys.length} 条旅程`);
  await ds.destroy();
}

main().catch((e) => {
  console.error('backfill 异常:', e?.message ?? e);
  process.exit(1);
});
