import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ExpenseService } from './expense.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  ExpenseSummaryBodyDto,
  MeExpenseSummaryBodyDto,
} from '../journey/journey-api.dto';

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

  @Get(':id/expense-summary')
  async summary(@CurrentUser() u: { id: string }, @Param('id') id: string) {
    const raw = await this.expense.summary(u.id, id);
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

  @Get('expense-summary')
  global(
    @CurrentUser() u: { id: string },
    @Query('year') year?: string,
  ) {
    const y = year ? Number(year) : new Date().getFullYear();
    return this.expense.globalSummary(u.id, y);
  }
}
