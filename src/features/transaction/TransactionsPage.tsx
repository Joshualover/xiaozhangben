import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Pencil, Filter, Plus, Receipt, Search, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { useLedger } from '@/store/useLedgerStore';
import { useLedgerData } from '@/hooks/useLedgerData';
import { IconTile } from '@/components/Icon';
import { Dialog, Empty } from '@/components/UI';
import { TransactionFilterSheet } from './TransactionFilterSheet';
import { TransactionSheet } from './TransactionSheet';
import { activeFilterCount, applyFilter } from '@/domain/stats';
import { centsToYuanString, formatCents } from '@/domain/money';
import {
  currentMonthKey,
  formatDateLabel,
  formatMonthLabel,
  formatWeekday,
  shiftMonth,
} from '@/domain/period';
import { transactionsToCsv } from '@/lib/csv';
import { download, todayStamp } from '@/lib/id';
import type { Transaction } from '@/types';

export function TransactionsPage() {
  const data = useLedgerData();
  const month = useLedger((s) => s.selectedMonth);
  const setMonth = useLedger((s) => s.setSelectedMonth);
  const filter = useLedger((s) => s.filter);
  const setFilter = useLedger((s) => s.setFilter);
  const resetFilter = useLedger((s) => s.resetFilter);
  const removeTransaction = useLedger((s) => s.removeTransaction);
  const restoreTransaction = useLedger((s) => s.restoreTransaction);
  const pushToast = useLedger((s) => s.pushToast);
  const currencySymbol = useLedger((s) => s.currencySymbol);

  const [filterOpen, setFilterOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Transaction | null>(null);

  const filterCount = activeFilterCount(filter);

  const list = useMemo(
    () =>
      applyFilter(data.monthTx, filter, {
        categoryName: data.categoryName,
        tagNames: data.tagNames,
      }).sort((a, b) => b.occurredAt - a.occurredAt),
    [data, filter],
  );

  const filteredTotals = useMemo(() => {
    let expense = 0;
    let income = 0;
    for (const t of list) {
      if (t.type === 'expense') expense += t.amount;
      else income += t.amount;
    }
    return { expense, income, balance: income - expense };
  }, [list]);

  const dayGroups = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const t of list) {
      const key = new Date(t.occurredAt).toDateString();
      const arr = map.get(key);
      if (arr) arr.push(t);
      else map.set(key, [t]);
    }
    return [...map.entries()].map(([key, items]) => {
      const expense = items.filter((i) => i.type === 'expense').reduce((a, i) => a + i.amount, 0);
      const income = items.filter((i) => i.type === 'income').reduce((a, i) => a + i.amount, 0);
      return { key, ts: items[0].occurredAt, items, expense, income };
    });
  }, [list]);

  const openEdit = (tx: Transaction) => {
    setEditing(tx);
    setFormOpen(true);
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    const snapshot = { ...pendingDelete };
    await removeTransaction(snapshot.id);
    setPendingDelete(null);
    pushToast({
      message: '已删除',
      tone: 'danger',
      actionLabel: '撤销',
      onAction: () => {
        void restoreTransaction(snapshot);
      },
    });
  };

  const handleExport = () => {
    const csv = transactionsToCsv(list, {
      categoryPath: data.categoryPath,
      accountName: data.accountName,
      tagNames: data.tagNames,
    });
    download(`ledger-账单-${todayStamp()}.csv`, csv, 'text/csv;charset=utf-8');
    pushToast({ message: `已导出 ${list.length} 条记录`, tone: 'success' });
  };

  // 桌面端快捷键：← → 切换月份
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (e.key === 'ArrowLeft') setMonth(shiftMonth(month, -1));
      if (e.key === 'ArrowRight') setMonth(shiftMonth(month, 1));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [month, setMonth]);

  const monthLabel = formatMonthLabel(month);
  const atCurrentMonth = month >= currentMonthKey();

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-title">账单</div>
          <div className="page-sub">
            {filterCount > 0 ? `已筛选 ${list.length} 条` : `本月共 ${data.monthTx.length} 条记录`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-sm" onClick={handleExport} disabled={list.length === 0}>
            <Download size={14} /> 导出
          </button>
          <button
            className="btn btn-sm btn-primary"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus size={14} /> 记一笔
          </button>
        </div>
      </div>

      <div className="month-bar">
        <div className="month-nav">
          <button
            className="btn btn-ghost btn-icon btn-sm"
            aria-label="上个月"
            onClick={() => setMonth(shiftMonth(month, -1))}
          >
            <ChevronLeft size={17} />
          </button>
          <span className="month-label">{monthLabel}</span>
          <button
            className="btn btn-ghost btn-icon btn-sm"
            aria-label="下个月"
            disabled={atCurrentMonth}
            onClick={() => setMonth(shiftMonth(month, 1))}
          >
            <ChevronRight size={17} />
          </button>
        </div>
        <div className="month-summary num">
          <span>
            收 <b className="amount-income">{centsToYuanString(filterCount > 0 ? filteredTotals.income : data.totals.income)}</b>
          </span>
          <span>
            支 <b className="amount-expense">{centsToYuanString(filterCount > 0 ? filteredTotals.expense : data.totals.expense)}</b>
          </span>
          <span>
            余{' '}
            <b>
              {centsToYuanString(filterCount > 0 ? filteredTotals.balance : data.totals.balance)}
            </b>
          </span>
        </div>
      </div>

      <div className="search-bar">
        <div className="search-input-wrap">
          <Search size={15} />
          <input
            className="input search-input"
            type="search"
            placeholder="搜索备注、分类、标签或金额"
            value={filter.keyword}
            aria-label="搜索账单"
            onChange={(e) => setFilter({ keyword: e.target.value })}
          />
        </div>
        <button
          className={`btn${filterCount > 0 ? ' btn-primary' : ''}`}
          onClick={() => setFilterOpen(true)}
        >
          <SlidersHorizontal size={15} />
          {filterCount > 0 ? `筛选 ${filterCount}` : '筛选'}
        </button>
      </div>

      {filterCount > 0 ? (
        <div className="filter-active">
          <span className="badge badge-accent">
            <Filter size={11} /> 已启用 {filterCount} 个条件
          </span>
          <button className="btn btn-ghost btn-sm" onClick={resetFilter}>
            <X size={13} /> 清空
          </button>
        </div>
      ) : null}

      {dayGroups.length === 0 ? (
        <div className="card">
          <Empty
            icon={<Receipt size={24} />}
            title={filterCount > 0 ? '没有符合条件的账单' : `${monthLabel}还没有记录`}
            desc={
              filterCount > 0
                ? '试试放宽筛选条件，或清空后重新查看。'
                : '记下第一笔，图表和预算从这里开始有数据。'
            }
            action={
              filterCount > 0 ? (
                <button className="btn btn-sm" onClick={resetFilter}>
                  清空筛选条件
                </button>
              ) : (
                <button
                  className="btn btn-sm btn-primary"
                  onClick={() => {
                    setEditing(null);
                    setFormOpen(true);
                  }}
                >
                  <Plus size={14} /> 记一笔
                </button>
              )
            }
          />
        </div>
      ) : (
        <div className="tx-groups">
          {dayGroups.map((g) => (
            <div className="day-group" key={g.key}>
              <div className="day-head">
                <span className="day-date">
                  {formatDateLabel(g.ts)} <span style={{ color: 'var(--text-3)' }}>{formatWeekday(g.ts)}</span>
                </span>
                <span className="day-sum">
                  {g.income > 0 ? <span className="amount-income">+{centsToYuanString(g.income)}</span> : null}
                  {g.expense > 0 ? <span className="amount-expense">-{centsToYuanString(g.expense)}</span> : null}
                </span>
              </div>
              <div className="tx-list">
                {g.items.map((t) => {
                  const cat = data.categoryById.get(t.subCategoryId ?? t.categoryId) ?? data.categoryById.get(t.categoryId);
                  const parent = data.categoryById.get(t.categoryId);
                  const account = data.accountById.get(t.accountId);
                  const names = data.tagNames(t.tagIds);
                  return (
                    <div className="tx-item" key={t.id}>
                      <IconTile name={cat?.icon ?? parent?.icon} color={cat?.color ?? parent?.color ?? '#888780'} small size={32} />
                      <div className="tx-main">
                        <div className="tx-name">
                          {cat?.name ?? '未分类'}
                          {names.slice(0, 2).map((n) => (
                            <span className="tag-pill" key={n}>
                              {n}
                            </span>
                          ))}
                        </div>
                        <div className="tx-note">
                          {[t.note, account?.name, new Date(t.occurredAt).toTimeString().slice(0, 5)]
                            .filter(Boolean)
                            .join(' · ')}
                        </div>
                      </div>
                      <div className="tx-side">
                        <span className={`tx-amount ${t.type === 'expense' ? 'amount-expense' : 'amount-income'}`}>
                          {t.type === 'expense' ? '-' : '+'}
                          {formatCents(t.amount, currencySymbol)}
                        </span>
                      </div>
                      <div className="tx-actions">
                        <button
                          className="btn btn-ghost btn-icon btn-sm"
                          aria-label="编辑"
                          onClick={() => openEdit(t)}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          className="btn btn-ghost btn-icon btn-sm"
                          aria-label="删除"
                          onClick={() => setPendingDelete(t)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <TransactionFilterSheet open={filterOpen} onClose={() => setFilterOpen(false)} />

      <TransactionSheet
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        editing={editing}
      />

      <Dialog
        open={Boolean(pendingDelete)}
        title="删除这笔账单？"
        onClose={() => setPendingDelete(null)}
        actions={
          <>
            <button className="btn" onClick={() => setPendingDelete(null)}>
              取消
            </button>
            <button className="btn btn-danger" onClick={() => void handleDelete()}>
              删除
            </button>
          </>
        }
      >
        {pendingDelete ? (
          <>
            {data.categoryName(pendingDelete.subCategoryId ?? pendingDelete.categoryId)} ·{' '}
            {formatCents(pendingDelete.amount, currencySymbol)}。删除后 5 秒内可撤销。
          </>
        ) : null}
      </Dialog>
    </>
  );
}
