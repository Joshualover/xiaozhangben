import type { Account, Budget, Category, Tag, Transaction } from '@/types';
import { DEFAULT_LEDGER_ID } from '@/types';
import { uid } from '@/lib/id';
import { recentMonthKeys } from '@/domain/period';
import dayjs from 'dayjs';

/**
 * 演示数据生成器。
 * 没有数据的记账应用无法验收 —— 统计图、排行、预算进度都需要真实体量的样本。
 * 生成后可一键清空。
 */

interface Draft {
  categoryName: string;
  subName?: string;
  accountName?: string;
  note?: string;
  /** 元 */
  amount: number;
  /** 该月第几号 */
  day: number;
  hour?: number;
  tags?: string[];
  /** 出现次数，用于制造合理的分布（餐饮高频、房租低频） */
  repeat?: number;
}

const EXPENSE_DRAFTS: Draft[] = [
  { categoryName: '餐饮', subName: '早餐', amount: 12, day: 2, hour: 8, repeat: 5 },
  { categoryName: '餐饮', subName: '午餐', amount: 28, day: 3, hour: 12, repeat: 6, tags: ['工作日'] },
  { categoryName: '餐饮', subName: '晚餐', amount: 45, day: 5, hour: 19, repeat: 4 },
  { categoryName: '餐饮', subName: '外卖', amount: 36, day: 8, hour: 21, repeat: 3 },
  { categoryName: '交通', subName: '公交地铁', amount: 6, day: 1, hour: 8, repeat: 7 },
  { categoryName: '交通', subName: '打车', amount: 32, day: 11, hour: 22, repeat: 2 },
  { categoryName: '购物', subName: '日用百货', amount: 128, day: 6, hour: 15 },
  { categoryName: '购物', subName: '服饰', amount: 399, day: 14, hour: 16 },
  { categoryName: '购物', subName: '数码', amount: 1299, day: 20, hour: 20, note: '换了个机械键盘' },
  { categoryName: '居住', subName: '房租', amount: 3200, day: 1, hour: 9 },
  { categoryName: '居住', subName: '水电燃气', amount: 186, day: 10, hour: 10 },
  { categoryName: '娱乐', subName: '电影', amount: 78, day: 12, hour: 20 },
  { categoryName: '娱乐', subName: '游戏', amount: 68, day: 18, hour: 21 },
  { categoryName: '学习', subName: '书籍', amount: 89, day: 9, hour: 14, tags: ['自我提升'] },
  { categoryName: '学习', subName: '课程', amount: 299, day: 22, hour: 11, tags: ['自我提升'] },
  { categoryName: '医疗', subName: '药品', amount: 56, day: 16, hour: 17 },
  { categoryName: '人情', subName: '红包', amount: 200, day: 25, hour: 12 },
  { categoryName: '其他', amount: 30, day: 27, hour: 13, tags: ['报销'], note: '垫付，待报销' },
];

const INCOME_DRAFTS: Draft[] = [
  { categoryName: '工资', subName: '基本工资', amount: 12000, day: 10, hour: 9 },
  { categoryName: '兼职', subName: '稿费', amount: 800, day: 15, hour: 18, tags: ['副业'] },
  { categoryName: '投资', subName: '利息', amount: 126, day: 21, hour: 10 },
];

export function buildDemoData(
  categories: Category[],
  accounts: Account[],
): { transactions: Transaction[]; budgets: Budget[]; tags: Tag[] } {
  const findCategory = (name: string, parentName?: string): Category | undefined => {
    if (!parentName) return categories.find((c) => c.name === name && c.parentId === null);
    const parent = categories.find((c) => c.name === parentName && c.parentId === null);
    if (!parent) return undefined;
    return categories.find((c) => c.name === name && c.parentId === parent.id) ?? parent;
  };

  const defaultAccount = accounts[0];
  const accountByName = (name?: string) =>
    (name ? accounts.find((a) => a.name === name) : undefined)?.id ?? defaultAccount?.id ?? '';

  const tagMap = new Map<string, Tag>();
  const tagIdsOf = (names?: string[]): string[] => {
    if (!names) return [];
    return names.map((n) => {
      const existing = tagMap.get(n);
      if (existing) return existing.id;
      const tag: Tag = { id: uid(), name: n };
      tagMap.set(n, tag);
      return tag.id;
    });
  };

  const months = recentMonthKeys(3);
  const transactions: Transaction[] = [];
  const now = Date.now();

  months.forEach((monthKey, monthIndex) => {
    const isCurrent = monthIndex === months.length - 1;
    const base = dayjs(`${monthKey}-01`);

    const push = (draft: Draft, seq: number, type: 'expense' | 'income') => {
      const parent = findCategory(draft.categoryName);
      if (!parent) return;
      const child = draft.subName ? findCategory(draft.subName, draft.categoryName) : undefined;

      const day = Math.min(28, draft.day + (seq % 3));
      const date = base.date(day).hour(draft.hour ?? 12).minute((seq * 7) % 60);
      if (isCurrent && date.valueOf() > now) return;

      // 制造轻微波动，让趋势图不是一条直线
      const jitter = 1 + ((seq % 5) - 2) * 0.06;
      const amount = Math.round(draft.amount * jitter * 100);

      transactions.push({
        id: uid(),
        type,
        amount,
        categoryId: parent.id,
        subCategoryId: child && child.id !== parent.id ? child.id : undefined,
        accountId: accountByName(draft.accountName),
        occurredAt: date.valueOf(),
        note: draft.note,
        tagIds: tagIdsOf(draft.tags),
        ledgerId: DEFAULT_LEDGER_ID,
        createdAt: now,
        updatedAt: now,
      });
    };

    EXPENSE_DRAFTS.forEach((d) => {
      const times = d.repeat ?? 1;
      for (let i = 0; i < times; i++) push(d, i * 3 + d.day, 'expense');
    });
    INCOME_DRAFTS.forEach((d) => push(d, d.day, 'income'));
  });

  const currentMonth = months[months.length - 1];
  const budgets: Budget[] = [
    { id: uid(), month: currentMonth, categoryId: null, amount: 800000 },
    ...['餐饮', '购物', '娱乐']
      .map((name) => findCategory(name))
      .filter((c): c is Category => Boolean(c))
      .map((c) => ({
        id: uid(),
        month: currentMonth,
        categoryId: c.id,
        amount: c.name === '餐饮' ? 200000 : c.name === '购物' ? 250000 : 80000,
      })),
  ];

  return { transactions, budgets, tags: [...tagMap.values()] };
}
