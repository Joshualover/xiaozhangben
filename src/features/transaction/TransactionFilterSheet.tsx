import { useMemo } from 'react';
import { useLedger } from '@/store/useLedgerStore';
import { Sheet, Segmented } from '@/components/UI';
import { IconTile } from '@/components/Icon';
import { EMPTY_FILTER } from '@/types';
import type { TxType } from '@/types';

/** 账单筛选面板 —— 组合条件 + 一键清空 */
export function TransactionFilterSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const categories = useLedger((s) => s.categories);
  const accounts = useLedger((s) => s.accounts);
  const tags = useLedger((s) => s.tags);
  const filter = useLedger((s) => s.filter);
  const setFilter = useLedger((s) => s.setFilter);
  const resetFilter = useLedger((s) => s.resetFilter);

  const roots = useMemo(
    () =>
      categories
        .filter((c) => c.parentId === null && !c.hidden)
        .filter((c) => filter.type === 'all' || c.type === filter.type)
        .sort((a, b) => a.sort - b.sort),
    [categories, filter.type],
  );

  const toYuan = (cents: number | null) => (cents === null ? '' : String(cents / 100));
  const fromYuan = (v: string): number | null => {
    if (!v.trim()) return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="筛选账单"
      labelledBy="filter-sheet-title"
      footer={
        <>
          <button className="btn" onClick={resetFilter}>
            清空条件
          </button>
          <div style={{ flex: 1 }} />
          <button className="btn btn-primary" onClick={onClose}>
            查看结果
          </button>
        </>
      }
    >
      <div className="filter-panel">
        <div className="field">
          <span className="field-label">类型</span>
          <Segmented
            value={filter.type}
            onChange={(v) => setFilter({ type: v as TxType | 'all', categoryId: null })}
            options={[
              { value: 'all', label: '全部' },
              { value: 'expense', label: '支出' },
              { value: 'income', label: '收入' },
            ]}
          />
        </div>

        <div className="field">
          <span className="field-label">分类</span>
          <div className="chip-row">
            <button
              className={`chip${filter.categoryId === null ? ' is-active' : ''}`}
              onClick={() => setFilter({ categoryId: null })}
            >
              不限
            </button>
            {roots.map((c) => (
              <button
                key={c.id}
                className={`chip${filter.categoryId === c.id ? ' is-active' : ''}`}
                onClick={() => setFilter({ categoryId: filter.categoryId === c.id ? null : c.id })}
              >
                <IconTile name={c.icon} color={c.color} size={16} small />
                {c.name}
              </button>
            ))}
          </div>
        </div>

        <div className="form-row cols-2">
          <div className="field">
            <label className="field-label" htmlFor="f-account">
              账户
            </label>
            <select
              id="f-account"
              className="select"
              value={filter.accountId ?? ''}
              onChange={(e) => setFilter({ accountId: e.target.value || null })}
            >
              <option value="">全部账户</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <span className="field-label">金额区间（元）</span>
            <div className="input-group">
              <input
                className="input"
                type="number"
                min={0}
                placeholder="最低"
                aria-label="最低金额"
                value={toYuan(filter.minAmount)}
                onChange={(e) => setFilter({ minAmount: fromYuan(e.target.value) })}
              />
              <span style={{ color: 'var(--text-3)' }}>–</span>
              <input
                className="input"
                type="number"
                min={0}
                placeholder="最高"
                aria-label="最高金额"
                value={toYuan(filter.maxAmount)}
                onChange={(e) => setFilter({ maxAmount: fromYuan(e.target.value) })}
              />
            </div>
          </div>
        </div>

        <div className="form-row cols-2">
          <div className="field">
            <label className="field-label" htmlFor="f-from">
              起始日期
            </label>
            <input
              id="f-from"
              className="input"
              type="date"
              value={filter.from ?? ''}
              onChange={(e) => setFilter({ from: e.target.value || null })}
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="f-to">
              截止日期
            </label>
            <input
              id="f-to"
              className="input"
              type="date"
              value={filter.to ?? ''}
              onChange={(e) => setFilter({ to: e.target.value || null })}
            />
          </div>
        </div>
        <p className="field-hint" style={{ marginTop: -6 }}>
          日期范围在当前查看的月份内生效；要看其他月份，请先在账单页切换月份。
        </p>

        {tags.length > 0 ? (
          <div className="field">
            <span className="field-label">标签（需同时包含）</span>
            <div className="chip-row">
              {tags.map((t) => (
                <button
                  key={t.id}
                  className={`chip${filter.tagIds.includes(t.id) ? ' is-active' : ''}`}
                  onClick={() =>
                    setFilter({
                      tagIds: filter.tagIds.includes(t.id)
                        ? filter.tagIds.filter((x) => x !== t.id)
                        : [...filter.tagIds, t.id],
                    })
                  }
                >
                  {t.name}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p className="field-hint">还没有标签。在记账时添加标签后即可用于筛选。</p>
        )}

        <button
          className="btn btn-ghost btn-sm"
          style={{ justifyContent: 'flex-start', paddingLeft: 0 }}
          onClick={() => {
            setFilter({ ...EMPTY_FILTER });
          }}
        >
          重置为默认（保留当前月份）
        </button>
      </div>
    </Sheet>
  );
}
