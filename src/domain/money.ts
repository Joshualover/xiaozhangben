/**
 * 金额工具 —— 全应用统一以「分」为单位存储整数，仅在展示层转元。
 * 这是记账应用最关键的一条约定，用于彻底规避 0.1 + 0.2 类浮点误差。
 */

/** 元 → 分（四舍五入到整分） */
export function yuanToCents(yuan: number | string): number {
  const n = typeof yuan === 'string' ? Number(yuan) : yuan;
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

/** 分 → 元（数值） */
export function centsToYuan(cents: number): number {
  return cents / 100;
}

/** 分 → 元字符串，保留 2 位小数 */
export function centsToYuanString(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** 千分位格式化，入参为分 */
export function formatCents(cents: number, symbol = '¥', showSign = false): string {
  const neg = cents < 0;
  const abs = Math.abs(cents) / 100;
  const body = abs.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const sign = neg ? '-' : showSign ? '+' : '';
  return `${sign}${symbol}${body}`;
}

/** 紧凑展示：≥1 万时用「万」，用于概览卡等空间有限的位置 */
export function formatCentsCompact(cents: number, symbol = '¥'): string {
  const yuan = Math.abs(cents) / 100;
  const sign = cents < 0 ? '-' : '';
  if (yuan >= 10000) return `${sign}${symbol}${(yuan / 10000).toFixed(2)}万`;
  return formatCents(cents, symbol);
}

/**
 * 解析用户输入的金额表达式。
 * 支持纯数字与简单的加减（如 "28+15"、"120-8.5"）。
 * 返回分；非法输入返回 null。
 */
export function parseAmountExpression(input: string): number | null {
  const raw = input.trim().replace(/[，,\s]/g, '');
  if (!raw) return null;

  // 只允许数字、小数点、加减号
  if (!/^-?\d*\.?\d*([+-]\d*\.?\d*)*$/.test(raw)) return null;

  const terms = raw.match(/[+-]?\d*\.?\d+/g);
  if (!terms || terms.join('') === '' ) return null;

  let totalYuan = 0;
  for (const t of terms) {
    const v = Number(t);
    if (!Number.isFinite(v)) return null;
    totalYuan += v;
  }

  if (totalYuan <= 0) return null;
  return Math.round(totalYuan * 100);
}

/** 金额分 → 适合 input 展示的纯数字串（不带千分位，便于编辑） */
export function centsToInputValue(cents: number): string {
  if (!cents) return '';
  const s = (cents / 100).toFixed(2);
  return s.endsWith('.00') ? s.slice(0, -3) : s.replace(/0$/, '');
}

/** 求和，入参为分 */
export function sumCents(list: number[]): number {
  return list.reduce((acc, n) => acc + n, 0);
}

/** 环比：返回百分比数值，基期为 0 时返回 null */
export function changeRate(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / Math.abs(previous)) * 100;
}
