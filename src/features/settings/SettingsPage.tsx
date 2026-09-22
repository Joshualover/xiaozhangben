import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Download,
  FileSpreadsheet,
  FolderCog,
  Moon,
  Sparkles,
  Sun,
  Tags,
  Trash2,
  Upload,
  Wallet,
} from 'lucide-react';
import { useLedger } from '@/store/useLedgerStore';
import { useLedgerData } from '@/hooks/useLedgerData';
import { IconTile } from '@/components/Icon';
import { Dialog, Progress, Segmented, Sheet, Switch } from '@/components/UI';
import { CategoryManager } from '@/features/category/CategoryManager';
import { PinSheet, type PinSheetMode } from '@/features/lock/PinSheet';
import {
  parseTransactionCsv,
  toImportTemplateCsv,
  transactionsToCsv,
  type ParsedTxRow,
} from '@/lib/csv';
import { download, readFileAsText, todayStamp, uid } from '@/lib/id';
import { centsToInputValue, formatCents, parseAmountExpression } from '@/domain/money';
import { formatMonthLabel } from '@/domain/period';
import {
  DEFAULT_LEDGER_ID,
  SCHEMA_VERSION,
  type ColorScheme,
  type LedgerSnapshot,
  type ThemeMode,
  type Transaction,
} from '@/types';

export function SettingsPage() {
  const data = useLedgerData();
  const theme = useLedger((s) => s.theme);
  const colorScheme = useLedger((s) => s.colorScheme);
  const currencySymbol = useLedger((s) => s.currencySymbol);
  const updateSettings = useLedger((s) => s.updateSettings);
  const transactions = useLedger((s) => s.transactions);
  const tags = useLedger((s) => s.tags);
  const importSnapshot = useLedger((s) => s.importSnapshot);
  const exportSnapshot = useLedger((s) => s.exportSnapshot);
  const clearAll = useLedger((s) => s.clearAll);
  const loadDemoData = useLedger((s) => s.loadDemoData);
  const pushToast = useLedger((s) => s.pushToast);
  const removeTag = useLedger((s) => s.removeTag);
  const lockEnabled = useLedger((s) => s.lockEnabled);
  const lockNow = useLedger((s) => s.lockNow);

  const jsonInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  const [categoryOpen, setCategoryOpen] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [pinMode, setPinMode] = useState<PinSheetMode | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearConfirmText, setClearConfirmText] = useState('');
  const [csvPreview, setCsvPreview] = useState<{ rows: ParsedTxRow[]; name: string } | null>(null);
  const [pendingJson, setPendingJson] = useState<LedgerSnapshot | null>(null);

  const budget = data.totalBudgetProgress;
  const monthLabel = formatMonthLabel(data.month);

  const themeOptions = useMemo(
    () =>
      [
        { value: 'light' as ThemeMode, label: '浅色' },
        { value: 'dark' as ThemeMode, label: '深色' },
        { value: 'system' as ThemeMode, label: '跟随系统' },
      ],
    [],
  );

  const exportJson = () => {
    const snapshot = exportSnapshot();
    download(
      `ledger-备份-${todayStamp()}.json`,
      JSON.stringify(snapshot, null, 2),
      'application/json;charset=utf-8',
    );
    pushToast({ message: '已导出完整备份', tone: 'success' });
  };

  const exportCsvAll = () => {
    const csv = transactionsToCsv(transactions, {
      categoryPath: data.categoryPath,
      accountName: data.accountName,
      tagNames: data.tagNames,
    });
    download(`ledger-账单-${todayStamp()}.csv`, csv, 'text/csv;charset=utf-8');
    pushToast({ message: `已导出 ${transactions.length} 条记录`, tone: 'success' });
  };

  const handleJsonFile = async (file: File) => {
    try {
      const text = await readFileAsText(file);
      const parsed = JSON.parse(text) as LedgerSnapshot;
      if (!parsed || !Array.isArray(parsed.transactions) || !Array.isArray(parsed.categories)) {
        throw new Error('文件结构不完整');
      }
      if (parsed.schemaVersion !== SCHEMA_VERSION) {
        pushToast({
          message: `备份版本为 v${parsed.schemaVersion}，当前应用为 v${SCHEMA_VERSION}，尝试兼容导入`,
          tone: 'danger',
        });
      }
      setPendingJson(parsed);
    } catch (err) {
      pushToast({ message: `导入失败：${(err as Error).message}`, tone: 'danger' });
    }
  };

  const handleCsvFile = async (file: File) => {
    const text = await readFileAsText(file);
    const result = parseTransactionCsv(text);
    if (result.rows.length === 0) {
      pushToast({ message: '文件里没有解析到数据行', tone: 'danger' });
      return;
    }
    setCsvPreview({ rows: result.rows, name: file.name });
  };

  const confirmCsvImport = async () => {
    if (!csvPreview) return;
    const { categories, accounts } = data;
    const now = Date.now();

    const resolveCategory = (parentName: string, childName: string) => {
      let parent = categories.find((c) => c.parentId === null && c.name === parentName);
      if (!parent) parent = categories.find((c) => c.parentId === null && c.name === '其他');
      const child = childName
        ? categories.find((c) => c.parentId === parent?.id && c.name === childName)
        : undefined;
      return { parentId: parent?.id, childId: child?.id };
    };

    const toAdd: Transaction[] = [];
    for (const row of csvPreview.rows) {
      if (!row.ok || !row.data) continue;
      const { parentId, childId } = resolveCategory(row.data.parentName, row.data.childName);
      const account =
        accounts.find((a) => a.name === row.data!.accountName) ?? accounts[0];
      toAdd.push({
        id: uid(),
        type: row.data.type,
        amount: row.data.amount,
        categoryId: parentId ?? categories[0]?.id ?? '',
        subCategoryId: childId,
        accountId: account?.id ?? '',
        occurredAt: Number(row.data.date),
        note: row.data.note || undefined,
        tagIds: [],
        ledgerId: DEFAULT_LEDGER_ID,
        createdAt: now,
        updatedAt: now,
      });
    }

    try {
      const snapshot = exportSnapshot();
      const merged: LedgerSnapshot = {
        ...snapshot,
        transactions: [...snapshot.transactions, ...toAdd],
      };
      await importSnapshot(merged, 'replace');
      pushToast({ message: `已导入 ${toAdd.length} 条，跳过 ${csvPreview.rows.length - toAdd.length} 条`, tone: 'success' });
      setCsvPreview(null);
    } catch (err) {
      pushToast({ message: `导入失败：${(err as Error).message}`, tone: 'danger' });
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-title">设置</div>
          <div className="page-sub">所有数据保存在本机浏览器，不上传任何服务器</div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <span className="card-title">来一版示例数据</span>
        </div>
        <p className="setting-desc" style={{ marginBottom: 12 }}>
          生成近 3 个月的模拟账单与预算，用来预览图表和统计效果。随时可以在下方清空。
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            className="btn btn-sm"
            onClick={async () => {
              if (data.categories.length === 0) {
                pushToast({ message: '分类尚未就绪，请稍后再试', tone: 'danger' });
                return;
              }
              await loadDemoData();
              pushToast({ message: '已载入示例数据', tone: 'success' });
            }}
          >
            <Sparkles size={14} /> 载入示例数据
          </button>
          <span style={{ fontSize: 12, color: 'var(--text-3)', alignSelf: 'center' }}>
            当前共 {transactions.length} 条账单
          </span>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <span className="card-title">本月预算</span>
          <span className="card-hint">{monthLabel}</span>
        </div>
        {budget ? (
          <>
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
              <span className="num">
                {formatCents(budget.used, currencySymbol)} / {formatCents(budget.budget.amount, currencySymbol)}
              </span>
              <span className="num">{budget.percent.toFixed(1)}%</span>
            </div>
          </>
        ) : (
          <p className="setting-desc">还没有设置本月预算。设一个总额，首页会在接近或超出时提醒你。</p>
        )}
        <button className="btn btn-sm" style={{ marginTop: 12 }} onClick={() => setBudgetOpen(true)}>
          <Wallet size={14} /> 设置预算
        </button>
      </div>

      <div className="card">
        <div className="card-head">
          <span className="card-title">外观</span>
        </div>
        <div className="setting-row">
          <div>
            <div className="setting-label">主题</div>
            <div className="setting-desc">跟随系统时会随操作系统的深浅色自动切换。</div>
          </div>
          <div className="setting-control">
            <Segmented
              value={theme}
              onChange={(v) => void updateSettings({ theme: v })}
              options={themeOptions}
            />
          </div>
        </div>
        <div className="setting-row">
          <div>
            <div className="setting-label">收支配色</div>
            <div className="setting-desc">
              中文习惯为「支出红、收入绿」。若习惯海外应用，可切换为相反配色。
            </div>
          </div>
          <div className="setting-control">
            <Segmented
              value={colorScheme}
              onChange={(v) => void updateSettings({ colorScheme: v as ColorScheme })}
              options={[
                { value: 'cn' as ColorScheme, label: '中文习惯' },
                { value: 'intl' as ColorScheme, label: '国际配色' },
              ]}
            />
          </div>
        </div>
        <div className="setting-row">
          <div>
            <div className="setting-label">货币符号</div>
            <div className="setting-desc">仅影响金额展示，不参与计算。</div>
          </div>
          <div className="setting-control">
            <select
              className="select"
              style={{ width: 110 }}
              value={currencySymbol}
              onChange={(e) => void updateSettings({ currencySymbol: e.target.value })}
            >
              {['¥', '$', '€', '£', '₩', '₹'].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 4, fontSize: 11, color: 'var(--text-3)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Sun size={12} /> 浅色
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Moon size={12} /> 深色
          </span>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <span className="card-title">分类与标签</span>
        </div>
        <div className="setting-row">
          <div>
            <div className="setting-label">分类管理</div>
            <div className="setting-desc">
              当前 {data.categories.filter((c) => c.parentId === null).length} 个一级分类 ·{' '}
              {data.categories.filter((c) => c.parentId !== null).length} 个细分
            </div>
          </div>
          <div className="setting-control">
            <button className="btn btn-sm" onClick={() => setCategoryOpen(true)}>
              <FolderCog size={14} /> 管理
            </button>
          </div>
        </div>
        <div className="setting-row" style={{ alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <div className="setting-label">标签</div>
            {tags.length === 0 ? (
              <div className="setting-desc">还没有标签。记账时在「标签」栏输入即可创建。</div>
            ) : (
              <div className="chip-row" style={{ marginTop: 8 }}>
                {tags.map((t) => (
                  <span className="chip" key={t.id}>
                    <Tags size={11} />
                    {t.name}
                    <button
                      className="chip-remove"
                      aria-label={`删除标签 ${t.name}`}
                      onClick={() => {
                        void removeTag(t.id);
                        pushToast({ message: `已删除标签「${t.name}」`, tone: 'danger' });
                      }}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <span className="card-title">数据管理</span>
          <span className="card-hint">数据属于你自己</span>
        </div>

        <div className="setting-row">
          <div>
            <div className="setting-label">导出账单 CSV</div>
            <div className="setting-desc">
              带 BOM 的 UTF-8，Excel 直接打开不乱码，金额列可参与计算。
            </div>
          </div>
          <div className="setting-control">
            <button className="btn btn-sm" onClick={exportCsvAll} disabled={transactions.length === 0}>
              <FileSpreadsheet size={14} /> 导出
            </button>
          </div>
        </div>

        <div className="setting-row">
          <div>
            <div className="setting-label">导出完整备份 JSON</div>
            <div className="setting-desc">包含账单、账户、分类、标签、预算与设置，可用于换设备迁移。</div>
          </div>
          <div className="setting-control">
            <button className="btn btn-sm" onClick={exportJson}>
              <Download size={14} /> 备份
            </button>
          </div>
        </div>

        <div className="setting-row">
          <div>
            <div className="setting-label">导入 JSON 备份</div>
            <div className="setting-desc">
              导入前建议先导出当前数据。导入时可选择覆盖或合并（按 id 去重）。
            </div>
          </div>
          <div className="setting-control">
            <button className="btn btn-sm" onClick={() => jsonInputRef.current?.click()}>
              <Upload size={14} /> 选择文件
            </button>
            <input
              ref={jsonInputRef}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleJsonFile(f);
                e.target.value = '';
              }}
            />
          </div>
        </div>

        <div className="setting-row">
          <div>
            <div className="setting-label">批量导入 CSV</div>
            <div className="setting-desc">
              先解析预览，逐行校验，错误行会被标出并跳过 —— 不会因为一行脏数据导致整批失败。
            </div>
          </div>
          <div className="setting-control" style={{ display: 'flex', gap: 6 }}>
            <button
              className="btn btn-sm"
              onClick={() => download('记账导入模板.csv', toImportTemplateCsv(), 'text/csv;charset=utf-8')}
            >
              模板
            </button>
            <button className="btn btn-sm" onClick={() => csvInputRef.current?.click()}>
              <Upload size={14} /> 导入
            </button>
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleCsvFile(f);
                e.target.value = '';
              }}
            />
          </div>
        </div>

        <div className="setting-row">
          <div>
            <div className="setting-label" style={{ color: 'var(--danger)' }}>
              清空全部数据
            </div>
            <div className="setting-desc">
              删除本机所有账单、账户、分类与预算，恢复到初始状态。此操作不可撤销。
            </div>
          </div>
          <div className="setting-control">
            <button className="btn btn-sm btn-danger" onClick={() => setClearOpen(true)}>
              <Trash2 size={14} /> 清空
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <span className="card-title">关于</span>
        </div>
        <p className="setting-desc" style={{ maxWidth: 'none' }}>
          小账本 Ledger v0.1.0 · 数据格式 schema v{SCHEMA_VERSION}
          <br />
          纯本地存储：账单存在浏览器的 IndexedDB 里，不做任何网络请求。清除浏览器数据会一并清除账单，
          请定期用「导出完整备份」保存到自己的硬盘上。
        </p>
        <div className="setting-row">
          <div>
            <div className="setting-label">本地密码锁</div>
            <div className="setting-desc">
              开启后每次进入需输入 4-6 位数字密码。注意：它只是遮住界面，
              账单数据仍以明文存在本机，不提供加密保护，请勿使用重要密码。
            </div>
          </div>
          <div className="setting-control">
            <Switch
              checked={lockEnabled}
              onChange={(v) => setPinMode(v ? 'enable' : 'disable')}
              label={lockEnabled ? '关闭本地密码锁' : '开启本地密码锁'}
            />
          </div>
        </div>

        {lockEnabled ? (
          <div className="setting-row">
            <div>
              <div className="setting-label">密码管理</div>
              <div className="setting-desc">
                修改密码需要先输入当前密码。密码只存在本机，忘记后无法找回。
              </div>
            </div>
            <div className="setting-control setting-control-row">
              <button type="button" className="btn btn-sm" onClick={() => setPinMode('change')}>
                修改密码
              </button>
              <button type="button" className="btn btn-sm" onClick={lockNow}>
                立即上锁
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <CategoryManager open={categoryOpen} onClose={() => setCategoryOpen(false)} />

      <PinSheet
        open={pinMode !== null}
        mode={pinMode ?? 'enable'}
        onClose={() => setPinMode(null)}
      />

      <BudgetSheet open={budgetOpen} onClose={() => setBudgetOpen(false)} />

      <ImportJsonDialog
        snapshot={pendingJson}
        onClose={() => setPendingJson(null)}
        onConfirm={async (mode) => {
          if (!pendingJson) return;
          await importSnapshot(pendingJson, mode);
          pushToast({
            message: mode === 'replace' ? '已覆盖导入' : '已合并导入',
            tone: 'success',
          });
          setPendingJson(null);
        }}
      />

      <Sheet
        open={Boolean(csvPreview)}
        onClose={() => setCsvPreview(null)}
        title="导入预览"
        labelledBy="csv-preview-title"
        footer={
          <>
            <button className="btn" onClick={() => setCsvPreview(null)}>
              取消
            </button>
            <div style={{ flex: 1 }} />
            <button
              className="btn btn-primary"
              disabled={!csvPreview?.rows.some((r) => r.ok)}
              onClick={() => void confirmCsvImport()}
            >
              导入 {csvPreview?.rows.filter((r) => r.ok).length ?? 0} 条
            </button>
          </>
        }
      >
        {csvPreview ? (
          <>
            <p style={{ fontSize: 13, marginBottom: 12 }}>
              文件 <b>{csvPreview.name}</b>：共 {csvPreview.rows.length} 行，
              可导入{' '}
              <b style={{ color: 'var(--success)' }}>{csvPreview.rows.filter((r) => r.ok).length}</b> 行，
              有问题{' '}
              <b style={{ color: 'var(--danger)' }}>{csvPreview.rows.filter((r) => !r.ok).length}</b> 行。
            </p>
            <div className="table-scroll" style={{ maxHeight: 320, overflowY: 'auto' }}>
              <table className="preview">
                <thead>
                  <tr>
                    <th>行</th>
                    <th>日期</th>
                    <th>类型</th>
                    <th>分类</th>
                    <th>金额</th>
                    <th>账户</th>
                    <th>校验</th>
                  </tr>
                </thead>
                <tbody>
                  {csvPreview.rows.slice(0, 200).map((r) => (
                    <tr key={r.rowNumber} className={r.ok ? '' : 'is-bad'}>
                      <td>{r.rowNumber}</td>
                      <td>{r.raw[0] ?? ''}</td>
                      <td>{r.raw[2] ?? ''}</td>
                      <td>{[r.raw[3], r.raw[4]].filter(Boolean).join(' / ')}</td>
                      <td className="num">{r.raw[5] ?? ''}</td>
                      <td>{r.raw[6] ?? ''}</td>
                      <td className={r.ok ? '' : 'err'}>
                        {r.ok ? (r.errors.length ? r.errors.join('；') : '通过') : r.errors.join('；')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {csvPreview.rows.length > 200 ? (
              <p className="field-hint" style={{ marginTop: 8 }}>
                仅预览前 200 行，导入时会处理全部数据。
              </p>
            ) : null}
          </>
        ) : null}
      </Sheet>

      <Dialog
        open={clearOpen}
        title="清空全部数据？"
        onClose={() => {
          setClearOpen(false);
          setClearConfirmText('');
        }}
        actions={
          <>
            <button
              className="btn"
              onClick={() => {
                setClearOpen(false);
                setClearConfirmText('');
              }}
            >
              取消
            </button>
            <button
              className="btn btn-danger"
              disabled={clearConfirmText !== '确认清空'}
              onClick={async () => {
                download(`ledger-自动备份-${todayStamp()}.json`, JSON.stringify(exportSnapshot(), null, 2), 'application/json');
                await clearAll();
                setClearOpen(false);
                setClearConfirmText('');
                pushToast({ message: '已清空并自动备份了一份数据', tone: 'success' });
              }}
            >
              确认清空
            </button>
          </>
        }
      >
        <p>
          将删除 <b>{transactions.length}</b> 条账单、{data.accounts.length} 个账户、
          {data.categories.length} 个分类和全部预算。此操作不可撤销。
        </p>
        <p style={{ marginTop: 10 }}>
          执行前会先自动导出一份 JSON 备份到你的下载目录。
        </p>
        <div className="field" style={{ marginTop: 14 }}>
          <label className="field-label" htmlFor="clear-confirm">
            请输入「确认清空」以继续
          </label>
          <input
            id="clear-confirm"
            className="input"
            value={clearConfirmText}
            placeholder="确认清空"
            onChange={(e) => setClearConfirmText(e.target.value)}
          />
        </div>
      </Dialog>
    </>
  );
}

function BudgetSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const data = useLedgerData();
  const saveBudget = useLedger((s) => s.saveBudget);
  const pushToast = useLedger((s) => s.pushToast);

  const current = data.totalBudgetProgress;
  const [value, setValue] = useState('');
  const openedRef = useRef(false);

  // 打开时把当前预算填进去，直接改数字即可，不用重新输入
  useEffect(() => {
    if (!open) {
      openedRef.current = false;
      return;
    }
    if (openedRef.current) return;
    openedRef.current = true;
    setValue(current ? centsToInputValue(current.budget.amount) : '');
  }, [open, current]);

  const save = async () => {
    const cents = parseAmountExpression(value);
    if (cents === null) {
      pushToast({ message: '请输入有效的预算金额', tone: 'danger' });
      return;
    }
    await saveBudget(data.month, null, cents);
    pushToast({ message: '月度预算已保存', tone: 'success' });
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`设置 ${data.month} 月度预算`}
      labelledBy="budget-sheet-title"
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
      <div className="field" style={{ marginBottom: 12 }}>
        <label className="field-label" htmlFor="budget-total">
          本月总预算（元）
        </label>
        <input
          id="budget-total"
          className="input num"
          inputMode="decimal"
          placeholder="如：8000"
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/[^\d.+]/g, ''))}
        />
        <span className="field-hint">
          {current ? `当前预算 ${formatCents(current.budget.amount)}，已用 ${current.percent.toFixed(1)}%` : '留空或填 0 表示取消预算'}
        </span>
      </div>
      {data.categoryBudgetProgress.length > 0 ? (
        <div>
          <div className="field-label" style={{ marginBottom: 8 }}>
            分类预算
          </div>
          {data.categoryBudgetProgress.map((b) => {
            const cat = b.budget.categoryId ? data.categoryById.get(b.budget.categoryId) : undefined;
            return (
              <div key={b.budget.id} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                  <IconTile name={cat?.icon} color={cat?.color ?? '#888780'} size={22} small />
                  <span style={{ fontSize: 13 }}>{cat?.name ?? '分类'}</span>
                  <span className="num" style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-2)' }}>
                    {formatCents(b.used)} / {formatCents(b.budget.amount)}
                  </span>
                </div>
                <Progress percent={b.percent} level={b.level} />
              </div>
            );
          })}
          <p className="field-hint">
            分类预算在示例数据中预置，可在分类管理里配合使用；单独编辑分类预算计划在后续版本提供。
          </p>
        </div>
      ) : null}
    </Sheet>
  );
}

function ImportJsonDialog({
  snapshot,
  onClose,
  onConfirm,
}: {
  snapshot: LedgerSnapshot | null;
  onClose: () => void;
  onConfirm: (mode: 'replace' | 'merge') => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open={Boolean(snapshot)}
      title="导入备份"
      onClose={onClose}
      actions={
        <>
          <button className="btn" onClick={onClose} disabled={busy}>
            取消
          </button>
          <button
            className="btn"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await onConfirm('merge');
              setBusy(false);
            }}
          >
            合并导入
          </button>
          <button
            className="btn btn-primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await onConfirm('replace');
              setBusy(false);
            }}
          >
            覆盖导入
          </button>
        </>
      }
    >
      {snapshot ? (
        <>
          备份中包含 <b>{snapshot.transactions.length}</b> 条账单、
          <b>{snapshot.accounts?.length ?? 0}</b> 个账户、<b>{snapshot.categories?.length ?? 0}</b> 个分类，
          导出于 {new Date(snapshot.exportedAt).toLocaleString('zh-CN')}。
          <p style={{ marginTop: 10 }}>
            <b>覆盖导入</b>会先清空当前全部数据；<b>合并导入</b>会按 id 去重后追加，
            相同 id 的记录以备份文件为准。
          </p>
        </>
      ) : null}
    </Dialog>
  );
}
