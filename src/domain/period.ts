import dayjs from 'dayjs';
import type { Transaction } from '@/types';

/**
 * 周期工具 —— 完整支持「每月起始日」配置（如把 15 号作为记账月起点）。
 * 所有「月」判定都必须走这里，不要在业务代码里直接 dayjs().format('YYYY-MM')。
 */

export const DATE_FMT = 'YYYY-MM-DD';
export const MONTH_FMT = 'YYYY-MM';

/** 某时间戳所属的「记账月」，返回 YYYY-MM */
export function monthKeyOf(ts: number, monthStartDay = 1): string {
  const d = dayjs(ts);
  if (monthStartDay <= 1) return d.format(MONTH_FMT);
  return d.date() >= monthStartDay ? d.format(MONTH_FMT) : d.subtract(1, 'month').format(MONTH_FMT);
}

/** 某记账月的起止时间戳 [start, endExclusive) */
export function monthRange(
  monthKey: string,
  monthStartDay = 1,
): { start: number; end: number } {
  const base = dayjs(`${monthKey}-01`);
  if (monthStartDay <= 1) {
    return { start: base.startOf('month').valueOf(), end: base.add(1, 'month').startOf('month').valueOf() };
  }
  const start = base.date(monthStartDay).startOf('day');
  return { start: start.valueOf(), end: start.add(1, 'month').valueOf() };
}

/** 判断时间戳是否落在某记账月内 */
export function inMonth(ts: number, monthKey: string, monthStartDay = 1): boolean {
  const { start, end } = monthRange(monthKey, monthStartDay);
  return ts >= start && ts < end;
}

export function currentMonthKey(monthStartDay = 1): string {
  return monthKeyOf(Date.now(), monthStartDay);
}

export function shiftMonth(monthKey: string, delta: number): string {
  return dayjs(`${monthKey}-01`).add(delta, 'month').format(MONTH_FMT);
}

export function isCurrentMonth(monthKey: string, monthStartDay = 1): boolean {
  return monthKey === currentMonthKey(monthStartDay);
}

/** 最近 n 个记账月（含当月），按时间正序 */
export function recentMonthKeys(n: number, monthStartDay = 1): string[] {
  const cur = currentMonthKey(monthStartDay);
  return Array.from({ length: n }, (_, i) => shiftMonth(cur, i - (n - 1)));
}

export function formatMonthLabel(monthKey: string): string {
  return dayjs(`${monthKey}-01`).format('YYYY年M月');
}

export function formatDateLabel(ts: number): string {
  const d = dayjs(ts);
  const today = dayjs().startOf('day');
  const target = d.startOf('day');
  const diff = target.diff(today, 'day');
  if (diff === 0) return '今天';
  if (diff === -1) return '昨天';
  if (diff === -2) return '前天';
  return d.format('M月D日');
}

export function formatWeekday(ts: number): string {
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][dayjs(ts).day()];
}

/** 时间戳 ↔ datetime-local input 值 */
export function toDateTimeInput(ts: number): string {
  return dayjs(ts).format('YYYY-MM-DDTHH:mm');
}

export function fromDateTimeInput(value: string): number {
  const d = dayjs(value);
  return d.isValid() ? d.valueOf() : Date.now();
}

/** 该月总天数（按记账月口径，近似取自然月天数） */
export function daysInMonth(monthKey: string): number {
  return dayjs(`${monthKey}-01`).daysInMonth();
}

/** 该记账月已过天数占比，用于预算进度参考 */
export function monthProgressRatio(monthKey: string, monthStartDay = 1): number {
  const { start, end } = monthRange(monthKey, monthStartDay);
  const now = Date.now();
  if (now <= start) return 0;
  if (now >= end) return 1;
  return (now - start) / (end - start);
}

export function filterByRange(
  transactions: Transaction[],
  fromTs: number,
  toTs: number,
): Transaction[] {
  return transactions.filter((t) => t.occurredAt >= fromTs && t.occurredAt < toTs);
}
