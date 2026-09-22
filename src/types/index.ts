export type TxType = 'expense' | 'income';

export type ThemeMode = 'light' | 'dark' | 'system';

export type ColorScheme = 'cn' | 'intl';

export type AccountKind = 'cash' | 'wechat' | 'alipay' | 'debit' | 'credit' | 'other';

export interface Category {
  id: string;
  name: string;
  type: TxType;
  /** null = 一级分类 */
  parentId: string | null;
  /** lucide 图标 key，见 lib/icons.ts */
  icon: string;
  color: string;
  sort: number;
  hidden: boolean;
  isPreset: boolean;
}

export interface Account {
  id: string;
  name: string;
  kind: AccountKind;
  /** 单位：分，避免浮点误差 */
  initialBalance: number;
  icon: string;
  color: string;
  includeInTotal: boolean;
  archived: boolean;
}

export interface Tag {
  id: string;
  name: string;
  color?: string;
}

export interface Transaction {
  id: string;
  type: TxType;
  /** 单位：分（整数），避免浮点误差 */
  amount: number;
  categoryId: string;
  subCategoryId?: string;
  accountId: string;
  /** 时间戳（ms） */
  occurredAt: number;
  note?: string;
  tagIds: string[];
  /** 账本标识，一期恒为 'default'，为多账本预留 */
  ledgerId: string;
  createdAt: number;
  updatedAt: number;
}

export interface Transfer {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  occurredAt: number;
  note?: string;
  ledgerId: string;
  createdAt: number;
}

export interface Budget {
  id: string;
  /** YYYY-MM */
  month: string;
  /** null = 月度总预算 */
  categoryId: string | null;
  amount: number;
}

export interface Settings {
  theme: ThemeMode;
  colorScheme: ColorScheme;
  currencySymbol: string;
  /** 1-28，每月起始日 */
  monthStartDay: number;
  lockEnabled: boolean;
  lockHash?: string;
}

export interface LedgerSnapshot {
  schemaVersion: 1;
  exportedAt: number;
  categories: Category[];
  accounts: Account[];
  tags: Tag[];
  transactions: Transaction[];
  transfers: Transfer[];
  budgets: Budget[];
  settings: Settings;
}

export const SCHEMA_VERSION = 1 as const;
export const DEFAULT_LEDGER_ID = 'default';

export interface TxFilter {
  keyword: string;
  type: TxType | 'all';
  categoryId: string | null;
  accountId: string | null;
  /** 金额区间，单位：分 */
  minAmount: number | null;
  maxAmount: number | null;
  /** YYYY-MM-DD */
  from: string | null;
  /** YYYY-MM-DD */
  to: string | null;
  tagIds: string[];
}

export const EMPTY_FILTER: TxFilter = {
  keyword: '',
  type: 'all',
  categoryId: null,
  accountId: null,
  minAmount: null,
  maxAmount: null,
  from: null,
  to: null,
  tagIds: [],
};
