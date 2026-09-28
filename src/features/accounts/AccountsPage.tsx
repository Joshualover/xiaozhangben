import { useEffect, useRef, useState } from 'react';
import { ArrowLeftRight, Landmark, Pencil, Plus, Trash2, Wallet } from 'lucide-react';
import { useLedger } from '@/store/useLedgerStore';
import { useLedgerData } from '@/hooks/useLedgerData';
import { Icon, IconTile } from '@/components/Icon';
import { Dialog, Empty, Sheet, Switch } from '@/components/UI';
import { COLOR_OPTIONS, ICON_KEYS } from '@/lib/icons';
import { centsToInputValue, formatCents, parseAmountExpression } from '@/domain/money';
import { formatDateLabel, fromDateTimeInput, toDateTimeInput } from '@/domain/period';
import type { Account, AccountKind } from '@/types';

const KIND_LABEL: Record<AccountKind, string> = {
  cash: '现金',
  wechat: '微信',
  alipay: '支付宝',
  debit: '储蓄卡',
  credit: '信用卡',
  other: '其他',
};

export function AccountsPage() {
  const data = useLedgerData();
  const currencySymbol = useLedger((s) => s.currencySymbol);
  const removeAccount = useLedger((s) => s.removeAccount);
  const removeTransfer = useLedger((s) => s.removeTransfer);
  const pushToast = useLedger((s) => s.pushToast);

  const [editing, setEditing] = useState<Account | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Account | null>(null);
  const [reassignTo, setReassignTo] = useState('');

  const active = data.accounts.filter((a) => !a.archived);
  const recentTransfers = [...data.transfers].sort((a, b) => b.occurredAt - a.occurredAt).slice(0, 8);

  const relatedCount = pendingDelete
    ? data.transactions.filter((t) => t.accountId === pendingDelete.id).length +
      data.transfers.filter(
        (t) => t.fromAccountId === pendingDelete.id || t.toAccountId === pendingDelete.id,
      ).length
    : 0;

  /** 能承接其历史记录的其他账户（不含自身） */
  const reassignCandidates = pendingDelete ? active.filter((a) => a.id !== pendingDelete.id) : [];
  /** 有记录却无处可转移：此时删除按钮会一直是禁用态，必须说清原因并给出下一步 */
  const blockedByNoTarget = relatedCount > 0 && reassignCandidates.length === 0;

  const handleDelete = async () => {
    if (!pendingDelete) return;
    try {
      await removeAccount(pendingDelete.id, relatedCount > 0 ? reassignTo || undefined : undefined);
      pushToast({ message: `已删除账户「${pendingDelete.name}」`, tone: 'success' });
      setPendingDelete(null);
      setReassignTo('');
    } catch (err) {
      pushToast({ message: (err as Error).message, tone: 'danger' });
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-title">账户</div>
          <div className="page-sub">
            转账不计入收支统计，只影响账户余额
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-sm" onClick={() => setTransferOpen(true)} disabled={active.length < 2}>
            <ArrowLeftRight size={14} /> 转账
          </button>
          <button
            className="btn btn-sm btn-primary"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus size={14} /> 账户
          </button>
        </div>
      </div>

      <div className="asset-card">
        <div className="asset-label">总资产（仅统计计入总额的账户）</div>
        <div className="asset-value num">{formatCents(data.assets, currencySymbol)}</div>
        <div style={{ display: 'flex', gap: 18, marginTop: 10, fontSize: 12, color: 'var(--text-2)' }}>
          <span className="num">
            账户数 <b>{active.filter((a) => a.includeInTotal).length}</b>
          </span>
          <span className="num">
            信用卡待还{' '}
            <b className="amount-expense">
              {formatCents(
                Math.abs(
                  active
                    .filter((a) => a.kind === 'credit')
                    .reduce((acc, a) => acc + Math.min(0, data.balances.get(a.id) ?? 0), 0),
                ),
                currencySymbol,
              )}
            </b>
          </span>
        </div>
      </div>

      {active.length === 0 ? (
        <div className="card">
          <Empty
            icon={<Wallet size={22} />}
            title="还没有账户"
            desc="添加现金、微信、支付宝或银行卡，才能把账单记到具体账户上。"
          />
        </div>
      ) : (
        <div className="account-grid">
          {active.map((a) => {
            const balance = data.balances.get(a.id) ?? a.initialBalance;
            const isCreditDebt = a.kind === 'credit' && balance < 0;
            return (
              <div className="account-card" key={a.id}>
                <IconTile name={a.icon} color={a.color} size={36} />
                <div style={{ minWidth: 0 }}>
                  <div className="account-name">{a.name}</div>
                  <div className="account-kind">
                    {KIND_LABEL[a.kind]}
                    {!a.includeInTotal ? ' · 不计入总额' : ''}
                  </div>
                </div>
                <div className="account-balance">
                  <div className={isCreditDebt ? 'amount-expense' : ''}>
                    {formatCents(balance, currencySymbol)}
                  </div>
                  {isCreditDebt ? (
                    <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 400 }}>待还</div>
                  ) : null}
                </div>
                <div className="tx-actions">
                  <button
                    className="btn btn-ghost btn-icon btn-sm"
                    aria-label={`编辑 ${a.name}`}
                    onClick={() => {
                      setEditing(a);
                      setFormOpen(true);
                    }}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    className="btn btn-ghost btn-icon btn-sm"
                    aria-label={`删除 ${a.name}`}
                    onClick={() => {
                      setPendingDelete(a);
                      setReassignTo('');
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="card">
        <div className="card-head">
          <span className="card-title">最近转账</span>
          <span className="card-hint">不参与收支统计</span>
        </div>
        {recentTransfers.length === 0 ? (
          <Empty
            icon={<ArrowLeftRight size={22} />}
            title="还没有转账记录"
            desc="把微信余额转到银行卡这类操作记在这里，收支数据才不会被污染。"
            action={
              active.length >= 2 ? (
                <button className="btn btn-sm" onClick={() => setTransferOpen(true)}>
                  记一笔转账
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="tx-list" style={{ border: 'none' }}>
            {recentTransfers.map((t) => {
              const from = data.accountById.get(t.fromAccountId);
              const to = data.accountById.get(t.toAccountId);
              return (
                <div className="tx-item" key={t.id}>
                  <IconTile name="arrow-left-right" color="#888780" small size={32} />
                  <div className="tx-main">
                    <div className="tx-name">
                      {from?.name ?? '未知'} → {to?.name ?? '未知'}
                    </div>
                    <div className="tx-note">
                      {[formatDateLabel(t.occurredAt), t.note].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <div className="tx-side">
                    <span className="tx-amount">{formatCents(t.amount, currencySymbol)}</span>
                  </div>
                  <div className="tx-actions">
                    <button
                      className="btn btn-ghost btn-icon btn-sm"
                      aria-label="删除转账"
                      onClick={() => {
                        void removeTransfer(t.id);
                        pushToast({ message: '已删除转账记录', tone: 'danger' });
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <AccountSheet open={formOpen} onClose={() => setFormOpen(false)} editing={editing} />
      <TransferSheet open={transferOpen} onClose={() => setTransferOpen(false)} />

      <Dialog
        open={Boolean(pendingDelete)}
        title={`删除账户「${pendingDelete?.name ?? ''}」？`}
        onClose={() => setPendingDelete(null)}
        actions={
          <>
            <button className="btn" onClick={() => setPendingDelete(null)}>
              {blockedByNoTarget ? '知道了' : '取消'}
            </button>
            {blockedByNoTarget ? (
              <button
                className="btn btn-primary"
                onClick={() => {
                  setPendingDelete(null);
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                <Plus size={14} /> 新建账户
              </button>
            ) : (
              <button
                className="btn btn-danger"
                disabled={relatedCount > 0 && !reassignTo}
                onClick={() => void handleDelete()}
              >
                确认删除
              </button>
            )}
          </>
        }
      >
        {blockedByNoTarget ? (
          <>
            该账户下有 <b>{relatedCount}</b> 条记录，删除前必须把它们转移到另一个账户，
            否则会留下找不到账户的悬空账单。
            <p style={{ marginTop: 10 }}>
              但目前<b>没有其他账户</b>可以承接这些记录，所以暂时删不掉。
              先新建一个账户，再回来处理。
            </p>
          </>
        ) : relatedCount > 0 ? (
          <>
            该账户下有 <b>{relatedCount}</b> 条记录，删除前必须把它们转移到另一个账户，
            否则会留下找不到账户的悬空账单。
            <div className="field" style={{ marginTop: 12 }}>
              <label className="field-label" htmlFor="reassign-account">
                转移到
              </label>
              <select
                id="reassign-account"
                className="select"
                value={reassignTo}
                onChange={(e) => setReassignTo(e.target.value)}
              >
                <option value="">请选择目标账户</option>
                {reassignCandidates.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          </>
        ) : (
          <>该账户没有任何关联记录，可以安全删除。</>
        )}
      </Dialog>
    </>
  );
}

function AccountSheet({
  open,
  onClose,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  editing: Account | null;
}) {
  const upsertAccount = useLedger((s) => s.upsertAccount);
  const pushToast = useLedger((s) => s.pushToast);

  const [name, setName] = useState('');
  const [kind, setKind] = useState<AccountKind>('other');
  const [balance, setBalance] = useState('');
  const [icon, setIcon] = useState('wallet');
  const [color, setColor] = useState(COLOR_OPTIONS[5]);
  const [includeInTotal, setIncludeInTotal] = useState(true);
  const [error, setError] = useState('');
  const firstRun = useRef(true);

  useEffect(() => {
    if (!open) {
      firstRun.current = true;
      return;
    }
    if (!firstRun.current) return;
    firstRun.current = false;
    if (editing) {
      setName(editing.name);
      setKind(editing.kind);
      setBalance(centsToInputValue(editing.initialBalance));
      setIcon(editing.icon);
      setColor(editing.color);
      setIncludeInTotal(editing.includeInTotal);
    } else {
      setName('');
      setKind('other');
      setBalance('');
      setIcon('wallet');
      setColor(COLOR_OPTIONS[5]);
      setIncludeInTotal(true);
    }
    setError('');
  }, [open, editing]);

  const save = async () => {
    if (!name.trim()) {
      setError('请填写账户名称');
      return;
    }
    const initialBalance =
      kind === 'credit' ? -(parseAmountExpression(balance) ?? 0) : (parseAmountExpression(balance) ?? 0);
    await upsertAccount({
      id: editing?.id,
      name: name.trim(),
      kind,
      initialBalance: balance.trim() ? initialBalance : (editing?.initialBalance ?? 0),
      icon,
      color,
      includeInTotal,
    });
    pushToast({ message: editing ? '账户已更新' : '账户已创建', tone: 'success' });
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? '编辑账户' : '新增账户'}
      labelledBy="account-sheet-title"
      footer={
        <>
          <button className="btn" onClick={onClose}>
            取消
          </button>
          <div style={{ flex: 1 }} />
          <button className="btn btn-primary" onClick={() => void save()}>
            保存
          </button>
        </>
      }
    >
      <div className="form-row cols-2" style={{ marginBottom: 14 }}>
        <div className="field">
          <label className="field-label" htmlFor="acc-name">
            账户名称
          </label>
          <input
            id="acc-name"
            className="input"
            value={name}
            maxLength={20}
            placeholder="如：招行储蓄卡"
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError('');
            }}
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="acc-kind">
            类型
          </label>
          <select
            id="acc-kind"
            className="select"
            value={kind}
            onChange={(e) => setKind(e.target.value as AccountKind)}
          >
            {Object.entries(KIND_LABEL).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="field" style={{ marginBottom: 14 }}>
        <label className="field-label" htmlFor="acc-balance">
          初始余额（元）
        </label>
        <input
          id="acc-balance"
          className="input num"
          inputMode="decimal"
          placeholder="0.00"
          value={balance}
          onChange={(e) => setBalance(e.target.value.replace(/[^\d.+]/g, ''))}
        />
        <span className="field-hint">
          {kind === 'credit'
            ? '信用卡请填欠款金额，系统会记为负余额并在账户页显示「待还」。'
            : '填当前余额，之后的账单会在此基础上自动累加。'}
        </span>
      </div>

      <div className="field" style={{ marginBottom: 14 }}>
        <span className="field-label">图标</span>
        <div className="cat-grid">
          {ICON_KEYS.slice(0, 18).map((k) => (
            <button
              key={k}
              className={`cat-cell${icon === k ? ' is-active' : ''}`}
              aria-label={`选择图标 ${k}`}
              onClick={() => setIcon(k)}
            >
              <span className="cat-icon is-sm" style={{ background: color }}>
                <Icon name={k} size={15} strokeWidth={2} />
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="field" style={{ marginBottom: 14 }}>
        <span className="field-label">颜色</span>
        <div className="chip-row">
          {COLOR_OPTIONS.map((c) => (
            <button
              key={c}
              aria-label={`选择颜色 ${c}`}
              onClick={() => setColor(c)}
              style={{
                width: 28,
                height: 28,
                borderRadius: 9,
                background: c,
                border: color === c ? '2px solid var(--text-1)' : '1px solid var(--border)',
              }}
            />
          ))}
        </div>
      </div>

      <div className="setting-row">
        <div>
          <div className="setting-label">计入总资产</div>
          <div className="setting-desc">关闭后该账户仍可记账，但不参与首页总资产计算。</div>
        </div>
        <div className="setting-control">
          <Switch checked={includeInTotal} onChange={setIncludeInTotal} label="计入总资产" />
        </div>
      </div>

      {error ? (
        <p style={{ color: 'var(--danger)', fontSize: 12 }} role="alert">
          {error}
        </p>
      ) : null}
    </Sheet>
  );
}

function TransferSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const accounts = useLedger((s) => s.accounts);
  const addTransfer = useLedger((s) => s.addTransfer);
  const pushToast = useLedger((s) => s.pushToast);
  const currencySymbol = useLedger((s) => s.currencySymbol);

  const active = accounts.filter((a) => !a.archived);
  const [fromId, setFromId] = useState(active[0]?.id ?? '');
  const [toId, setToId] = useState(active[1]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [occurredAt, setOccurredAt] = useState(() => toDateTimeInput(Date.now()));
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setFromId(active[0]?.id ?? '');
    setToId(active[1]?.id ?? '');
    setAmount('');
    setNote('');
    setError('');
    setOccurredAt(toDateTimeInput(Date.now()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const save = async () => {
    const cents = parseAmountExpression(amount);
    if (cents === null) {
      setError('请输入有效的转账金额');
      return;
    }
    if (!fromId || !toId) {
      setError('请选择转出与转入账户');
      return;
    }
    if (fromId === toId) {
      setError('转出与转入账户不能相同');
      return;
    }
    await addTransfer({
      fromAccountId: fromId,
      toAccountId: toId,
      amount: cents,
      occurredAt: fromDateTimeInput(occurredAt),
      note: note.trim() || undefined,
    });
    pushToast({ message: `已转账 ${formatCents(cents, currencySymbol)}`, tone: 'success' });
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="账户转账"
      labelledBy="transfer-sheet-title"
      footer={
        <>
          <button className="btn" onClick={onClose}>
            取消
          </button>
          <div style={{ flex: 1 }} />
          <button className="btn btn-primary" onClick={() => void save()}>
            <Landmark size={15} /> 确认转账
          </button>
        </>
      }
    >
      <div className="form-row cols-2" style={{ marginBottom: 14 }}>
        <div className="field">
          <label className="field-label" htmlFor="tf-from">
            转出账户
          </label>
          <select id="tf-from" className="select" value={fromId} onChange={(e) => setFromId(e.target.value)}>
            {active.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="tf-to">
            转入账户
          </label>
          <select id="tf-to" className="select" value={toId} onChange={(e) => setToId(e.target.value)}>
            {active.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="field" style={{ marginBottom: 14 }}>
        <label className="field-label" htmlFor="tf-amount">
          金额（元）
        </label>
        <input
          id="tf-amount"
          className="input num"
          inputMode="decimal"
          placeholder="0.00"
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value.replace(/[^\d.+]/g, ''));
            if (error) setError('');
          }}
        />
      </div>

      <div className="form-row cols-2" style={{ marginBottom: 14 }}>
        <div className="field">
          <label className="field-label" htmlFor="tf-time">
            日期时间
          </label>
          <input
            id="tf-time"
            className="input"
            type="datetime-local"
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="tf-note">
            备注
          </label>
          <input
            id="tf-note"
            className="input"
            value={note}
            placeholder="可选"
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </div>

      <p className="field-hint">转账会调整两个账户的余额，但不会出现在收支统计与图表中。</p>

      {error ? (
        <p style={{ color: 'var(--danger)', fontSize: 12, marginTop: 8 }} role="alert">
          {error}
        </p>
      ) : null}
    </Sheet>
  );
}
