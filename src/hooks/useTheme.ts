import { useEffect } from 'react';
import { useLedger } from '@/store/useLedgerStore';

/** 把主题与配色方案同步到 <html> 的 data 属性，CSS 变量据此切换 */
export function useThemeSync(): void {
  const theme = useLedger((s) => s.theme);
  const colorScheme = useLedger((s) => s.colorScheme);

  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia('(prefers-color-scheme: dark)');

    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches);
      root.dataset.theme = dark ? 'dark' : 'light';
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', dark ? '#201f1c' : '#ffffff');
    };

    apply();
    if (theme === 'system') {
      media.addEventListener('change', apply);
      return () => media.removeEventListener('change', apply);
    }
    return undefined;
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.scheme = colorScheme;
  }, [colorScheme]);
}
