import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ExpenseService } from './expense.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  ExpenseSummaryBodyDto,
  MeExpenseSummaryBodyDto,
} from '../journey/journey-api.dto';

/**
 * 费用汇总 API（新契约：POST + body）。
 * 旧 GET expense-summary 兼容端点已于 2026-08-20 下线。
 */
@Controller('journeys')
@UseGuards(JwtAuthGuard)
export class ExpenseController {
  constructor(private readonly expense: ExpenseService) {}

  @Post('expense/summary')
  async summaryPost(
    @CurrentUser() u: { id: string },
    @Body() body: ExpenseSummaryBodyDto,
  ) {
    const raw = await this.expense.summary(u.id, body.journeyId);
    return this.expense.toExpenseModule(raw);
  }
}

@Controller('me')
@UseGuards(JwtAuthGuard)
export class MeExpenseController {
  constructor(private readonly expense: ExpenseService) {}

  @Post('expense/summary')
  globalPost(
    @CurrentUser() u: { id: string },
    @Body() body: MeExpenseSummaryBodyDto,
  ) {
    const y = body.year ?? new Date().getFullYear();
    return this.expense.globalSummary(u.id, y);
  }
}
