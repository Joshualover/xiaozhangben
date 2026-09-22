import type { Category, Transaction, TxType } from '@/types';
import dayjs from 'dayjs';

/**
 * CSV 解析与生成。
 * 导出统一使用 UTF-8 with BOM —— 否则 Excel 打开中文会乱码，这是刚需。
 */

const BOM = '\uFEFF';

export function toCsv(rows: (string | number)[][]): string {
  return (
    BOM +
    rows
      .map((row) =>
        row
          .map((cell) => {
            const s = String(cell ?? '');
            return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
          })
          .join(','),
      )
      .join('\r\n')
  );
}

/** 解析 CSV 文本为二维数组，支持引号包裹与转义 */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch !== '\r') {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export const TX_CSV_HEADERS = [
  '日期',
  '时间',
  '类型',
  '一级分类',
  '二级分类',
  '金额',
  '账户',
  '标签',
  '备注',
] as const;

export function transactionsToCsv(
  transactions: Transaction[],
  ctx: {
    categoryPath: (id: string) => { parent: string; child: string };
    accountName: (id: string) => string;
    tagNames: (ids: string[]) => string[];
  },
): string {
  const rows: (string | number)[][] = [TX_CSV_HEADERS.slice() as unknown as string[]];

  for (const t of [...transactions].sort((a, b) => a.occurredAt - b.occurredAt)) {
    const d = dayjs(t.occurredAt);
    const path = ctx.categoryPath(t.categoryId);
    rows.push([
      d.format('YYYY-MM-DD'),
      d.format('HH:mm'),
      t.type === 'expense' ? '支出' : '收入',
      path.parent,
      path.child,
      (t.amount / 100).toFixed(2),
      ctx.accountName(t.accountId),
      ctx.tagNames(t.tagIds).join(' '),
      t.note ?? '',
    ]);
  }

  return toCsv(rows);
}

export interface ParsedTxRow {
  rowNumber: number;
  raw: string[];
  ok: boolean;
  errors: string[];
  data?: {
    type: TxType;
    amount: number;
    date: string;
    parentName: string;
    childName: string;
    accountName: string;
    tags: string[];
    note: string;
  };
}

/** 逐行解析并校验，错误行不阻塞其他行 —— 导入体验的关键 */
export function parseTransactionCsv(text: string): { rows: ParsedTxRow[]; validCount: number; errorCount: number } {
  const table = parseCsv(text);
  if (table.length === 0) return { rows: [], validCount: 0, errorCount: 0 };

  const header = table[0].map((h) => h.trim());
  const idx = (name: string) => header.findIndex((h) => h === name);
  const iDate = idx('日期');
  const iTime = idx('时间');
  const iType = idx('类型');
  const iParent = idx('一级分类');
  const iChild = idx('二级分类');
  const iAmount = idx('金额');
  const iAccount = idx('账户');
  const iTags = idx('标签');
  const iNote = idx('备注');

  const dataRows = table.slice(1);
  const rows: ParsedTxRow[] = dataRows.map((raw, i) => {
    const errors: string[] = [];
    const cell = (i2: number) => (i2 >= 0 ? (raw[i2] ?? '').trim() : '');

    const typeText = cell(iType);
    const type: TxType = typeText === '收入' ? 'income' : typeText === '支出' ? 'expense' : 'expense';
    if (typeText && typeText !== '收入' && typeText !== '支出') errors.push(`类型「${typeText}」无法识别，按支出处理`);

    const amountText = cell(iAmount).replace(/[¥,\s]/g, '');
    const amountYuan = Number(amountText);
    if (!Number.isFinite(amountYuan) || amountYuan <= 0) errors.push('金额无效');

    const dateText = cell(iDate);
    const timeText = cell(iTime) || '00:00';
    const parsed = dayjs(`${dateText} ${timeText}`);
    if (!parsed.isValid()) errors.push('日期格式无效，应为 YYYY-MM-DD');

    const parentName = cell(iParent);
    if (!parentName) errors.push('一级分类为空');

    const hardError = errors.some((e) => !e.includes('按支出处理'));

    return {
      rowNumber: i + 2,
      raw,
      ok: !hardError,
      errors,
      data: hardError
        ? undefined
        : {
            type,
            amount: Math.round(amountYuan * 100),
            date: parsed.valueOf().toString(),
            parentName,
            childName: cell(iChild),
            accountName: cell(iAccount),
            tags: cell(iTags).split(/[\s,、]+/).filter(Boolean),
            note: cell(iNote),
          },
    };
  });

  return {
    rows,
    validCount: rows.filter((r) => r.ok).length,
    errorCount: rows.filter((r) => !r.ok).length,
  };
}

export function toImportTemplateCsv(): string {
  return toCsv([
    ['日期', '时间', '类型', '一级分类', '二级分类', '金额', '账户', '标签', '备注'],
    ['2026-09-01', '12:30', '支出', '餐饮', '午餐', '28.00', '微信钱包', '工作日', '公司楼下'],
    ['2026-09-05', '09:00', '收入', '工资', '基本工资', '12000.00', '银行卡', '', '9月工资'],
  ]);
}

export const categoryNameOf = (categories: Category[], id: string): string =>
  categories.find((c) => c.id === id)?.name ?? '未分类';
