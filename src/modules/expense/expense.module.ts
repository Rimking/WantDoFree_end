import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Expense } from '../../entities/expense.entity';
import { Entry } from '../../entities/entry.entity';
import { Journey } from '../../entities/journey.entity';
import { ExpenseService } from './expense.service';
import {
  ExpenseController,
  MeExpenseController,
} from './expense.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Expense, Entry, Journey])],
  controllers: [ExpenseController, MeExpenseController],
  providers: [ExpenseService],
  exports: [ExpenseService],
})
export class ExpenseModule {}
