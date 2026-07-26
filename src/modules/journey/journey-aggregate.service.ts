import { Injectable } from '@nestjs/common';
import { JourneyService } from './journey.service';
import { RecordingService } from '../recording/recording.service';
import { ExpenseService } from '../expense/expense.service';
import { GuideService } from '../guide/guide.service';
import {
  JourneyDetailInclude,
  JourneyListBodyDto,
} from './journey-api.dto';

const DEFAULT_INCLUDE: JourneyDetailInclude[] = [
  'entries',
  'plan',
  'expense',
];

/**
 * 聚合 / 模块化响应（与盘点文档 §3 对齐）。
 * 单查接口返回的模块对象与此处同构。
 */
@Injectable()
export class JourneyAggregateService {
  constructor(
    private readonly journey: JourneyService,
    private readonly recording: RecordingService,
    private readonly expense: ExpenseService,
    private readonly guide: GuideService,
  ) {}

  /** 列表：模块化项 + 分页 */
  async listModular(userId: string, body: JourneyListBodyDto) {
    const page = body.page ?? 1;
    const pageSize = body.pageSize ?? 20;
    const all = await this.journey.list(
      userId,
      body.status,
      body.displayStatus,
    );
    const total = all.length;
    const slice = all.slice((page - 1) * pageSize, page * pageSize);
    const useFlat = body.modular === false;
    return {
      list: useFlat
        ? slice
        : slice.map((item) => this.journey.toModularListItem(item)),
      total,
      page,
      pageSize,
    };
  }

  /** 详情聚合：根上只有模块 key */
  async detail(
    userId: string,
    journeyId: string,
    include?: JourneyDetailInclude[],
  ) {
    const inc = include?.length ? include : DEFAULT_INCLUDE;
    const set = new Set(inc);

    const flat = await this.journey.detail(userId, journeyId);
    const journey = this.journey.toJourneyModule(flat);
    const journeyStats = this.journey.toJourneyStatsModule(flat);
    const planProgress = this.journey.toPlanProgressModule(flat);

    const out: Record<string, unknown> = {
      journey,
      journeyStats,
      planProgress,
    };

    if (set.has('plan')) {
      out.plan = this.journey.toPlanModule(
        await this.journey.getPlan(userId, journeyId),
      );
    }
    if (set.has('entries')) {
      const entries = await this.recording.listByJourney(userId, journeyId);
      out.entries = entries.map((e) =>
        this.recording.toEntryModule(e),
      );
    }
    if (set.has('expense')) {
      const exp = await this.expense.summary(userId, journeyId);
      out.expense = this.expense.toExpenseModule(exp);
    }
    if (set.has('guide')) {
      out.guide = await this.guide.getForAggregate(userId, journeyId);
    }

    return out;
  }

  async getModular(userId: string, id: string) {
    const flat = await this.journey.detail(userId, id);
    return {
      journey: this.journey.toJourneyModule(flat),
      journeyStats: this.journey.toJourneyStatsModule(flat),
      planProgress: this.journey.toPlanProgressModule(flat),
    };
  }
}
