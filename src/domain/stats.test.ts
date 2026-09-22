import { describe, expect, it } from 'vitest';
import {
  accountBalances,
  activeFilterCount,
  applyFilter,
  budgetProgress,
  statsByCategory,
  topWithOthers,
  totalAssets,
  totalsOf,
} from './stats';
import { EMPTY_FILTER, type Account, type Transaction } from '@/types';

const tx = (over: Partial<Transaction>): Transaction => ({
  id: over.id ?? Math.random().toString(36).slice(2),
  type: over.type ?? 'expense',
  amount: over.amount ?? 1000,
  categoryId: over.categoryId ?? 'c1',
  subCategoryId: over.subCategoryId,
  accountId: over.accountId ?? 'a1',
  occurredAt: over.occurredAt ?? Date.parse('2026-09-10T12:00:00'),
  note: over.note,
  tagIds: over.tagIds ?? [],
  ledgerId: 'default',
  createdAt: 0,
  updatedAt: 0,
});

describe('totalsOf', () => {
  it('分别汇总收支并计算结余', () => {
    const list = [
      tx({ type: 'expense', amount: 3000 }),
      tx({ type: 'expense', amount: 1500 }),
      tx({ type: 'income', amount: 10000 }),
    ];
    expect(totalsOf(list)).toEqual({ expense: 4500, income: 10000, balance: 5500 });
  });

  it('空列表全为 0', () => {
    expect(totalsOf([])).toEqual({ expense: 0, income: 0, balance: 0 });
  });
});

describe('statsByCategory', () => {
  it('按分类聚合并按金额倒序，占比之和为 100', () => {
    const list = [
      tx({ categoryId: 'food', amount: 6000 }),
      tx({ categoryId: 'food', amount: 2000 }),
      tx({ categoryId: 'traffic', amount: 2000 }),
      tx({ categoryId: 'salary', amount: 9999, type: 'income' }),
    ];
    const stats = statsByCategory(list, 'expense');
    expect(stats).toHaveLength(2);
    expect(stats[0].categoryId).toBe('food');
    expect(stats[0].amount).toBe(8000);
    expect(stats[0].count).toBe(2);
    expect(stats.reduce((a, s) => a + s.percent, 0)).toBeCloseTo(100);
  });

  it('计算环比，基期为零时返回 null', () => {
    const cur = [tx({ categoryId: 'food', amount: 12000 })];
    const prev = [tx({ categoryId: 'food', amount: 10000 })];
    const stats = statsByCategory(cur, 'expense', prev);
    expect(stats[0].changeRate).toBeCloseTo(20);

    const noBase = statsByCategory(cur, 'expense', []);
    expect(noBase[0].changeRate).toBeNull();
  });

  it('无数据时返回空数组而非 NaN', () => {
    expect(statsByCategory([], 'expense')).toEqual([]);
  });
});

describe('topWithOthers', () => {
  it('超出 TopN 的部分合并为「其他」，占比仍为 100', () => {
    const list = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((c, i) =>
      tx({ categoryId: c, amount: (8 - i) * 1000 }),
    );
    const stats = statsByCategory(list, 'expense');
    const merged = topWithOthers(stats, 6);
    expect(merged).toHaveLength(7);
    expect(merged[6].categoryId).toBe('__others__');
    expect(merged.reduce((a, s) => a + s.percent, 0)).toBeCloseTo(100);
    expect(merged[6].amount).toBe(2000 + 1000);
  });

  it('数量不足 TopN 时原样返回', () => {
    const list = [tx({ categoryId: 'a', amount: 100 })];
    expect(topWithOthers(statsByCategory(list, 'expense'), 6)).toHaveLength(1);
  });
});

describe('accountBalances', () => {
  const accounts: Account[] = [
    {
      id: 'a1',
      name: '银行卡',
      kind: 'debit',
      initialBalance: 100000,
      icon: 'credit-card',
      color: '#000',
      includeInTotal: true,
      archived: false,
    },
    {
      id: 'a2',
      name: '信用卡',
      kind: 'credit',
      initialBalance: 0,
      icon: 'credit-card',
      color: '#000',
      includeInTotal: true,
      archived: false,
    },
    {
      id: 'a3',
      name: '备用金',
      kind: 'cash',
      initialBalance: 0,
      icon: 'banknote',
      color: '#000',
      includeInTotal: false,
      archived: false,
    },
  ];

  it('余额 = 初始 + 收入 - 支出，并按转账调整', () => {
    const list = [
      tx({ accountId: 'a1', type: 'expense', amount: 20000 }),
      tx({ accountId: 'a1', type: 'income', amount: 5000 }),
      tx({ accountId: 'a2', type: 'expense', amount: 30000 }),
    ];
    const balances = accountBalances(accounts, list, [
      { fromAccountId: 'a1', toAccountId: 'a2', amount: 10000 },
    ]);
    expect(balances.get('a1')).toBe(100000 - 20000 + 5000 - 10000);
    expect(balances.get('a2')).toBe(-30000 + 10000);
  });

  it('总资产只统计 includeInTotal 的账户', () => {
    const balances = new Map([
      ['a1', 100000],
      ['a2', -20000],
      ['a3', 999999],
    ]);
    expect(totalAssets(accounts, balances)).toBe(80000);
  });
});

describe('budgetProgress', () => {
  const budget = { id: 'b1', month: '2026-09', categoryId: null, amount: 100000 };

  it('按阈值划分 safe / warn / danger', () => {
    expect(budgetProgress(budget, 50000).level).toBe('safe');
    expect(budgetProgress(budget, 60000).level).toBe('warn');
    expect(budgetProgress(budget, 95000).level).toBe('danger');
  });

  it('超支时剩余为负且百分比大于 100', () => {
    const p = budgetProgress(budget, 130000);
    expect(p.percent).toBeCloseTo(130);
    expect(p.remaining).toBe(-30000);
  });

  it('预算为 0 时不产生除零', () => {
    const p = budgetProgress({ ...budget, amount: 0 }, 1000);
    expect(p.percent).toBe(0);
  });
});

describe('applyFilter', () => {
  const ctx = {
    categoryName: (id: string) => ({ c1: '餐饮', c2: '交通' })[id] ?? '未分类',
    tagNames: (ids: string[]) => ids.map((id) => (id === 't1' ? '出差' : '其他')),
  };
  const list = [
    tx({ id: 'x1', categoryId: 'c1', amount: 2800, note: '公司楼下', accountId: 'a1', tagIds: ['t1'] }),
    tx({ id: 'x2', categoryId: 'c2', amount: 600, accountId: 'a2' }),
    tx({ id: 'x3', categoryId: 'c1', amount: 9900, type: 'income', accountId: 'a1' }),
  ];

  it('默认条件返回全部', () => {
    expect(applyFilter(list, EMPTY_FILTER, ctx)).toHaveLength(3);
  });

  it('按类型与分类筛选', () => {
    expect(applyFilter(list, { ...EMPTY_FILTER, type: 'expense' }, ctx)).toHaveLength(2);
    expect(applyFilter(list, { ...EMPTY_FILTER, categoryId: 'c1' }, ctx)).toHaveLength(2);
  });

  it('按金额区间筛选，边界包含在内', () => {
    const r = applyFilter(list, { ...EMPTY_FILTER, minAmount: 600, maxAmount: 2800 }, ctx);
    expect(r.map((t) => t.id).sort()).toEqual(['x1', 'x2']);
  });

  it('关键词可命中备注、分类名与金额', () => {
    expect(applyFilter(list, { ...EMPTY_FILTER, keyword: '楼下' }, ctx)).toHaveLength(1);
    expect(applyFilter(list, { ...EMPTY_FILTER, keyword: '交通' }, ctx)).toHaveLength(1);
    expect(applyFilter(list, { ...EMPTY_FILTER, keyword: '28.00' }, ctx)).toHaveLength(1);
  });

  it('标签需全部命中', () => {
    expect(applyFilter(list, { ...EMPTY_FILTER, tagIds: ['t1'] }, ctx)).toHaveLength(1);
    expect(applyFilter(list, { ...EMPTY_FILTER, tagIds: ['t1', 't9'] }, ctx)).toHaveLength(0);
  });

  it('日期范围按自然日全天覆盖', () => {
    const r = applyFilter(list, { ...EMPTY_FILTER, from: '2026-09-10', to: '2026-09-10' }, ctx);
    expect(r).toHaveLength(3);
    expect(applyFilter(list, { ...EMPTY_FILTER, from: '2026-09-11' }, ctx)).toHaveLength(0);
  });

  it('多个条件为「与」关系', () => {
    const r = applyFilter(
      list,
      { ...EMPTY_FILTER, type: 'expense', categoryId: 'c1', minAmount: 1000 },
      ctx,
    );
    expect(r.map((t) => t.id)).toEqual(['x1']);
  });
});

describe('activeFilterCount', () => {
  it('统计已启用的条件数量', () => {
    expect(activeFilterCount(EMPTY_FILTER)).toBe(0);
    expect(
      activeFilterCount({ ...EMPTY_FILTER, keyword: 'x', type: 'expense', categoryId: 'c1' }),
    ).toBe(3);
    expect(activeFilterCount({ ...EMPTY_FILTER, minAmount: 0 })).toBe(1);
    expect(activeFilterCount({ ...EMPTY_FILTER, maxAmount: 100 })).toBe(1);
    expect(activeFilterCount({ ...EMPTY_FILTER, tagIds: ['a', 'b'] })).toBe(1);
  });
});
