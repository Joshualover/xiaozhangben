import dayjs from 'dayjs';
import type { Transaction } from '@/types';

export type Granularity = 'day' | 'week' | 'month' | 'year';

export interface TrendBucket {
  key: string;
  label: string;
  fullLabel: string;
  start: number;
  end: number;
  expense: number;
  income: number;
  balance: number;
}

/**
 * 按粒度把账单分桶，用于趋势图。
 * 所有粒度的分桶规则集中在这里，避免图表、导出、排行三处口径不一致。
 */
export function buildBuckets(
  transactions: Transaction[],
  granularity: Granularity,
  count: number,
  now = Date.now(),
): TrendBucket[] {
  const buckets: TrendBucket[] = [];
  const base = dayjs(now);

  const specs: TrendBucket[] = [];

  if (granularity === 'day') {
    for (let i = count - 1; i >= 0; i--) {
      const d = base.subtract(i, 'day');
      specs.push({
        key: d.format('YYYY-MM-DD'),
        label: d.format('M/D'),
        fullLabel: d.format('YYYY年M月D日'),
        start: d.startOf('day').valueOf(),
        end: d.add(1, 'day').startOf('day').valueOf(),
        expense: 0,
        income: 0,
        balance: 0,
      });
    }
  } else if (granularity === 'week') {
    const weekStart = base.startOf('day').subtract((base.day() + 6) % 7, 'day');
    for (let i = count - 1; i >= 0; i--) {
      const s = weekStart.subtract(i, 'week');
      specs.push({
        key: s.format('YYYY-MM-DD'),
        label: `${s.format('M/D')}`,
        fullLabel: `${s.format('M月D日')} — ${s.add(6, 'day').format('M月D日')}`,
        start: s.valueOf(),
        end: s.add(1, 'week').valueOf(),
        expense: 0,
        income: 0,
        balance: 0,
      });
    }
  } else if (granularity === 'month') {
    for (let i = count - 1; i >= 0; i--) {
      const m = base.subtract(i, 'month');
      specs.push({
        key: m.format('YYYY-MM'),
        label: m.format('M月'),
        fullLabel: m.format('YYYY年M月'),
        start: m.startOf('month').valueOf(),
        end: m.add(1, 'month').startOf('month').valueOf(),
        expense: 0,
        income: 0,
        balance: 0,
      });
    }
  } else {
    for (let i = count - 1; i >= 0; i--) {
      const y = base.subtract(i, 'year');
      specs.push({
        key: y.format('YYYY'),
        label: y.format('YYYY'),
        fullLabel: y.format('YYYY年'),
        start: y.startOf('year').valueOf(),
        end: y.add(1, 'year').startOf('year').valueOf(),
        expense: 0,
        income: 0,
        balance: 0,
      });
    }
  }

  for (const t of transactions) {
    for (const b of specs) {
      if (t.occurredAt >= b.start && t.occurredAt < b.end) {
        if (t.type === 'expense') b.expense += t.amount;
        else b.income += t.amount;
        break;
      }
    }
  }

  for (const b of specs) {
    b.balance = b.income - b.expense;
    buckets.push(b);
  }
  return buckets;
}

export const GRANULARITY_LABEL: Record<Granularity, string> = {
  day: '日',
  week: '周',
  month: '月',
  year: '年',
};

export const GRANULARITY_COUNT: Record<Granularity, number> = {
  day: 14,
  week: 8,
  month: 12,
  year: 5,
};
