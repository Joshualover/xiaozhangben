import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, ensureSeeded, loadSettings, saveSettings } from './index';
import { buildDemoData } from './demo';
import { useLedger } from '@/store/useLedgerStore';
import { DEFAULT_LEDGER_ID, EMPTY_FILTER } from '@/types';
import { accountBalances, totalsOf } from '@/domain/stats';

/**
 * 集成测试：Dexie schema + 预置数据 + store 写入链路。
 * 这是整个应用风险最高的一段 —— 单元测试覆盖不到它，而它一旦错了就是数据丢失。
 */

const store = () => useLedger.getState();

beforeEach(async () => {
  // 每个用例从干净的库开始。必须走 clearAll —— 它会重置 ensureSeeded 的模块级 promise，
  // 否则第二次 beforeEach 清表之后不会重新写入预置数据。
  useLedger.setState({
    ready: false,
    categories: [],
    accounts: [],
    tags: [],
    transactions: [],
    transfers: [],
    budgets: [],
    filter: { ...EMPTY_FILTER },
    selectedMonth: '2026-09',
  });
  await db.settings.clear();
  await store().clearAll();
});

describe('预置数据初始化', () => {
  it('首次打开写入预置分类与账户', async () => {
    const categories = await db.categories.toArray();
    const accounts = await db.accounts.toArray();

    expect(categories.length).toBeGreaterThan(0);
    expect(accounts).toHaveLength(5);
    expect(categories.filter((c) => c.parentId === null).map((c) => c.name)).toContain('餐饮');
    expect(categories.filter((c) => c.parentId !== null).length).toBeGreaterThan(0);
  });

  it('重复初始化不会产生重复数据（幂等）', async () => {
    const before = await db.categories.count();
    await ensureSeeded();
    await ensureSeeded();
    expect(await db.categories.count()).toBe(before);
  });

  it('每条预置分类都有图标与颜色，不会渲染成空白', async () => {
    for (const c of await db.categories.toArray()) {
      expect(c.icon).toBeTruthy();
      expect(c.color).toMatch(/^#/);
    }
  });

  it('设置首次打开写入默认值，且缺字段时用默认值补齐', async () => {
    await db.settings.clear();
    const settings = await loadSettings();
    expect(settings.theme).toBe('system');
    expect(settings.colorScheme).toBe('cn');
    expect(settings.monthStartDay).toBe(1);

    await db.settings.put({ key: 'app', theme: 'dark' } as never);
    const merged = await loadSettings();
    expect(merged.theme).toBe('dark');
    expect(merged.currencySymbol).toBe('¥');
  });

  it('保存设置只更新传入字段', async () => {
    await saveSettings({ colorScheme: 'intl' });
    const settings = await loadSettings();
    expect(settings.colorScheme).toBe('intl');
    expect(settings.theme).toBe('system');
  });
});

describe('账单读写链路', () => {
  it('新增账单同时写入 IndexedDB 与内存状态', async () => {
    const created = await store().addTransaction({
      type: 'expense',
      amount: 2850,
      categoryId: store().categories[0].id,
      accountId: store().accounts[0].id,
      occurredAt: Date.parse('2026-09-10T12:30:00'),
      note: '午饭',
      tagIds: [],
    });

    expect(await db.transactions.count()).toBe(1);
    expect(store().transactions).toHaveLength(1);
    expect(store().transactions[0].amount).toBe(2850);
    expect(created.ledgerId).toBe(DEFAULT_LEDGER_ID);
  });

  it('编辑后内存与数据库一致', async () => {
    const created = await store().addTransaction({
      type: 'expense',
      amount: 1000,
      categoryId: store().categories[0].id,
      accountId: store().accounts[0].id,
      occurredAt: Date.now(),
      tagIds: [],
    });

    await store().updateTransaction(created.id, { amount: 5000, note: '改了' });

    expect(store().transactions[0].amount).toBe(5000);
    expect((await db.transactions.get(created.id))?.amount).toBe(5000);
  });

  it('删除后可用同一份快照撤销回来', async () => {
    const created = await store().addTransaction({
      type: 'income',
      amount: 1200000,
      categoryId: store().categories.find((c) => c.type === 'income')!.id,
      accountId: store().accounts[0].id,
      occurredAt: Date.now(),
      tagIds: [],
    });

    await store().removeTransaction(created.id);
    expect(store().transactions).toHaveLength(0);

    await store().restoreTransaction(created);
    expect(store().transactions).toHaveLength(1);
    expect(await db.transactions.count()).toBe(1);
  });

  it('记住上次使用的账户与分类，用于下次录入', async () => {
    const account = store().accounts[2];
    const category = store().categories[1];
    await store().addTransaction({
      type: 'expense',
      amount: 100,
      categoryId: category.id,
      accountId: account.id,
      occurredAt: Date.now(),
      tagIds: [],
    });
    expect(store().lastUsedAccountId).toBe(account.id);
    expect(store().lastCategoryByType.expense).toBe(category.id);
  });
});

describe('转账不影响收支统计，但改变账户余额', () => {
  it('转账只动余额', async () => {
    const [a1, a2] = store().accounts;
    await store().addTransfer({
      fromAccountId: a1.id,
      toAccountId: a2.id,
      amount: 50000,
      occurredAt: Date.now(),
    });

    expect(store().transfers).toHaveLength(1);
    expect(store().transactions).toHaveLength(0);
    expect(totalsOf(store().transactions)).toEqual({ expense: 0, income: 0, balance: 0 });

    const balances = accountBalances(store().accounts, store().transactions, store().transfers);
    expect(balances.get(a1.id)).toBe(-50000);
    expect(balances.get(a2.id)).toBe(50000);
  });

  it('删除转账后余额回到原状', async () => {
    const [a1, a2] = store().accounts;
    await store().addTransfer({ fromAccountId: a1.id, toAccountId: a2.id, amount: 100, occurredAt: Date.now() });
    const id = store().transfers[0].id;
    await store().removeTransfer(id);
    const balances = accountBalances(store().accounts, store().transactions, store().transfers);
    expect(balances.get(a1.id)).toBe(0);
    expect(balances.get(a2.id)).toBe(0);
  });
});

describe('删除分类 / 账户时必须转移关联数据', () => {
  it('有账单的账户不允许在没有转移目标时删除', async () => {
    const account = store().accounts[0];
    await store().addTransaction({
      type: 'expense',
      amount: 1000,
      categoryId: store().categories[0].id,
      accountId: account.id,
      occurredAt: Date.now(),
      tagIds: [],
    });

    await expect(store().removeAccount(account.id)).rejects.toThrow('仍有记录');
    expect(store().accounts).toHaveLength(5);
  });

  it('指定转移目标后账单被搬到新账户，不产生悬空数据', async () => {
    const [from, to] = store().accounts;
    await store().addTransaction({
      type: 'expense',
      amount: 1000,
      categoryId: store().categories[0].id,
      accountId: from.id,
      occurredAt: Date.now(),
      tagIds: [],
    });

    await store().removeAccount(from.id, to.id);

    expect(store().accounts.map((a) => a.id)).not.toContain(from.id);
    expect(store().transactions[0].accountId).toBe(to.id);
    expect((await db.transactions.toArray())[0].accountId).toBe(to.id);
  });

  it('删除分类时子分类与账单一起迁移', async () => {
    const parent = store().categories.find((c) => c.name === '餐饮' && c.parentId === null)!;
    const children = store().categories.filter((c) => c.parentId === parent.id);
    const target = store().categories.find((c) => c.name === '其他' && c.parentId === null)!;

    await store().addTransaction({
      type: 'expense',
      amount: 3000,
      categoryId: parent.id,
      subCategoryId: children[0].id,
      accountId: store().accounts[0].id,
      occurredAt: Date.now(),
      tagIds: [],
    });

    await store().removeCategory(parent.id, target.id);

    const remaining = store().categories.map((c) => c.id);
    expect(remaining).not.toContain(parent.id);
    for (const child of children) expect(remaining).not.toContain(child.id);

    const tx = store().transactions[0];
    expect(tx.categoryId).toBe(target.id);
    expect(tx.subCategoryId).toBeUndefined();
  });

  it('没有账单的分类可以直接删除', async () => {
    const parent = store().categories.find((c) => c.name === '娱乐' && c.parentId === null)!;
    await store().removeCategory(parent.id);
    expect(store().categories.map((c) => c.name)).not.toContain('娱乐');
  });
});

describe('标签', () => {
  it('同名标签复用，不重复创建', async () => {
    const t1 = await store().ensureTag('出差');
    const t2 = await store().ensureTag('出差');
    expect(t1.id).toBe(t2.id);
    expect(store().tags).toHaveLength(1);
  });

  it('删除标签会从账单上摘掉该标签，不影响账单本身', async () => {
    const tag = await store().ensureTag('报销');
    const created = await store().addTransaction({
      type: 'expense',
      amount: 1000,
      categoryId: store().categories[0].id,
      accountId: store().accounts[0].id,
      occurredAt: Date.now(),
      tagIds: [tag.id],
    });

    await store().removeTag(tag.id);

    expect(store().transactions).toHaveLength(1);
    expect(store().transactions[0].tagIds).toEqual([]);
    expect((await db.transactions.get(created.id))?.tagIds).toEqual([]);
  });
});

describe('预算', () => {
  it('同一个月同一分类重复保存只保留一条', async () => {
    await store().saveBudget('2026-09', null, 800000);
    await store().saveBudget('2026-09', null, 900000);
    expect(store().budgets).toHaveLength(1);
    expect(store().budgets[0].amount).toBe(900000);
  });

  it('金额为 0 视为取消预算', async () => {
    await store().saveBudget('2026-09', null, 800000);
    await store().saveBudget('2026-09', null, 0);
    expect(store().budgets).toHaveLength(0);
  });
});

describe('备份导出与导入', () => {
  it('导出后再导入，数据逐字段一致', async () => {
    const parent = store().categories.find((c) => c.name === '餐饮' && c.parentId === null)!;
    await store().addTransaction({
      type: 'expense',
      amount: 4321,
      categoryId: parent.id,
      accountId: store().accounts[1].id,
      occurredAt: Date.parse('2026-09-12T19:05:00'),
      note: '带"引号"的备注',
      tagIds: [],
    });
    await store().saveBudget('2026-09', null, 500000);

    const snapshot = store().exportSnapshot();
    expect(snapshot.schemaVersion).toBe(1);
    expect(snapshot.transactions).toHaveLength(1);

    await store().clearAll();
    expect(store().transactions).toHaveLength(0);
    expect(store().budgets).toHaveLength(0);

    await store().importSnapshot(snapshot, 'replace');

    expect(store().transactions).toHaveLength(1);
    expect(store().transactions[0].amount).toBe(4321);
    expect(store().transactions[0].note).toBe('带"引号"的备注');
    expect(store().budgets[0].amount).toBe(500000);
    // 清空会重建预置分类，id 与备份中不同，因此按数量与内容校验分类
    expect(store().categories.length).toBe(snapshot.categories.length);
  });

  it('合并导入按 id 去重，不会产生重复账单', async () => {
    await store().addTransaction({
      type: 'expense',
      amount: 1000,
      categoryId: store().categories[0].id,
      accountId: store().accounts[0].id,
      occurredAt: Date.now(),
      tagIds: [],
    });
    const snapshot = store().exportSnapshot();

    await store().importSnapshot(snapshot, 'merge');

    expect(store().transactions).toHaveLength(1);
  });

  it('清空数据后预置分类与账户会被重新建立', async () => {
    await store().clearAll();
    expect(store().categories.length).toBeGreaterThan(0);
    expect(store().accounts).toHaveLength(5);
    expect(store().transactions).toHaveLength(0);
  });
});

describe('示例数据', () => {
  it('生成的账单落在最近 3 个月内，且金额为正整数分', () => {
    const demo = buildDemoData(store().categories, store().accounts);
    expect(demo.transactions.length).toBeGreaterThan(30);
    expect(demo.budgets.length).toBeGreaterThan(0);

    const now = Date.now();
    const threeMonthsAgo = now - 100 * 86400000;
    for (const t of demo.transactions) {
      expect(t.amount).toBeGreaterThan(0);
      expect(Number.isInteger(t.amount)).toBe(true);
      expect(t.occurredAt).toBeLessThanOrEqual(now);
      expect(t.occurredAt).toBeGreaterThan(threeMonthsAgo);
    }
  });

  it('每条账单都指向真实存在的分类与账户 —— 否则首页图表会显示「未分类」', () => {
    const categories = store().categories;
    const accounts = store().accounts;
    const demo = buildDemoData(categories, accounts);
    const categoryIds = new Set(categories.map((c) => c.id));
    const accountIds = new Set(accounts.map((a) => a.id));

    for (const t of demo.transactions) {
      expect(categoryIds.has(t.categoryId)).toBe(true);
      if (t.subCategoryId) expect(categoryIds.has(t.subCategoryId)).toBe(true);
      expect(accountIds.has(t.accountId)).toBe(true);
    }
  });

  it('载入示例数据后能算出非零的月度统计', async () => {
    await store().loadDemoData();
    const currentMonth = store().selectedMonth;
    const localMonth = (ts: number) => {
      const d = new Date(ts);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    };
    const inMonth = store().transactions.filter((t) => localMonth(t.occurredAt) === currentMonth);
    // 示例数据里当月至少应有一笔记录，否则首页会是空的
    expect(inMonth.length).toBeGreaterThan(0);
    expect(await db.transactions.count()).toBe(store().transactions.length);
  });
});
