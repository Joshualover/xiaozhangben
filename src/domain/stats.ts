import type { Account, Budget, TxFilter, TxType, Transaction } from '@/types';
import { sumCents } from './money';

/** 数组按月/分类等维度聚合的通用小工具 */
export function groupBy<T, K extends string | number>(list: T[], keyFn: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of list) {
    const k = keyFn(item);
    const arr = map.get(k);
    if (arr) arr.push(item);
    else map.set(k, [item]);
  }
  return map;
}

export interface Totals {
  expense: number;
  income: number;
  balance: number;
}

export function totalsOf(list: Transaction[]): Totals {
  const expense = sumCents(list.filter((t) => t.type === 'expense').map((t) => t.amount));
  const income = sumCents(list.filter((t) => t.type === 'income').map((t) => t.amount));
  return { expense, income, balance: income - expense };
}

export interface CategoryStat {
  categoryId: string;
  amount: number;
  count: number;
  /** 占比 0-100 */
  percent: number;
  /** 环比 0-100 的百分比变化，null 表示基期为 0 无法计算 */
  changeRate: number | null;
}

/** 按分类聚合（仅指定类型），按金额倒序 */
export function statsByCategory(
  list: Transaction[],
  type: TxType,
  previousList?: Transaction[],
): CategoryStat[] {
  const filtered = list.filter((t) => t.type === type);
  const total = sumCents(filtered.map((t) => t.amount));

  const prevMap = new Map<string, number>();
  if (previousList) {
    for (const t of previousList.filter((x) => x.type === type)) {
      prevMap.set(t.categoryId, (prevMap.get(t.categoryId) ?? 0) + t.amount);
    }
  }

  return [...groupBy(filtered, (t) => t.categoryId).entries()]
    .map(([categoryId, items]) => {
      const amount = sumCents(items.map((t) => t.amount));
      const prev = prevMap.get(categoryId) ?? 0;
      return {
        categoryId,
        amount,
        count: items.length,
        percent: total === 0 ? 0 : (amount / total) * 100,
        changeRate: prev === 0 ? (amount === 0 ? 0 : null) : ((amount - prev) / prev) * 100,
      };
    })
    .sort((a, b) => b.amount - a.amount);
}

/**
 * 环形图数据：Top N 之外的合并为「其他」。
 * 返回的 percent 之和恒为 100（无数据时为空数组）。
 */
export function topWithOthers(stats: CategoryStat[], topN = 6): CategoryStat[] {
  if (stats.length <= topN) return stats;
  const head = stats.slice(0, topN);
  const tail = stats.slice(topN);
  const amount = sumCents(tail.map((s) => s.amount));
  const count = tail.reduce((a, s) => a + s.count, 0);
  const percent = tail.reduce((a, s) => a + s.percent, 0);
  return [
    ...head,
    { categoryId: '__others__', amount, count, percent, changeRate: null },
  ];
}

export interface TrendPoint {
  monthKey: string;
  expense: number;
  income: number;
  balance: number;
}

export function buildTrend(
  monthKeys: string[],
  totalsByMonth: Map<string, Totals>,
): TrendPoint[] {
  return monthKeys.map((monthKey) => {
    const t = totalsByMonth.get(monthKey) ?? { expense: 0, income: 0, balance: 0 };
    return { monthKey, ...t };
  });
}

/** 账户当前余额 = 初始余额 + 转入收入 - 转出支出 */
export function accountBalances(
  accounts: Account[],
  transactions: Transaction[],
  transfers: { fromAccountId: string; toAccountId: string; amount: number }[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const a of accounts) map.set(a.id, a.initialBalance);

  for (const t of transactions) {
    if (!map.has(t.accountId)) continue;
    const delta = t.type === 'income' ? t.amount : -t.amount;
    map.set(t.accountId, (map.get(t.accountId) ?? 0) + delta);
  }
  for (const tr of transfers) {
    if (map.has(tr.fromAccountId)) {
      map.set(tr.fromAccountId, (map.get(tr.fromAccountId) ?? 0) - tr.amount);
    }
    if (map.has(tr.toAccountId)) {
      map.set(tr.toAccountId, (map.get(tr.toAccountId) ?? 0) + tr.amount);
    }
  }
  return map;
}

/** 总资产：只统计 includeInTotal 的账户，信用卡欠款计为负 */
export function totalAssets(accounts: Account[], balances: Map<string, number>): number {
  return sumCents(
    accounts.filter((a) => a.includeInTotal && !a.archived).map((a) => balances.get(a.id) ?? 0),
  );
}

export interface BudgetProgress {
  budget: Budget;
  used: number;
  /** 0 以上，可能超过 100 */
  percent: number;
  remaining: number;
  level: 'safe' | 'warn' | 'danger';
}

export function budgetProgress(budget: Budget, used: number): BudgetProgress {
  const percent = budget.amount <= 0 ? 0 : (used / budget.amount) * 100;
  const level: BudgetProgress['level'] = percent > 90 ? 'danger' : percent >= 60 ? 'warn' : 'safe';
  return { budget, used, percent, remaining: budget.amount - used, level };
}

function matchesKeyword(t: Transaction, keyword: string, categoryName: string, tagNames: string[]): boolean {
  const k = keyword.trim().toLowerCase();
  if (!k) return true;
  const amountText = (t.amount / 100).toFixed(2);
  return (
    (t.note ?? '').toLowerCase().includes(k) ||
    categoryName.toLowerCase().includes(k) ||
    amountText.includes(k) ||
    tagNames.some((n) => n.toLowerCase().includes(k))
  );
}

/** 统一的账单筛选，列表页与导出共用，保证口径一致 */
export function applyFilter(
  transactions: Transaction[],
  filter: TxFilter,
  ctx: {
    categoryName: (id: string) => string;
    tagNames: (ids: string[]) => string[];
  },
): Transaction[] {
  const fromTs = filter.from ? new Date(`${filter.from}T00:00:00`).getTime() : null;
  const toTs = filter.to ? new Date(`${filter.to}T23:59:59.999`).getTime() : null;

  return transactions.filter((t) => {
    if (filter.type !== 'all' && t.type !== filter.type) return false;
    if (filter.categoryId && t.categoryId !== filter.categoryId && t.subCategoryId !== filter.categoryId) {
      return false;
    }
    if (filter.accountId && t.accountId !== filter.accountId) return false;
    if (filter.minAmount !== null && t.amount < filter.minAmount) return false;
    if (filter.maxAmount !== null && t.amount > filter.maxAmount) return false;
    if (fromTs !== null && t.occurredAt < fromTs) return false;
    if (toTs !== null && t.occurredAt > toTs) return false;
    if (filter.tagIds.length > 0 && !filter.tagIds.every((id) => t.tagIds.includes(id))) return false;
    if (!matchesKeyword(t, filter.keyword, ctx.categoryName(t.categoryId), ctx.tagNames(t.tagIds))) {
      return false;
    }
    return true;
  });
}

/** 统计已启用的筛选条件数量，用于 UI 提示 */
export function activeFilterCount(filter: TxFilter): number {
  let n = 0;
  if (filter.keyword.trim()) n++;
  if (filter.type !== 'all') n++;
  if (filter.categoryId) n++;
  if (filter.accountId) n++;
  if (filter.minAmount !== null || filter.maxAmount !== null) n++;
  if (filter.from || filter.to) n++;
  if (filter.tagIds.length) n++;
  return n;
}
