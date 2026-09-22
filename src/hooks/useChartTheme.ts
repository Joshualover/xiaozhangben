import { useEffect, useState } from 'react';
import { useLedger } from '@/store/useLedgerStore';

export interface ChartTheme {
  axis: string;
  grid: string;
  expense: string;
  income: string;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipText: string;
  neutral: string;
}

/**
 * 图表配色。
 * Recharts 需要具体的颜色值，无法直接用 CSS 变量，因此在这里与 global.css 的令牌保持一致。
 * 改动 global.css 的配色令牌时，这里必须同步。
 */
export function useChartTheme(): ChartTheme {
  const theme = useLedger((s) => s.theme);
  const scheme = useLedger((s) => s.colorScheme);
  const [systemDark, setSystemDark] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches,
  );

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setSystemDark(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const dark = theme === 'dark' || (theme === 'system' && systemDark);

  if (dark) {
    return {
      axis: '#b4b2a9',
      grid: 'rgba(255, 255, 255, 0.12)',
      expense: scheme === 'cn' ? '#f09595' : '#97c459',
      income: scheme === 'cn' ? '#97c459' : '#f09595',
      tooltipBg: '#2b2a26',
      tooltipBorder: 'rgba(255,255,255,0.16)',
      tooltipText: '#f3f1ea',
      neutral: '#888780',
    };
  }

  return {
    axis: '#5f5e5a',
    grid: 'rgba(0, 0, 0, 0.1)',
    expense: scheme === 'cn' ? '#c0392f' : '#4c7a1c',
    income: scheme === 'cn' ? '#4c7a1c' : '#c0392f',
    tooltipBg: '#ffffff',
    tooltipBorder: 'rgba(0,0,0,0.12)',
    tooltipText: '#23231f',
    neutral: '#888780',
  };
}
