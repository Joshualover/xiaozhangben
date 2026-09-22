import Dexie, { type Table } from 'dexie';
import type { Account, Budget, Category, Settings, Tag, Transaction, Transfer } from '@/types';
import { PRESET_ACCOUNTS, PRESET_EXPENSE, PRESET_INCOME } from './seed';
import { uid } from '@/lib/id';

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  colorScheme: 'cn',
  currencySymbol: '¥',
  monthStartDay: 1,
  lockEnabled: false,
};

class LedgerDB extends Dexie {
  transactions!: Table<Transaction, string>;
  categories!: Table<Category, string>;
  accounts!: Table<Account, string>;
  tags!: Table<Tag, string>;
  transfers!: Table<Transfer, string>;
  budgets!: Table<Budget, string>;
  settings!: Table<Settings & { key: string }, string>;

  constructor() {
    super('xiaozhangben');
    this.version(1).stores({
      transactions: 'id, occurredAt, categoryId, accountId, type, ledgerId, *tagIds',
      categories: 'id, type, parentId, sort',
      accounts: 'id, kind',
      tags: 'id, name',
      transfers: 'id, occurredAt, fromAccountId, toAccountId',
      budgets: 'id, month, categoryId',
      settings: 'key',
    });
  }
}

export const db = new LedgerDB();

let initPromise: Promise<void> | null = null;

/** 首次打开时写入预置分类、账户与默认设置（幂等） */
export function ensureSeeded(): Promise<void> {
  if (!initPromise) {
    initPromise = doSeed();
  }
  return initPromise;
}

async function doSeed(): Promise<void> {
  await db.open();

  const categoryCount = await db.categories.count();
  if (categoryCount === 0) {
    const rows: Category[] = [];
    let sort = 0;
    for (const [type, groups] of [
      ['expense', PRESET_EXPENSE],
      ['income', PRESET_INCOME],
    ] as const) {
      for (const g of groups) {
        const parentId = uid();
        rows.push({ id: parentId, name: g.name, type, parentId: null, icon: g.icon, color: g.color, sort: sort++, hidden: false, isPreset: true });
        for (const child of g.children ?? []) {
          rows.push({ id: uid(), name: child, type, parentId, icon: g.icon, color: g.color, sort: sort++, hidden: false, isPreset: true });
        }
      }
    }
    await db.categories.bulkAdd(rows);
  }

  const accountCount = await db.accounts.count();
  if (accountCount === 0) {
    await db.accounts.bulkAdd(
      PRESET_ACCOUNTS.map((a) => ({
        id: uid(),
        name: a.name,
        kind: a.kind,
        initialBalance: 0,
        icon: a.icon,
        color: a.color,
        includeInTotal: a.includeInTotal,
        archived: false,
      })),
    );
  }

  const settings = await db.settings.get('app');
  if (!settings) {
    await db.settings.put({ key: 'app', ...DEFAULT_SETTINGS });
  }
}

/** 读取设置，缺失字段用默认值补齐（兼容未来新增字段） */
export async function loadSettings(): Promise<Settings> {
  const row = await db.settings.get('app');
  if (!row) return { ...DEFAULT_SETTINGS };
  const { key: _key, ...rest } = row;
  return { ...DEFAULT_SETTINGS, ...rest };
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  const current = await loadSettings();
  await db.settings.put({ key: 'app', ...current, ...patch });
}

/** 清空全部业务数据，但保留设置 */
export async function clearAllData(): Promise<void> {
  await db.transaction(
    'rw',
    [db.transactions, db.transfers, db.budgets, db.tags, db.categories, db.accounts],
    async () => {
      await Promise.all([
        db.transactions.clear(),
        db.transfers.clear(),
        db.budgets.clear(),
        db.tags.clear(),
        db.categories.clear(),
        db.accounts.clear(),
      ]);
    },
  );
  initPromise = null;
  await ensureSeeded();
}
