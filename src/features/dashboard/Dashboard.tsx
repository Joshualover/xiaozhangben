import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowDownRight,
  ArrowUpRight,
  Minus,
  PiggyBank,
  Plus,
  Receipt,
  TriangleAlert,
} from 'lucide-react';
import { useLedger } from '@/store/useLedgerStore';
import { useLedgerData } from '@/hooks/useLedgerData';
import { Donut } from '@/components/Donut';
import { IconTile } from '@/components/Icon';
import { Empty, Progress } from '@/components/UI';
import { CHART_COLORS } from '@/db/seed';
import { changeRate, formatCents, formatCentsCompact } from '@/domain/money';
import { formatDateLabel, formatMonthLabel } from '@/domain/period';
import type { Transaction } from '@/types';

export function Dashboard({ onAdd }: { onAdd: () => void }) {
  const data = useLedgerData();
  const currencySymbol = useLedger((s) => s.currencySymbol);
  const navigate = useNavigate();

  const { totals, prevTotals } = data;

  const expenseDelta = changeRate(totals.expense, prevTotals.expense);
  const incomeDelta = changeRate(totals.income, prevTotals.income);
  const balanceDelta = changeRate(totals.balance, prevTotals.balance);

  const ringData = useMemo(
    () =>
      data.expenseTop.map((s, i) => {
        const cat = data.categoryById.get(s.categoryId);
        return {
          name: s.categoryId === '__others__' ? '其他' : (cat?.name ?? '未分类'),
          value: s.amount,
          color: s.categoryId === '__others__' ? '#B4B2A9' : (cat?.color ?? CHART_COLORS[i % CHART_COLORS.length]),
          percent: s.percent,
        };
      }),
    [data],
  );

  const recent = useMemo(
    () => [...data.transactions].sort((a, b) => b.occurredAt - a.occurredAt).slice(0, 5),
    [data.transactions],
  );

  const budget = data.totalBudgetProgress;
  const monthLabel = formatMonthLabel(data.month);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-title">首页</div>
          <div className="page-sub">{monthLabel} · 数据全部保存在本机</div>
        </div>
        <button className="btn btn-sm btn-primary" onClick={onAdd}>
          <Plus size={14} /> 记一笔
        </button>
      </div>

      {budget && budget.percent >= 80 ? (
        <div className={`alert-bar ${budget.percent >= 100 ? 'alert-danger' : 'alert-warn'}`}>
          <TriangleAlert size={16} />
          <span>
            {budget.percent >= 100
              ? `本月预算已超支 ${formatCents(Math.abs(budget.remaining), currencySymbol)}`
              : `本月预算已使用 ${budget.percent.toFixed(0)}%，注意控制开支`}
          </span>
        </div>
      ) : null}

      <div className="overview">
        <StatCell
          label="本月支出"
          value={formatCentsCompact(totals.expense, currencySymbol)}
          delta={expenseDelta}
          deltaInvert
          onClick={() => navigate('/transactions')}
        />
        <StatCell
          label="本月收入"
          value={formatCentsCompact(totals.income, currencySymbol)}
          delta={incomeDelta}
          onClick={() => navigate('/transactions')}
        />
        <StatCell
          label="本月结余"
          value={formatCentsCompact(totals.balance, currencySymbol)}
          delta={balanceDelta}
          wide
          onClick={() => navigate('/transactions')}
        />
      </div>

      {budget ? (
        <div className="card">
          <div className="card-head">
            <span className="card-title">本月预算</span>
            <span className="card-hint num">
              已用 {formatCents(budget.used, currencySymbol)} / {formatCents(budget.budget.amount, currencySymbol)}
            </span>
          </div>
          <Progress percent={budget.percent} level={budget.level} />
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginTop: 8,
              fontSize: 12,
              color: 'var(--text-2)',
            }}
          >
            <span className={`badge ${budget.level === 'danger' ? 'badge-danger' : budget.level === 'warn' ? 'badge-warn' : 'badge-muted'}`}>
              {budget.percent.toFixed(1)}%
            </span>
            <span className="num">
              {budget.remaining >= 0
                ? `剩余 ${formatCents(budget.remaining, currencySymbol)}`
                : `超支 ${formatCents(Math.abs(budget.remaining), currencySymbol)}`}
            </span>
          </div>
          {data.categoryBudgetProgress.length > 0 ? (
            <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
              {data.categoryBudgetProgress.slice(0, 3).map((b) => {
                const cat = b.budget.categoryId ? data.categoryById.get(b.budget.categoryId) : undefined;
                return (
                  <div key={b.budget.id}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: 12,
                        marginBottom: 5,
                        color: 'var(--text-2)',
                      }}
                    >
                      <span>{cat?.name ?? '分类'} </span>
                      <span className="num">
                        {formatCents(b.used, currencySymbol)} / {formatCents(b.budget.amount, currencySymbol)}
                      </span>
                    </div>
                    <Progress percent={b.percent} level={b.level} />
                  </div>
                );
              })}
              <Link to="/settings" className="btn btn-ghost btn-sm" style={{ justifyContent: 'flex-start', paddingLeft: 0 }}>
                管理预算 →
              </Link>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="card">
          <div className="card-head">
            <span className="card-title">本月预算</span>
          </div>
          <Empty
            icon={<PiggyBank size={22} />}
            title="还没有设置预算"
            desc="设一个月度总额，首页会在快超支时提醒你。"
            action={
              <Link to="/settings" className="btn btn-sm">
                去设置预算
              </Link>
            }
          />
        </div>
      )}

      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <span className="card-title">支出构成</span>
            <Link to="/reports" className="card-hint">
              查看统计 →
            </Link>
          </div>
          {ringData.length === 0 ? (
            <Empty
              icon={<Receipt size={22} />}
              title="本月还没有支出"
              desc="记下第一笔支出，这里会显示分类占比。"
            />
          ) : (
            <div className="ring-wrap">
              <Donut segments={ringData} size={172} thickness={28}>
                <span className="ring-center-label">本月支出</span>
                <span className="ring-center-value">{formatCentsCompact(totals.expense, currencySymbol)}</span>
              </Donut>
              <div className="legend">
                {ringData.map((d) => (
                  <button
                    key={d.name}
                    className="legend-item"
                    onClick={() =>
                      navigate(
                        d.name === '其他' ? '/transactions' : `/transactions?keyword=${encodeURIComponent(d.name)}`,
                      )
                    }
                  >
                    <span className="legend-dot" style={{ background: d.color }} />
                    <span className="legend-name">{d.name}</span>
                    <span className="legend-value num">{formatCents(d.value, currencySymbol)}</span>
                    <span className="legend-percent">{d.percent.toFixed(1)}%</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-head">
            <span className="card-title">最近记录</span>
            <Link to="/transactions" className="card-hint">
              全部账单 →
            </Link>
          </div>
          {recent.length === 0 ? (
            <Empty
              icon={<Receipt size={22} />}
              title="还没有任何记录"
              desc="点击「记一笔」开始，或到设置里载入一份示例数据先看看效果。"
              action={
                <button className="btn btn-sm btn-primary" onClick={onAdd}>
                  <Plus size={14} /> 记一笔
                </button>
              }
            />
          ) : (
            <div className="tx-list" style={{ border: 'none' }}>
              {recent.map((t) => {
                const cat =
                  data.categoryById.get(t.subCategoryId ?? t.categoryId) ??
                  data.categoryById.get(t.categoryId);
                return (
                  <RecentRow
                    key={t.id}
                    tx={t}
                    icon={cat?.icon}
                    color={cat?.color ?? '#888780'}
                    name={cat?.name ?? '未分类'}
                    symbol={currencySymbol}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function StatCell({
  label,
  value,
  delta,
  deltaInvert = false,
  wide = false,
  onClick,
}: {
  label: string;
  value: string;
  delta: number | null;
  deltaInvert?: boolean;
  wide?: boolean;
  onClick?: () => void;
}) {
  const dir = delta === null ? 'flat' : delta > 0.05 ? 'up' : delta < -0.05 ? 'down' : 'flat';
  // 支出上升是「坏」事，用红色；支出下降是好事，用绿色。收入相反。
  const tone =
    dir === 'flat'
      ? 'is-flat'
      : deltaInvert
        ? dir === 'up'
          ? 'is-up'
          : 'is-down'
        : dir === 'up'
          ? 'is-down'
          : 'is-up';

  return (
    <button className={`overview-cell${wide ? ' is-wide' : ''}`} onClick={onClick}>
      <div className="overview-label">{label}</div>
      <div className="overview-value num">{value}</div>
      <div className={`delta ${tone} num`}>
        {dir === 'up' ? <ArrowUpRight size={12} /> : dir === 'down' ? <ArrowDownRight size={12} /> : <Minus size={12} />}
        {delta === null ? '上月无数据' : `较上月 ${Math.abs(delta).toFixed(1)}%`}
      </div>
    </button>
  );
}

function RecentRow({
  tx,
  icon,
  color,
  name,
  symbol,
}: {
  tx: Transaction;
  icon: string | undefined;
  color: string;
  name: string;
  symbol: string;
}) {
  return (
    <div className="tx-item">
      <IconTile name={icon} color={color} small size={32} />
      <div className="tx-main">
        <div className="tx-name">{name}</div>
        <div className="tx-note">{tx.note ?? formatDateLabel(tx.occurredAt)}</div>
      </div>
      <div className="tx-side">
        <span className={`tx-amount ${tx.type === 'expense' ? 'amount-expense' : 'amount-income'}`}>
          {tx.type === 'expense' ? '-' : '+'}
          {formatCents(tx.amount, symbol)}
        </span>
        <span className="tx-meta">{formatDateLabel(tx.occurredAt)}</span>
      </div>
    </div>
  );
}
