import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { StatsService } from './stats.service';
import { StatsRangeQueryDto } from './stats.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { StatsRateLimitGuard } from './stats-rate-limit.guard';

/**
 * 统计 API：有参 POST；storage 无参可 GET。
 * 旧 GET + query 保留一期兼容。
 */
@Controller('stats')
@UseGuards(JwtAuthGuard, StatsRateLimitGuard)
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  /** P0 首页聚合：模块嵌套 */
  @Post('dashboard')
  async dashboard(
    @CurrentUser() u: { id: string },
    @Body() body: StatsRangeQueryDto,
  ) {
    const [
      overview,
      expenses,
      plans,
      journeys,
      content,
      storage,
    ] = await Promise.all([
      this.stats.overview(u.id, body),
      this.stats.expenseStats(u.id, body),
      this.stats.plans(u.id, body),
      this.stats.journeysStats(u.id, body),
      this.stats.content(u.id, body),
      this.stats.storage(u.id),
    ]);
    const range = overview.range;
    return {
      code: 0 as const,
      message: 'ok',
      data: {
        range,
        overview: overview.data,
        expenses: expenses.data,
        plans: plans.data,
        journeys: journeys.data,
        content: content.data,
        storage: storage.data,
      },
    };
  }

  @Post('overview')
  overviewPost(
    @CurrentUser() u: { id: string },
    @Body() body: StatsRangeQueryDto,
  ) {
    return this.stats.overview(u.id, body);
  }

  @Post('expenses')
  expensesPost(
    @CurrentUser() u: { id: string },
    @Body() body: StatsRangeQueryDto,
  ) {
    return this.stats.expenseStats(u.id, body);
  }

  @Post('plans')
  plansPost(
    @CurrentUser() u: { id: string },
    @Body() body: StatsRangeQueryDto,
  ) {
    return this.stats.plans(u.id, body);
  }

  @Post('journeys')
  journeysPost(
    @CurrentUser() u: { id: string },
    @Body() body: StatsRangeQueryDto,
  ) {
    return this.stats.journeysStats(u.id, body);
  }

  @Post('content')
  contentPost(
    @CurrentUser() u: { id: string },
    @Body() body: StatsRangeQueryDto,
  ) {
    return this.stats.content(u.id, body);
  }

  /** 无参可用 GET；也支持 POST */
  @Get('storage')
  storageGet(@CurrentUser() u: { id: string }) {
    return this.stats.storage(u.id);
  }

  @Post('storage')
  storagePost(@CurrentUser() u: { id: string }) {
    return this.stats.storage(u.id);
  }

  // ─── 兼容 GET + query ───────────────────────────────────

  @Get('overview')
  overview(
    @CurrentUser() u: { id: string },
    @Query() query: StatsRangeQueryDto,
  ) {
    return this.stats.overview(u.id, query);
  }

  @Get('expenses')
  expenses(
    @CurrentUser() u: { id: string },
    @Query() query: StatsRangeQueryDto,
  ) {
    return this.stats.expenseStats(u.id, query);
  }

  @Get('plans')
  plans(
    @CurrentUser() u: { id: string },
    @Query() query: StatsRangeQueryDto,
  ) {
    return this.stats.plans(u.id, query);
  }

  @Get('journeys')
  journeys(
    @CurrentUser() u: { id: string },
    @Query() query: StatsRangeQueryDto,
  ) {
    return this.stats.journeysStats(u.id, query);
  }

  @Get('content')
  content(
    @CurrentUser() u: { id: string },
    @Query() query: StatsRangeQueryDto,
  ) {
    return this.stats.content(u.id, query);
  }
}
