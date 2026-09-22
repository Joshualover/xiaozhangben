import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, TrendingDown, TrendingUp } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useLedger } from '@/store/useLedgerStore';
import { useLedgerData } from '@/hooks/useLedgerData';
import { useChartTheme } from '@/hooks/useChartTheme';
import { IconTile } from '@/components/Icon';
import { Empty, Progress, Segmented } from '@/components/UI';
import { CHART_COLORS } from '@/db/seed';
import { formatCents, formatCentsCompact } from '@/domain/money';
import { buildBuckets, GRANULARITY_COUNT, GRANULARITY_LABEL, type Granularity } from '@/domain/trend';
import { formatMonthLabel, shiftMonth } from '@/domain/period';
import type { TxType } from '@/types';

export function ReportsPage() {
  const data = useLedgerData();
  const currencySymbol = useLedger((s) => s.currencySymbol);
  const selectedMonth = useLedger((s) => s.selectedMonth);
  const setSelectedMonth = useLedger((s) => s.setSelectedMonth);
  const chart = useChartTheme();
  const navigate = useNavigate();

  const [granularity, setGranularity] = useState<Granularity>('month');
  const [rankType, setRankType] = useState<TxType>('expense');

  const buckets = useMemo(
    () => buildBuckets(data.transactions, granularity, GRANULARITY_COUNT[granularity]),
    [data.transactions, granularity],
  );

  const chartData = useMemo(
    () =>
      buckets.map((b) => ({
        ...b,
        expenseYuan: b.expense / 100,
        incomeYuan: b.income / 100,
      })),
    [buckets],
  );

  const stats = rankType === 'expense' ? data.expenseStats : data.incomeStats;
  const rankMax = stats[0]?.amount ?? 0;

  const trendTotals = useMemo(
    () => ({
      expense: buckets.reduce((a, b) => a + b.expense, 0),
      income: buckets.reduce((a, b) => a + b.income, 0),
    }),
    [buckets],
  );

  const bestBucket = useMemo(
    () => buckets.reduce((a, b) => (b.balance > a.balance ? b : a), buckets[0]),
    [buckets],
  );

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-title">统计</div>
          <div className="page-sub">
            {formatMonthLabel(selectedMonth)} · 共 {data.transactions.length} 条历史记录
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <span className="card-title">收支趋势</span>
          <Segmented
            value={granularity}
            onChange={(v) => setGranularity(v)}
            options={(['day', 'week', 'month', 'year'] as Granularity[]).map((g) => ({
              value: g,
              label: GRANULARITY_LABEL[g],
            }))}
          />
        </div>

        {data.transactions.length === 0 ? (
          <Empty
            icon={<BarChart3 size={22} />}
            title="还没有可统计的数据"
            desc="记满几笔之后，趋势图就能看出你的消费节奏。"
          />
        ) : (
          <>
            <div style={{ width: '100%', height: 248 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 6, right: 6, left: -14, bottom: 0 }}>
                  <CartesianGrid stroke={chart.grid} vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: chart.axis, fontSize: 11 }}
                    axisLine={{ stroke: chart.grid }}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fill: chart.axis, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={54}
                    tickFormatter={(v: number) => (v >= 10000 ? `${(v / 10000).toFixed(1)}万` : String(v))}
                  />
                  <Tooltip
                    cursor={{ fill: chart.grid, opacity: 0.4 }}
                    contentStyle={{
                      background: chart.tooltipBg,
                      border: `1px solid ${chart.tooltipBorder}`,
                      borderRadius: 10,
                      fontSize: 12,
                      color: chart.tooltipText,
                      padding: '8px 11px',
                    }}
                    labelStyle={{ color: chart.tooltipText, fontWeight: 500, marginBottom: 4 }}
                    formatter={(value: number, name: string) => [
                      `¥${value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                      name,
                    ]}
                    labelFormatter={(label: string) => {
                      const b = buckets.find((x) => x.label === label);
                      return b?.fullLabel ?? label;
                    }}
                  />
                  <Bar dataKey="expenseYuan" name="支出" fill={chart.expense} radius={[3, 3, 0, 0]} maxBarSize={22} />
                  <Bar dataKey="incomeYuan" name="收入" fill={chart.income} radius={[3, 3, 0, 0]} maxBarSize={22} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 18,
                marginTop: 12,
                paddingTop: 12,
                borderTop: '1px solid var(--border)',
                fontSize: 12,
                color: 'var(--text-2)',
              }}
            >
              <span className="num">
                区间支出 <b className="amount-expense">{formatCents(trendTotals.expense, currencySymbol)}</b>
              </span>
              <span className="num">
                区间收入 <b className="amount-income">{formatCents(trendTotals.income, currencySymbol)}</b>
              </span>
              <span className="num">
                结余{' '}
                <b>{formatCents(trendTotals.income - trendTotals.expense, currencySymbol)}</b>
              </span>
              {bestBucket ? (
                <span className="num">表现最好：{bestBucket.fullLabel}（结余 {formatCentsCompact(bestBucket.balance, currencySymbol)}）</span>
              ) : null}
            </div>
          </>
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <span className="card-title">{formatMonthLabel(selectedMonth)}分类排行</span>
          <Segmented
            value={rankType}
            tone={rankType}
            onChange={setRankType}
            options={[
              { value: 'expense', label: '支出' },
              { value: 'income', label: '收入' },
            ]}
          />
        </div>

        {stats.length === 0 ? (
          <Empty
            icon={rankType === 'expense' ? <TrendingDown size={22} /> : <TrendingUp size={22} />}
            title={`本月还没有${rankType === 'expense' ? '支出' : '收入'}记录`}
            action={
              <button
                className="btn btn-sm"
                onClick={() => {
                  setSelectedMonth(shiftMonth(selectedMonth, -1));
                  setGranularity('month');
                }}
              >
                看上月
              </button>
            }
          />
        ) : (
          <div className="rank-list">
            {stats.slice(0, 10).map((s, i) => {
              const cat = data.categoryById.get(s.categoryId);
              const color = cat?.color ?? CHART_COLORS[i % CHART_COLORS.length];
              return (
                <button
                  className="rank-item"
                  key={s.categoryId}
                  onClick={() => navigate(`/transactions?keyword=${encodeURIComponent(cat?.name ?? '')}`)}
                >
                  <span className="rank-index">{i + 1}</span>
                  <IconTile name={cat?.icon} color={color} small size={28} />
                  <span className="rank-body">
                    <span className="rank-name-row">
                      <span className="rank-name">{cat?.name ?? '未分类'}</span>
                      <span className="rank-amount">{formatCents(s.amount, currencySymbol)}</span>
                    </span>
                    <span className="rank-bar">
                      <span
                        className="rank-bar-fill"
                        style={{
                          width: `${rankMax === 0 ? 0 : (s.amount / rankMax) * 100}%`,
                          background: color,
                          display: 'block',
                        }}
                      />
                    </span>
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      color: 'var(--text-3)',
                      textAlign: 'right',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {s.percent.toFixed(1)}%
                    <br />
                    {s.count} 笔
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <span className="card-title">支出占比明细</span>
          <span className="card-hint">点击可跳转账单页查看</span>
        </div>
        {data.expenseStats.length === 0 ? (
          <Empty icon={<BarChart3 size={22} />} title="本月还没有支出" />
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {data.expenseStats.slice(0, 8).map((s, i) => {
              const cat = data.categoryById.get(s.categoryId);
              return (
                <div key={s.categoryId}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 12,
                      marginBottom: 5,
                    }}
                  >
                    <span>{cat?.name ?? '未分类'}</span>
                    <span className="num" style={{ color: 'var(--text-2)' }}>
                      {formatCents(s.amount, currencySymbol)} · {s.percent.toFixed(1)}%
                    </span>
                  </div>
                  <Progress percent={s.percent} />
                  <div style={{ height: 0 }} data-idx={i} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
