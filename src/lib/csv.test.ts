import { describe, expect, it } from 'vitest';
import { parseCsv, parseTransactionCsv, toCsv, transactionsToCsv } from './csv';
import type { Transaction } from '@/types';

describe('toCsv', () => {
  it('带 UTF-8 BOM，保证 Excel 打开中文不乱码', () => {
    expect(toCsv([['姓名', '金额']]).startsWith('\uFEFF')).toBe(true);
  });

  it('对含逗号、引号、换行的字段做转义', () => {
    const csv = toCsv([['a,b', 'say "hi"', 'line1\nline2']]);
    expect(csv).toContain('"a,b"');
    expect(csv).toContain('"say ""hi"""');
    expect(csv).toContain('"line1\nline2"');
  });
});

describe('parseCsv', () => {
  it('解析普通行并去掉 BOM', () => {
    expect(parseCsv('\uFEFFa,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('支持引号包裹、转义引号与字段内换行', () => {
    const rows = parseCsv('a,"b,c"\n"d""e","f\ng"');
    expect(rows[0]).toEqual(['a', 'b,c']);
    expect(rows[1]).toEqual(['d"e', 'f\ng']);
  });

  it('忽略完全空白的行，兼容 CRLF', () => {
    expect(parseCsv('a,b\r\n\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});

describe('parseTransactionCsv', () => {
  const header = '日期,时间,类型,一级分类,二级分类,金额,账户,标签,备注\n';

  it('解析合法行并换算为「分」', () => {
    const r = parseTransactionCsv(header + '2026-09-01,12:30,支出,餐饮,午餐,28.50,微信钱包,工作日,公司楼下');
    expect(r.errorCount).toBe(0);
    expect(r.validCount).toBe(1);
    expect(r.rows[0].data?.amount).toBe(2850);
    expect(r.rows[0].data?.type).toBe('expense');
    expect(r.rows[0].data?.parentName).toBe('餐饮');
    expect(r.rows[0].data?.childName).toBe('午餐');
    expect(r.rows[0].data?.tags).toEqual(['工作日']);
  });

  it('识别收入类型', () => {
    const r = parseTransactionCsv(header + '2026-09-05,09:00,收入,工资,基本工资,12000,银行卡,,9月工资');
    expect(r.rows[0].data?.type).toBe('income');
    expect(r.rows[0].data?.amount).toBe(1200000);
    expect(r.rows[0].data?.tags).toEqual([]);
  });

  it('错误行被标记且不阻塞其他行 —— 导入体验的关键', () => {
    const csv =
      header +
      '2026-09-01,12:30,支出,餐饮,,28.50,微信钱包,,\n' +
      '坏日期,12:30,支出,餐饮,,30,微信钱包,,\n' +
      '2026-09-03,12:30,支出,,,15,微信钱包,,\n' +
      '2026-09-04,12:30,支出,交通,,abc,微信钱包,,';
    const r = parseTransactionCsv(csv);
    expect(r.rows).toHaveLength(4);
    expect(r.validCount).toBe(1);
    expect(r.errorCount).toBe(3);
    expect(r.rows[0].ok).toBe(true);
    expect(r.rows[1].errors.join()).toContain('日期');
    expect(r.rows[2].errors.join()).toContain('一级分类');
    expect(r.rows[3].errors.join()).toContain('金额');
  });

  it('行号从 2 开始，便于用户定位到文件里的行', () => {
    const r = parseTransactionCsv(header + '2026-09-01,12:30,支出,餐饮,,28.50,微信钱包,,');
    expect(r.rows[0].rowNumber).toBe(2);
  });

  it('空文件返回空结果', () => {
    expect(parseTransactionCsv('')).toEqual({ rows: [], validCount: 0, errorCount: 0 });
  });
});

describe('transactionsToCsv', () => {
  const t: Transaction = {
    id: '1',
    type: 'expense',
    amount: 2850,
    categoryId: 'c1',
    subCategoryId: 'c2',
    accountId: 'a1',
    occurredAt: new Date(2026, 8, 1, 12, 30).getTime(),
    note: '含"引号"',
    tagIds: ['t1', 't2'],
    ledgerId: 'default',
    createdAt: 0,
    updatedAt: 0,
  };

  it('导出字段完整、按时间正序、金额为元', () => {
    const csv = transactionsToCsv([t], {
      categoryPath: () => ({ parent: '餐饮', child: '午餐' }),
      accountName: () => '微信钱包',
      tagNames: () => ['工作日', '报销'],
    });
    const rows = parseCsv(csv);
    expect(rows[0]).toEqual(['日期', '时间', '类型', '一级分类', '二级分类', '金额', '账户', '标签', '备注']);
    expect(rows[1].slice(0, 7)).toEqual(['2026-09-01', '12:30', '支出', '餐饮', '午餐', '28.50', '微信钱包']);
    expect(rows[1][7]).toBe('工作日 报销');
    expect(rows[1][8]).toBe('含"引号"');
  });

  it('导出后重新解析能得到一致的金额与分类', () => {
    const csv = transactionsToCsv([t], {
      categoryPath: () => ({ parent: '餐饮', child: '午餐' }),
      accountName: () => '微信钱包',
      tagNames: () => [],
    });
    const back = parseTransactionCsv(csv);
    expect(back.validCount).toBe(1);
    expect(back.rows[0].data?.amount).toBe(2850);
    expect(back.rows[0].data?.parentName).toBe('餐饮');
  });
});
