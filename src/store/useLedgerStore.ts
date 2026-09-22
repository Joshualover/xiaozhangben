import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  Account,
  Budget,
  Category,
  LedgerSnapshot,
  Settings,
  Tag,
  Transaction,
  Transfer,
  TxFilter,
  TxType,
} from '@/types';
import { DEFAULT_LEDGER_ID, EMPTY_FILTER, SCHEMA_VERSION } from '@/types';
import {
  clearAllData as dbClearAll,
  db,
  ensureSeeded,
  loadSettings,
  saveSettings as dbSaveSettings,
} from '@/db';
import { uid } from '@/lib/id';
import { currentMonthKey } from '@/domain/period';
import { createLockHash, isValidPin, verifyPin } from '@/domain/lock';
import { buildDemoData } from '@/db/demo';

export interface Toast {
  id: string;
  message: string;
  tone: 'default' | 'success' | 'danger';
  actionLabel?: string;
  onAction?: () => void;
}

interface SettingsSlice {
  theme: Settings['theme'];
  colorScheme: Settings['colorScheme'];
  currencySymbol: string;
}

/**
 * 本地密码锁。
 *
 * lockEnabled / lockHash 属于配置：存 IndexedDB，随「导出完整备份」一起走，
 * 换设备导入后锁依然有效。
 *
 * unlocked 是纯内存态，**刻意不进持久化** —— 刷新页面即重新上锁。
 * 若把它写进 localStorage，关掉标签页再打开就能绕过，等于没有锁。
 */
interface LockSlice {
  lockEnabled: boolean;
  lockHash: string | null;
  unlocked: boolean;
}

interface UiSlice {
  selectedMonth: string;
  filter: TxFilter;
  lastUsedAccountId: string | null;
  lastCategoryByType: Record<TxType, string | null>;
}

interface LedgerState extends SettingsSlice, LockSlice, UiSlice {
  ready: boolean;
  categories: Category[];
  accounts: Account[];
  tags: Tag[];
  transactions: Transaction[];
  transfers: Transfer[];
  budgets: Budget[];
  toasts: Toast[];

  init: () => Promise<void>;

  setSelectedMonth: (month: string) => void;
  setFilter: (patch: Partial<TxFilter>) => void;
  resetFilter: () => void;

  addTransaction: (input: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'ledgerId'>) => Promise<Transaction>;
  updateTransaction: (id: string, patch: Partial<Transaction>) => Promise<void>;
  removeTransaction: (id: string) => Promise<void>;
  restoreTransaction: (tx: Transaction) => Promise<void>;

  addTransfer: (input: Omit<Transfer, 'id' | 'createdAt' | 'ledgerId'>) => Promise<void>;
  removeTransfer: (id: string) => Promise<void>;

  saveBudget: (month: string, categoryId: string | null, amount: number) => Promise<void>;
  removeBudget: (id: string) => Promise<void>;

  addCategory: (input: Omit<Category, 'id' | 'isPreset'>) => Promise<void>;
  updateCategory: (id: string, patch: Partial<Category>) => Promise<void>;
  removeCategory: (id: string, reassignTo?: string) => Promise<void>;

  ensureTag: (name: string) => Promise<Tag>;
  removeTag: (id: string) => Promise<void>;

  upsertAccount: (input: Partial<Account> & { name: string }) => Promise<void>;
  removeAccount: (id: string, reassignTo?: string) => Promise<void>;

  loadDemoData: () => Promise<void>;
  importSnapshot: (snapshot: LedgerSnapshot, mode: 'replace' | 'merge') => Promise<void>;
  exportSnapshot: () => LedgerSnapshot;
  clearAll: () => Promise<void>;

  /** 更新外观等设置，同时写入 state 与 IndexedDB，保证两处一致 */
  updateSettings: (patch: Partial<SettingsSlice>) => Promise<void>;

  /** 校验密码；通过则置为已解锁 */
  unlock: (pin: string) => Promise<boolean>;
  /** 首次开启密码锁：写入加盐摘要，并直接置为已解锁 */
  enableLock: (pin: string) => Promise<void>;
  /** 关闭密码锁（需验证当前密码），同时清除已存摘要 */
  disableLock: (pin: string) => Promise<boolean>;
  /** 修改密码（需验证当前密码） */
  changeLockPin: (currentPin: string, nextPin: string) => Promise<boolean>;
  /** 立即上锁（下次进入或刷新后需重新输入） */
  lockNow: () => void;
  /**
   * 忘记密码时的最后出路：清空全部账单数据并解除密码锁。
   * 这是不可撤销操作，调用方必须做二次确认。
   */
  factoryReset: () => Promise<void>;

  pushToast: (t: Omit<Toast, 'id'>) => void;
  dismissToast: (id: string) => void;
}

export const useLedger = create<LedgerState>()(
  persist(
    (set, get) => ({
      ready: false,
      categories: [],
      accounts: [],
      tags: [],
      transactions: [],
      transfers: [],
      budgets: [],
      toasts: [],

      // 以下为 UI 偏好，走 localStorage 持久化
      theme: 'system',
      colorScheme: 'cn',
      currencySymbol: '¥',
      selectedMonth: currentMonthKey(),
      filter: { ...EMPTY_FILTER },
      lastUsedAccountId: null,
      lastCategoryByType: { expense: null, income: null },

      // 密码锁：配置随 IndexedDB 走（可备份），unlocked 只活在内存里
      lockEnabled: false,
      lockHash: null,
      unlocked: false,

      async init() {
        await ensureSeeded();
        const [categories, accounts, tags, transactions, transfers, budgets, settings] =
          await Promise.all([
            db.categories.toArray(),
            db.accounts.toArray(),
            db.tags.toArray(),
            db.transactions.toArray(),
            db.transfers.toArray(),
            db.budgets.toArray(),
            loadSettings(),
          ]);

        set({
          categories,
          accounts,
          tags,
          transactions,
          transfers,
          budgets,
          theme: settings.theme,
          colorScheme: settings.colorScheme,
          currencySymbol: settings.currencySymbol,
          lockEnabled: settings.lockEnabled,
          lockHash: settings.lockHash ?? null,
          ready: true,
        });
      },

      setSelectedMonth(month) {
        set({ selectedMonth: month });
      },

      setFilter(patch) {
        set({ filter: { ...get().filter, ...patch } });
      },

      resetFilter() {
        set({ filter: { ...EMPTY_FILTER } });
      },

      async addTransaction(input) {
        const now = Date.now();
        const tx: Transaction = {
          ...input,
          id: uid(),
          ledgerId: DEFAULT_LEDGER_ID,
          createdAt: now,
          updatedAt: now,
        };
        await db.transactions.add(tx);
        set((s) => ({
          transactions: [...s.transactions, tx],
          lastUsedAccountId: tx.accountId,
          lastCategoryByType: { ...s.lastCategoryByType, [tx.type]: tx.categoryId },
        }));
        return tx;
      },

      async updateTransaction(id, patch) {
        const next = { ...patch, updatedAt: Date.now() };
        await db.transactions.update(id, next);
        set((s) => ({
          transactions: s.transactions.map((t) => (t.id === id ? { ...t, ...next } : t)),
        }));
      },

      async removeTransaction(id) {
        await db.transactions.delete(id);
        set((s) => ({ transactions: s.transactions.filter((t) => t.id !== id) }));
      },

      async restoreTransaction(tx) {
        await db.transactions.put(tx);
        set((s) => ({ transactions: [...s.transactions.filter((t) => t.id !== tx.id), tx] }));
      },

      async addTransfer(input) {
        const transfer: Transfer = {
          ...input,
          id: uid(),
          ledgerId: DEFAULT_LEDGER_ID,
          createdAt: Date.now(),
        };
        await db.transfers.add(transfer);
        set((s) => ({ transfers: [...s.transfers, transfer] }));
      },

      async removeTransfer(id) {
        await db.transfers.delete(id);
        set((s) => ({ transfers: s.transfers.filter((t) => t.id !== id) }));
      },

      async saveBudget(month, categoryId, amount) {
        const existing = get().budgets.find(
          (b) => b.month === month && b.categoryId === categoryId,
        );
        if (amount <= 0) {
          if (existing) await get().removeBudget(existing.id);
          return;
        }
        if (existing) {
          await db.budgets.update(existing.id, { amount });
          set((s) => ({
            budgets: s.budgets.map((b) => (b.id === existing.id ? { ...b, amount } : b)),
          }));
          return;
        }
        const budget: Budget = { id: uid(), month, categoryId, amount };
        await db.budgets.add(budget);
        set((s) => ({ budgets: [...s.budgets, budget] }));
      },

      async removeBudget(id) {
        await db.budgets.delete(id);
        set((s) => ({ budgets: s.budgets.filter((b) => b.id !== id) }));
      },

      async addCategory(input) {
        const category: Category = { ...input, id: uid(), isPreset: false };
        await db.categories.add(category);
        set((s) => ({ categories: [...s.categories, category] }));
      },

      async updateCategory(id, patch) {
        await db.categories.update(id, patch);
        set((s) => ({
          categories: s.categories.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        }));
      },

      /**
       * 删除分类。若有关联账单，必须先把账单转移到 reassignTo，
       * 否则会留下「未分类」的悬空数据 —— 这是数据完整性的关键一步。
       */
      async removeCategory(id, reassignTo) {
        const { categories, transactions } = get();
        const children = categories.filter((c) => c.parentId === id);
        const ids = [id, ...children.map((c) => c.id)];
        const affected = transactions.filter(
          (t) => ids.includes(t.categoryId) || (t.subCategoryId && ids.includes(t.subCategoryId)),
        );

        if (affected.length > 0) {
          if (!reassignTo) throw new Error('该分类下仍有账单，必须先选择转移目标');
          const updates = affected.map((t) => ({
            id: t.id,
            categoryId: t.categoryId === id ? reassignTo : t.categoryId,
            subCategoryId:
              t.subCategoryId && ids.includes(t.subCategoryId) ? undefined : t.subCategoryId,
            updatedAt: Date.now(),
          }));
          await db.transactions.bulkUpdate(
            updates.map((u) => ({ key: u.id, changes: { ...u } })),
          );
        }

        await db.categories.bulkDelete(ids);
        set((s) => ({
          categories: s.categories.filter((c) => !ids.includes(c.id)),
          transactions: s.transactions.map((t) => {
            if (!affected.some((a) => a.id === t.id)) return t;
            return {
              ...t,
              categoryId: t.categoryId === id ? (reassignTo as string) : t.categoryId,
              subCategoryId:
                t.subCategoryId && ids.includes(t.subCategoryId) ? undefined : t.subCategoryId,
            };
          }),
        }));
      },

      async ensureTag(name) {
        const trimmed = name.trim();
        const found = get().tags.find((t) => t.name === trimmed);
        if (found) return found;
        const tag: Tag = { id: uid(), name: trimmed };
        await db.tags.add(tag);
        set((s) => ({ tags: [...s.tags, tag] }));
        return tag;
      },

      async removeTag(id) {
        const { transactions } = get();
        const updates = transactions
          .filter((t) => t.tagIds.includes(id))
          .map((t) => ({ key: t.id, changes: { tagIds: t.tagIds.filter((x) => x !== id), updatedAt: Date.now() } }));
        if (updates.length) await db.transactions.bulkUpdate(updates);
        await db.tags.delete(id);
        set((s) => ({
          tags: s.tags.filter((t) => t.id !== id),
          transactions: s.transactions.map((t) =>
            t.tagIds.includes(id) ? { ...t, tagIds: t.tagIds.filter((x) => x !== id) } : t,
          ),
        }));
      },

      async upsertAccount(input) {
        if (input.id) {
          const { id, ...patch } = input;
          await db.accounts.update(id, patch);
          set((s) => ({
            accounts: s.accounts.map((a) => (a.id === id ? { ...a, ...patch } : a)),
          }));
          return;
        }
        const account: Account = {
          id: uid(),
          name: input.name,
          kind: input.kind ?? 'other',
          initialBalance: input.initialBalance ?? 0,
          icon: input.icon ?? 'wallet',
          color: input.color ?? '#378ADD',
          includeInTotal: input.includeInTotal ?? true,
          archived: false,
        };
        await db.accounts.add(account);
        set((s) => ({ accounts: [...s.accounts, account] }));
      },

      async removeAccount(id, reassignTo) {
        const { transactions, transfers } = get();
        const related =
          transactions.filter((t) => t.accountId === id).length +
          transfers.filter((t) => t.fromAccountId === id || t.toAccountId === id).length;

        if (related > 0) {
          if (!reassignTo) throw new Error('该账户下仍有记录，必须先选择转移目标');
          const txUpdates = transactions
            .filter((t) => t.accountId === id)
            .map((t) => ({ key: t.id, changes: { accountId: reassignTo, updatedAt: Date.now() } }));
          if (txUpdates.length) await db.transactions.bulkUpdate(txUpdates);
          const trUpdates = transfers
            .filter((t) => t.fromAccountId === id || t.toAccountId === id)
            .map((t) => ({
              key: t.id,
              changes: {
                fromAccountId: t.fromAccountId === id ? reassignTo : t.fromAccountId,
                toAccountId: t.toAccountId === id ? reassignTo : t.toAccountId,
              },
            }));
          if (trUpdates.length) await db.transfers.bulkUpdate(trUpdates);
          set((s) => ({
            transactions: s.transactions.map((t) =>
              t.accountId === id ? { ...t, accountId: reassignTo as string } : t,
            ),
            transfers: s.transfers.map((t) => ({
              ...t,
              fromAccountId: t.fromAccountId === id ? (reassignTo as string) : t.fromAccountId,
              toAccountId: t.toAccountId === id ? (reassignTo as string) : t.toAccountId,
            })),
          }));
        }

        await db.accounts.delete(id);
        set((s) => ({ accounts: s.accounts.filter((a) => a.id !== id) }));
      },

      async loadDemoData() {
        const { categories, accounts } = get();
        const demo = buildDemoData(categories, accounts);
        await db.transaction('rw', [db.transactions, db.budgets, db.tags], async () => {
          await db.transactions.bulkAdd(demo.transactions);
          await db.budgets.bulkAdd(demo.budgets);
          await db.tags.bulkAdd(demo.tags);
        });
        set((s) => ({
          transactions: [...s.transactions, ...demo.transactions],
          budgets: [...s.budgets, ...demo.budgets],
          tags: [...s.tags, ...demo.tags],
        }));
      },

      async importSnapshot(snapshot, mode) {
        if (mode === 'replace') {
          await db.transaction(
            'rw',
            [db.transactions, db.transfers, db.budgets, db.tags, db.categories, db.accounts, db.settings],
            async () => {
              await Promise.all([
                db.transactions.clear(),
                db.transfers.clear(),
                db.budgets.clear(),
                db.tags.clear(),
                db.categories.clear(),
                db.accounts.clear(),
              ]);
              await db.categories.bulkAdd(snapshot.categories);
              await db.accounts.bulkAdd(snapshot.accounts);
              await db.tags.bulkAdd(snapshot.tags);
              await db.transactions.bulkAdd(snapshot.transactions);
              await db.transfers.bulkAdd(snapshot.transfers);
              await db.budgets.bulkAdd(snapshot.budgets);
            },
          );
        } else {
          await db.transaction(
            'rw',
            [db.transactions, db.transfers, db.budgets, db.tags, db.categories, db.accounts],
            async () => {
              await bulkUpsert(db.categories, snapshot.categories);
              await bulkUpsert(db.accounts, snapshot.accounts);
              await bulkUpsert(db.tags, snapshot.tags);
              await bulkUpsert(db.transactions, snapshot.transactions);
              await bulkUpsert(db.transfers, snapshot.transfers);
              await bulkUpsert(db.budgets, snapshot.budgets);
            },
          );
        }
        await dbSaveSettings(snapshot.settings);
        await get().init();
      },

      exportSnapshot() {
        const s = get();
        return {
          schemaVersion: SCHEMA_VERSION,
          exportedAt: Date.now(),
          categories: s.categories,
          accounts: s.accounts,
          tags: s.tags,
          transactions: s.transactions,
          transfers: s.transfers,
          budgets: s.budgets,
          settings: {
            theme: s.theme,
            colorScheme: s.colorScheme,
            currencySymbol: s.currencySymbol,
            monthStartDay: 1,
            // 刻意不把密码锁写进备份：密码只存本机且无法找回，
            // 若随备份带走，用户换设备后一旦忘记密码就再也进不去了。
            // 备份必须永远可恢复 —— 锁让用户在新设备重新设即可。
            lockEnabled: false,
          },
        };
      },

      async clearAll() {
        await dbClearAll();
        await get().init();
      },

      async updateSettings(patch) {
        set((s) => ({ ...s, ...patch }));
        await dbSaveSettings(patch);
      },

      async unlock(pin) {
        const { lockHash } = get();
        // 没设过密码就没有可校验的东西 —— 直接放行，避免把用户锁在门外
        if (!lockHash) {
          set({ unlocked: true });
          return true;
        }
        const ok = await verifyPin(pin, lockHash);
        if (ok) set({ unlocked: true });
        return ok;
      },

      async enableLock(pin) {
        if (!isValidPin(pin)) throw new Error('密码需为 4-6 位数字');
        const lockHash = await createLockHash(pin);
        await dbSaveSettings({ lockEnabled: true, lockHash });
        set({ lockEnabled: true, lockHash, unlocked: true });
      },

      async disableLock(pin) {
        const { lockHash } = get();
        if (lockHash && !(await verifyPin(pin, lockHash))) return false;
        // 一并清掉摘要，避免关锁后仍残留可校验的凭据
        await dbSaveSettings({ lockEnabled: false, lockHash: undefined });
        set({ lockEnabled: false, lockHash: null, unlocked: true });
        return true;
      },

      async changeLockPin(currentPin, nextPin) {
        const { lockHash } = get();
        if (!lockHash) throw new Error('尚未开启密码锁');
        if (!(await verifyPin(currentPin, lockHash))) return false;
        if (!isValidPin(nextPin)) throw new Error('密码需为 4-6 位数字');
        const nextHash = await createLockHash(nextPin);
        await dbSaveSettings({ lockHash: nextHash });
        set({ lockHash: nextHash, unlocked: true });
        return true;
      },

      lockNow() {
        if (get().lockEnabled) set({ unlocked: false });
      },

      async factoryReset() {
        await dbClearAll();
        // clearAllData 会保留设置表，所以必须显式把锁配置清零 ——
        // 否则清完数据仍然卡在锁屏外，等于没救。
        await dbSaveSettings({ lockEnabled: false, lockHash: undefined });
        set({ lockEnabled: false, lockHash: null, unlocked: true });
        await get().init();
      },

      pushToast(t) {
        const toast: Toast = { ...t, id: uid() };
        set((s) => ({ toasts: [...s.toasts, toast] }));
        // 用全局 setTimeout 而不是 window.setTimeout —— 便于在非浏览器环境跑集成测试
        setTimeout(() => get().dismissToast(toast.id), 5000);
      },

      dismissToast(id) {
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
      },
    }),
    {
      name: 'ledger.settings',
      storage: createJSONStorage(() => localStorage),
      // 只持久化 UI 偏好，业务数据一律走 IndexedDB —— 避免两套数据源打架
      partialize: (s) => ({
        theme: s.theme,
        colorScheme: s.colorScheme,
        currencySymbol: s.currencySymbol,
        selectedMonth: s.selectedMonth,
        lastUsedAccountId: s.lastUsedAccountId,
        lastCategoryByType: s.lastCategoryByType,
      }),
    },
  ),
);

async function bulkUpsert<T>(table: { bulkPut: (rows: T[]) => Promise<unknown> }, rows: T[]) {
  if (rows.length) await table.bulkPut(rows);
}
