import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Expense } from '../../entities/expense.entity';
import { Entry } from '../../entities/entry.entity';
import { Journey } from '../../entities/journey.entity';
import {
  normalizeExpenseCategory,
  normalizeStatus,
  normalizeThemeTag,
} from '../../common/enums/catalog';

@Injectable()
export class ExpenseService {
  constructor(
    @InjectRepository(Expense) private readonly expenses: Repository<Expense>,
    @InjectRepository(Entry) private readonly entries: Repository<Entry>,
    @InjectRepository(Journey) private readonly journeys: Repository<Journey>,
  ) {}

  async summary(userId: string, journeyId: string) {
    const journey = await this.journeys.findOne({
      where: { id: journeyId, userId },
    });
    if (!journey) throw new NotFoundException('journey not found');

    const byCategory = await this.expenses
      .createQueryBuilder('e')
      .leftJoin('e.entry', 'entry')
      .select('e.category', 'category')
      .addSelect('SUM(e.amountCent)', 'amountCent')
      .addSelect('COUNT(*)', 'cnt')
      .where('entry.journeyId = :journeyId', { journeyId })
      .groupBy('e.category')
      .getRawMany();

    const byDay = await this.expenses
      .createQueryBuilder('e')
      .leftJoin('e.entry', 'entry')
      .select('DATE(entry.createdAt)', 'date')
      .addSelect('SUM(e.amountCent)', 'amountCent')
      .where('entry.journeyId = :journeyId', { journeyId })
      .groupBy('DATE(entry.createdAt)')
      .getRawMany();

    const totalCent = byCategory.reduce(
      (s, r) => s + Number(r.amountCent),
      0,
    );
    const count = byCategory.reduce((s, r) => s + Number(r.cnt), 0);

    return {
      journeyId,
      totalCent,
      total: totalCent,
      count,
      byCategory: byCategory.map((r) => {
        const amountCent = Number(r.amountCent);
        const category =
          normalizeExpenseCategory(r.category) ?? r.category;
        return {
          category,
          amountCent,
          amount: amountCent,
          ratio: totalCent ? Number((amountCent / totalCent).toFixed(4)) : 0,
          count: Number(r.cnt),
        };
      }),
      byDay: byDay.map((r) => {
        const amountCent = Number(r.amountCent);
        return {
          date: r.date,
          amountCent,
          amount: amountCent,
          total: amountCent,
        };
      }),
    };
  }

  /** 花费模块（去掉冗余别名） */
  toExpenseModule(raw: Record<string, any>) {
    return {
      totalCent: raw.totalCent ?? raw.total ?? 0,
      count: raw.count ?? 0,
      byCategory: (raw.byCategory ?? []).map((r: any) => ({
        category: r.category,
        amountCent: r.amountCent,
        ratio: r.ratio ?? 0,
        count: r.count ?? 0,
      })),
      byDay: (raw.byDay ?? []).map((r: any) => ({
        date: r.date,
        amountCent: r.amountCent,
      })),
    };
  }

  async globalSummary(userId: string, year: number) {
    const start = `${year}-01-01`;
    const end = `${year}-12-31 23:59:59`;

    const rows = await this.expenses
      .createQueryBuilder('e')
      .innerJoin('e.entry', 'entry')
      .innerJoin('entry.journey', 'journey')
      .select('e.category', 'category')
      .addSelect('SUM(e.amountCent)', 'amountCent')
      .addSelect('COUNT(*)', 'cnt')
      .where('journey.userId = :userId', { userId })
      .andWhere('entry.createdAt >= :start', { start })
      .andWhere('entry.createdAt <= :end', { end })
      .groupBy('e.category')
      .getRawMany();

    const byMonthRaw = await this.expenses
      .createQueryBuilder('e')
      .innerJoin('e.entry', 'entry')
      .innerJoin('entry.journey', 'journey')
      .select('MONTH(entry.createdAt)', 'month')
      .addSelect('SUM(e.amountCent)', 'amountCent')
      .addSelect('GROUP_CONCAT(DISTINCT journey.id)', 'journeyIds')
      .addSelect('GROUP_CONCAT(DISTINCT journey.title)', 'journeyTitles')
      .where('journey.userId = :userId', { userId })
      .andWhere('entry.createdAt >= :start', { start })
      .andWhere('entry.createdAt <= :end', { end })
      .groupBy('MONTH(entry.createdAt)')
      .getRawMany();

    const byJourneyRaw = await this.expenses
      .createQueryBuilder('e')
      .innerJoin('e.entry', 'entry')
      .innerJoin('entry.journey', 'journey')
      .select('journey.id', 'journeyId')
      .addSelect('journey.title', 'title')
      .addSelect('journey.destination', 'destination')
      .addSelect('journey.cover', 'coverUrl')
      .addSelect('journey.status', 'status')
      .addSelect('journey.themeTags', 'themeTags')
      .addSelect('journey.budgetAmount', 'budgetAmount')
      .addSelect('SUM(e.amountCent)', 'totalCent')
      .addSelect('COUNT(*)', 'count')
      .where('journey.userId = :userId', { userId })
      .andWhere('entry.createdAt >= :start', { start })
      .andWhere('entry.createdAt <= :end', { end })
      .groupBy('journey.id')
      .addGroupBy('journey.title')
      .addGroupBy('journey.destination')
      .addGroupBy('journey.cover')
      .addGroupBy('journey.status')
      .addGroupBy('journey.themeTags')
      .addGroupBy('journey.budgetAmount')
      .getRawMany();

    const totalCent = rows.reduce((s, r) => s + Number(r.amountCent), 0);
    const count = rows.reduce((s, r) => s + Number(r.cnt), 0);

    const byJourney = byJourneyRaw.map((r) => {
      let themeTags: string[] = [];
      try {
        const raw = r.themeTags;
        const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
        themeTags = Array.isArray(arr)
          ? arr.map((t: string) => normalizeThemeTag(t) ?? t)
          : [];
      } catch {
        themeTags = [];
      }
      return {
        journeyId: r.journeyId,
        title: r.title,
        destination: r.destination ?? null,
        coverUrl: r.coverUrl ?? null,
        status: normalizeStatus(r.status) ?? r.status,
        themeTags,
        totalCent: Number(r.totalCent),
        count: Number(r.count),
        budgetAmount: r.budgetAmount != null ? Number(r.budgetAmount) : null,
      };
    });

    const journeyCount = byJourney.length;
    const destCount = new Set(
      byJourney
        .map((j) => j.destination)
        .filter((d): d is string => Boolean(d && String(d).trim())),
    ).size;

    return {
      year,
      totalCent,
      count,
      journeyCount,
      destCount,
      byCategory: rows.map((r) => {
        const amountCent = Number(r.amountCent);
        return {
          category: normalizeExpenseCategory(r.category) ?? r.category,
          amountCent,
          amount: amountCent,
          ratio: totalCent ? Number((amountCent / totalCent).toFixed(4)) : 0,
          count: Number(r.cnt),
        };
      }),
      byMonth: byMonthRaw.map((r) => ({
        month: Number(r.month),
        amountCent: Number(r.amountCent),
        amount: Number(r.amountCent),
        journeyIds: String(r.journeyIds || '')
          .split(',')
          .filter(Boolean),
        journeyTitles: String(r.journeyTitles || '')
          .split(',')
          .filter(Boolean),
      })),
      byJourney,
    };
  }
}
