import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Plus, Trash2 } from 'lucide-react';
import { useLedger } from '@/store/useLedgerStore';
import { AmountInput } from '@/components/AmountInput';
import { IconTile } from '@/components/Icon';
import { Dialog, Segmented, Sheet } from '@/components/UI';
import { centsToInputValue, formatCents, parseAmountExpression } from '@/domain/money';
import { fromDateTimeInput, toDateTimeInput } from '@/domain/period';
import type { Transaction, TxType } from '@/types';

interface Props {
  open: boolean;
  onClose: () => void;
  editing?: Transaction | null;
  defaultType?: TxType;
}

export function TransactionSheet({ open, onClose, editing, defaultType = 'expense' }: Props) {
  const categories = useLedger((s) => s.categories);
  const accounts = useLedger((s) => s.accounts);
  const tags = useLedger((s) => s.tags);
  const transactions = useLedger((s) => s.transactions);
  const currencySymbol = useLedger((s) => s.currencySymbol);
  const lastUsedAccountId = useLedger((s) => s.lastUsedAccountId);
  const lastCategoryByType = useLedger((s) => s.lastCategoryByType);
  const addTransaction = useLedger((s) => s.addTransaction);
  const updateTransaction = useLedger((s) => s.updateTransaction);
  const removeTransaction = useLedger((s) => s.removeTransaction);
  const restoreTransaction = useLedger((s) => s.restoreTransaction);
  const pushToast = useLedger((s) => s.pushToast);
  const ensureTag = useLedger((s) => s.ensureTag);

  const [type, setType] = useState<TxType>(defaultType);
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [subCategoryId, setSubCategoryId] = useState<string | null>(null);
  const [accountId, setAccountId] = useState('');
  const [occurredAt, setOccurredAt] = useState(() => toDateTimeInput(Date.now()));
  const [note, setNote] = useState('');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [error, setError] = useState('');
  const [savedCount, setSavedCount] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const firstRun = useRef(true);

  const activeAccount = accountId || lastUsedAccountId || accounts[0]?.id || '';

  const roots = useMemo(
    () =>
      categories
        .filter((c) => c.type === type && c.parentId === null && !c.hidden)
        .sort((a, b) => a.sort - b.sort),
    [categories, type],
  );

  const children = useMemo(
    () =>
      categoryId
        ? categories.filter((c) => c.parentId === categoryId && !c.hidden).sort((a, b) => a.sort - b.sort)
        : [],
    [categories, categoryId],
  );

  /** 常用分类：按近 30 天使用频次置顶 —— 直接降低录入成本 */
  const frequentIds = useMemo(() => {
    const since = Date.now() - 30 * 86400000;
    const counter = new Map<string, number>();
    for (const t of transactions) {
      if (t.occurredAt < since) continue;
      counter.set(t.categoryId, (counter.get(t.categoryId) ?? 0) + 1);
    }
    return counter;
  }, [transactions]);

  const orderedRoots = useMemo(() => {
    const used = roots.filter((c) => (frequentIds.get(c.id) ?? 0) > 0);
    const unused = roots.filter((c) => (frequentIds.get(c.id) ?? 0) === 0);
    used.sort((a, b) => (frequentIds.get(b.id) ?? 0) - (frequentIds.get(a.id) ?? 0));
    return [...used, ...unused];
  }, [roots, frequentIds]);

  // 打开时重置或填充表单
  useEffect(() => {
    if (!open) {
      firstRun.current = true;
      return;
    }
    if (!firstRun.current) return;
    firstRun.current = false;

    if (editing) {
      setType(editing.type);
      setAmount(centsToInputValue(editing.amount));
      setCategoryId(editing.categoryId);
      setSubCategoryId(editing.subCategoryId ?? null);
      setAccountId(editing.accountId);
      setOccurredAt(toDateTimeInput(editing.occurredAt));
      setNote(editing.note ?? '');
      setTagIds(editing.tagIds);
    } else {
      setType(defaultType);
      setAmount('');
      setCategoryId(null);
      setSubCategoryId(null);
      setAccountId(lastUsedAccountId ?? accounts[0]?.id ?? '');
      setOccurredAt(toDateTimeInput(Date.now()));
      setNote('');
      setTagIds([]);
    }
    setTagInput('');
    setError('');
    setSavedCount(0);
  }, [open, editing, defaultType, lastUsedAccountId, accounts]);

  const selectedParent = categoryId ? categories.find((c) => c.id === categoryId) : undefined;

  const handleSave = async (closeAfter: boolean) => {
    const cents = parseAmountExpression(amount);
    if (cents === null) {
      setError('请输入有效的金额');
      return;
    }
    if (!categoryId) {
      setError('请选择分类');
      return;
    }
    if (!activeAccount) {
      setError('请先创建一个账户');
      return;
    }

    const payload = {
      type,
      amount: cents,
      categoryId,
      subCategoryId: subCategoryId ?? undefined,
      accountId: activeAccount,
      occurredAt: fromDateTimeInput(occurredAt),
      note: note.trim() || undefined,
      tagIds,
    };

    if (editing) {
      await updateTransaction(editing.id, payload);
      pushToast({ message: '已更新', tone: 'success' });
      onClose();
      return;
    }

    const created = await addTransaction(payload);
    setSavedCount((n) => n + 1);
    pushToast({
      message: `已记录 ${formatCents(cents, currencySymbol)} ${type === 'expense' ? '支出' : '收入'}`,
      tone: 'success',
      actionLabel: '撤销',
      onAction: () => {
        void removeTransaction(created.id);
      },
    });

    setAmount('');
    setNote('');
    setTagIds([]);
    setTagInput('');
    setSubCategoryId(null);
    setError('');
    setOccurredAt(toDateTimeInput(Date.now()));
    if (closeAfter) onClose();
  };

  const handleDelete = async () => {
    if (!editing) return;
    const snapshot = { ...editing };
    await removeTransaction(snapshot.id);
    setConfirmDelete(false);
    onClose();
    pushToast({
      message: '已删除',
      tone: 'danger',
      actionLabel: '撤销',
      onAction: () => {
        void restoreTransaction(snapshot);
      },
    });
  };

  const addTagByName = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const existing = tags.find((t) => t.name === trimmed);
    const tag = existing ?? (await ensureTag(trimmed));
    setTagIds((ids) => (ids.includes(tag.id) ? ids : [...ids, tag.id]));
    setTagInput('');
  };

  const preview = parseAmountExpression(amount);

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title={editing ? '编辑账单' : '记一笔'}
        labelledBy="tx-sheet-title"
        footer={
          editing ? (
            <>
              <button className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={15} /> 删除
              </button>
              <div style={{ flex: 1 }} />
              <button className="btn btn-primary" onClick={() => void handleSave(true)}>
                <Check size={16} /> 保存
              </button>
            </>
          ) : (
            <>
              <button className="btn" onClick={() => void handleSave(false)}>
                保存并继续
              </button>
              <div style={{ flex: 1 }} />
              <button className="btn btn-primary" onClick={() => void handleSave(true)}>
                <Check size={16} /> 保存
              </button>
            </>
          )
        }
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <Segmented
            value={type}
            tone={type}
            onChange={(v) => {
              setType(v);
              // 切换收支时分类不再适用，回退到该类型上次使用的分类
              setCategoryId(lastCategoryByType[v] ?? null);
              setSubCategoryId(null);
              if (error) setError('');
            }}
            options={[
              { value: 'expense', label: '支出' },
              { value: 'income', label: '收入' },
            ]}
          />
          {savedCount > 0 && !editing ? (
            <span className="badge badge-accent">本次已记 {savedCount} 笔</span>
          ) : null}
        </div>

        <AmountInput
          value={amount}
          onChange={(v) => {
            setAmount(v);
            if (error) setError('');
          }}
          symbol={currencySymbol}
          autoFocus={!editing}
          error={Boolean(error) && preview === null}
          onSubmit={() => void handleSave(false)}
        />

        <div style={{ marginTop: 6, marginBottom: 14 }}>
          <div className="field-label" style={{ marginBottom: 8 }}>
            分类
          </div>
          <div className="cat-grid">
            {orderedRoots.map((c) => (
              <button
                key={c.id}
                className={`cat-cell${categoryId === c.id ? ' is-active' : ''}`}
                onClick={() => {
                  setCategoryId(c.id);
                  setSubCategoryId(null);
                  if (error) setError('');
                }}
              >
                <IconTile name={c.icon} color={c.color} />
                <span className="cat-name">{c.name}</span>
              </button>
            ))}
          </div>
        </div>

        {children.length > 0 ? (
          <div style={{ marginBottom: 14 }}>
            <div className="field-label" style={{ marginBottom: 8 }}>
              {selectedParent?.name} · 细分（可选）
            </div>
            <div className="chip-row">
              {children.map((c) => (
                <button
                  key={c.id}
                  className={`chip${subCategoryId === c.id ? ' is-active' : ''}`}
                  onClick={() => setSubCategoryId(subCategoryId === c.id ? null : c.id)}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="form-row cols-2" style={{ marginBottom: 14 }}>
          <div className="field">
            <label className="field-label" htmlFor="tx-account">
              账户
            </label>
            <select
              id="tx-account"
              className="select"
              value={activeAccount}
              onChange={(e) => setAccountId(e.target.value)}
            >
              {accounts
                .filter((a) => !a.archived)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="tx-time">
              日期时间
            </label>
            <input
              id="tx-time"
              className="input"
              type="datetime-local"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
            />
          </div>
        </div>

        <div className="field" style={{ marginBottom: 10 }}>
          <label className="field-label" htmlFor="tx-note">
            备注
          </label>
          <input
            id="tx-note"
            className="input"
            type="text"
            maxLength={100}
            placeholder="可选，如「公司楼下」"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        <div className="field" style={{ marginBottom: 6 }}>
          <label className="field-label" htmlFor="tx-tag">
            标签
          </label>
          {tagIds.length > 0 ? (
            <div className="chip-row" style={{ marginBottom: 6 }}>
              {tagIds.map((id) => {
                const tag = tags.find((t) => t.id === id);
                return (
                  <span key={id} className="chip is-active">
                    {tag?.name ?? '未知'}
                    <button
                      className="chip-remove"
                      aria-label={`移除标签 ${tag?.name ?? ''}`}
                      onClick={() => setTagIds((ids) => ids.filter((x) => x !== id))}
                    >
                      ×
                    </button>
                  </span>
                );
              })}
            </div>
          ) : null}
          <div className="input-group">
            <input
              id="tx-tag"
              className="input"
              type="text"
              list="tag-suggestions"
              placeholder="输入后回车添加，最多 5 个"
              value={tagInput}
              disabled={tagIds.length >= 5}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void addTagByName(tagInput);
                }
              }}
            />
            <button
              className="btn btn-icon"
              aria-label="添加标签"
              disabled={!tagInput.trim() || tagIds.length >= 5}
              onClick={() => void addTagByName(tagInput)}
            >
              <Plus size={16} />
            </button>
          </div>
          <datalist id="tag-suggestions">
            {tags.map((t) => (
              <option key={t.id} value={t.name} />
            ))}
          </datalist>
        </div>

        {error ? (
          <p style={{ color: 'var(--danger)', fontSize: 12, marginTop: 8 }} role="alert">
            {error}
          </p>
        ) : null}

        {!editing ? (
          <p className="field-hint" style={{ marginTop: 10 }}>
            提示：按 Enter 可连续记录下一笔，金额支持算式（如 28+15）。
          </p>
        ) : null}
      </Sheet>

      <Dialog
        open={confirmDelete}
        title="删除这笔账单？"
        onClose={() => setConfirmDelete(false)}
        actions={
          <>
            <button className="btn" onClick={() => setConfirmDelete(false)}>
              取消
            </button>
            <button className="btn btn-danger" onClick={() => void handleDelete()}>
              删除
            </button>
          </>
        }
      >
        删除后 5 秒内可从提示条撤销。此操作会影响统计与账户余额。
      </Dialog>
    </>
  );
}
