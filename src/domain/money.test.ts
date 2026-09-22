import { describe, expect, it } from 'vitest';
import {
  centsToInputValue,
  centsToYuanString,
  changeRate,
  formatCents,
  formatCentsCompact,
  parseAmountExpression,
  sumCents,
  yuanToCents,
} from './money';

describe('money', () => {
  it('yuanToCents 规避浮点误差', () => {
    expect(yuanToCents(0.1) + yuanToCents(0.2)).toBe(30);
    expect(yuanToCents('28.55')).toBe(2855);
    expect(yuanToCents(1e-3)).toBe(0);
    // 1.005 * 100 在 IEEE754 下是 100.49999…，四舍五入得到 100 —— 这是可接受的
    expect(yuanToCents(1.005)).toBe(100);
    expect(yuanToCents(1.006)).toBe(101);
    expect(yuanToCents('abc')).toBe(0);
  });

  it('formatCents 输出千分位与符号', () => {
    expect(formatCents(123456789)).toBe('¥1,234,567.89');
    expect(formatCents(-500)).toBe('-¥5.00');
    expect(formatCents(500, '¥', true)).toBe('+¥5.00');
  });

  it('formatCentsCompact 在万元以上使用「万」', () => {
    expect(formatCentsCompact(999900)).toBe('¥9,999.00');
    expect(formatCentsCompact(1000000)).toBe('¥1.00万');
    expect(formatCentsCompact(-2500000)).toBe('-¥2.50万');
  });

  it('centsToYuanString 固定两位小数', () => {
    expect(centsToYuanString(1)).toBe('0.01');
    expect(centsToYuanString(100000)).toBe('1000.00');
  });

  it('parseAmountExpression 支持纯数字与加减算式', () => {
    expect(parseAmountExpression('28')).toBe(2800);
    expect(parseAmountExpression('28+15')).toBe(4300);
    expect(parseAmountExpression('120-8.5')).toBe(11150);
    expect(parseAmountExpression('1,000')).toBe(100000);
    expect(parseAmountExpression(' 12.30 ')).toBe(1230);
  });

  it('parseAmountExpression 拒绝非法或非正数输入', () => {
    expect(parseAmountExpression('')).toBeNull();
    expect(parseAmountExpression('abc')).toBeNull();
    expect(parseAmountExpression('0')).toBeNull();
    expect(parseAmountExpression('-5')).toBeNull();
    expect(parseAmountExpression('12**3')).toBeNull();
  });

  it('centsToInputValue 去掉无意义的尾随零', () => {
    expect(centsToInputValue(0)).toBe('');
    expect(centsToInputValue(2800)).toBe('28');
    expect(centsToInputValue(2855)).toBe('28.55');
    expect(centsToInputValue(2850)).toBe('28.5');
  });

  it('sumCents 累加为整数', () => {
    expect(sumCents([10, 20, 30])).toBe(60);
    expect(sumCents([])).toBe(0);
  });

  it('changeRate 处理基期为零的边界', () => {
    expect(changeRate(120, 100)).toBeCloseTo(20);
    expect(changeRate(80, 100)).toBeCloseTo(-20);
    expect(changeRate(0, 0)).toBe(0);
    expect(changeRate(50, 0)).toBeNull();
  });
});
