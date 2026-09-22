import { useMemo } from 'react';
import { useLedger } from '@/store/useLedgerStore';
import { monthKeyOf, monthRange, recentMonthKeys, shiftMonth } from '@/domain/period';
import {
  accountBalances,
  budgetProgress,
  statsByCategory,
  topWithOthers,
  totalAssets,
  totalsOf,
  type BudgetProgress,
  type Totals,
} from '@/domain/stats';

/**
 * 所有派生数据集中在这里计算。
 * 组件只消费结果，不重复实现计算逻辑 —— 保证「列表 / 图表 / 导出」口径完全一致。
 */
export function useLedgerData(monthKey?: string) {
  const categories = useLedger((s) => s.categories);
  const accounts = useLedger((s) => s.accounts);
  const tags = useLedger((s) => s.tags);
  const transactions = useLedger((s) => s.transactions);
  const transfers = useLedger((s) => s.transfers);
  const budgets = useLedger((s) => s.budgets);
  const selectedMonth = useLedger((s) => s.selectedMonth);
  const currencySymbol = useLedger((s) => s.currencySymbol);

  const month = monthKey ?? selectedMonth;

  return useMemo(() => {
    const categoryById = new Map(categories.map((c) => [c.id, c]));
    const accountById = new Map(accounts.map((a) => [a.id, a]));
    const tagById = new Map(tags.map((t) => [t.id, t]));

    const categoryName = (id: string) => categoryById.get(id)?.name ?? '未分类';
    const accountName = (id: string) => accountById.get(id)?.name ?? '未知账户';
    const tagNames = (ids: string[]) => ids.map((id) => tagById.get(id)?.name ?? '').filter(Boolean);
    const categoryPath = (id: string) => {
      const c = categoryById.get(id);
      if (!c) return { parent: '未分类', child: '' };
      if (c.parentId) {
        return { parent: categoryById.get(c.parentId)?.name ?? c.name, child: c.name };
      }
      return { parent: c.name, child: '' };
    };

    const range = monthRange(month);
    const prevMonth = shiftMonth(month, -1);
    const prevRange = monthRange(prevMonth);

    const monthTx = transactions.filter((t) => t.occurredAt >= range.start && t.occurredAt < range.end);
    const prevMonthTx = transactions.filter(
      (t) => t.occurredAt >= prevRange.start && t.occurredAt < prevRange.end,
    );

    const totals: Totals = totalsOf(monthTx);
    const prevTotals: Totals = totalsOf(prevMonthTx);

    const expenseStats = statsByCategory(monthTx, 'expense', prevMonthTx);
    const incomeStats = statsByCategory(monthTx, 'income', prevMonthTx);

    const months = recentMonthKeys(6);
    const totalsByMonth = new Map<string, Totals>();
    for (const m of months) {
      const r = monthRange(m);
      totalsByMonth.set(
        m,
        totalsOf(transactions.filter((t) => t.occurredAt >= r.start && t.occurredAt < r.end)),
      );
    }

    const monthOf = (ts: number) => monthKeyOf(ts);
    const monthlyTotals = new Map<string, Totals>();
    for (const t of transactions) {
      const k = monthOf(t.occurredAt);
      const cur = monthlyTotals.get(k) ?? { expense: 0, income: 0, balance: 0 };
      if (t.type === 'expense') cur.expense += t.amount;
      else cur.income += t.amount;
      cur.balance = cur.income - cur.expense;
      monthlyTotals.set(k, cur);
    }

    const balances = accountBalances(accounts, transactions, transfers);
    const assets = totalAssets(accounts, balances);

    const monthBudgets = budgets.filter((b) => b.month === month);
    const totalBudget = monthBudgets.find((b) => b.categoryId === null) ?? null;
    const totalBudgetProgress: BudgetProgress | null = totalBudget
      ? budgetProgress(totalBudget, totals.expense)
      : null;

    const categoryBudgetProgress: BudgetProgress[] = monthBudgets
      .filter((b) => b.categoryId !== null)
      .map((b) => {
        const used = expenseStats.find((s) => s.categoryId === b.categoryId)?.amount ?? 0;
        return budgetProgress(b, used);
      })
      .sort((a, b) => b.percent - a.percent);

    return {
      month,
      categories,
      accounts,
      tags,
      transactions,
      transfers,
      categoryById,
      accountById,
      categoryName,
      accountName,
      tagNames,
      categoryPath,
      monthTx,
      prevMonthTx,
      totals,
      prevTotals,
      expenseStats,
      incomeStats,
      expenseTop: topWithOthers(expenseStats, 6),
      months,
      totalsByMonth,
      monthlyTotals,
      balances,
      assets,
      monthBudgets,
      totalBudgetProgress,
      categoryBudgetProgress,
      currencySymbol,
    };
  }, [categories, accounts, tags, transactions, transfers, budgets, month, currencySymbol]);
}

export type LedgerData = ReturnType<typeof useLedgerData>;
