import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useLedger } from '@/store/useLedgerStore';
import { useThemeSync } from '@/hooks/useTheme';
import { Layout } from '@/components/Layout';
import { Toasts } from '@/components/Toasts';
import { LockScreen } from '@/features/lock/LockScreen';
import { TransactionSheet } from '@/features/transaction/TransactionSheet';
import { Dashboard } from '@/features/dashboard/Dashboard';
import { TransactionsPage } from '@/features/transaction/TransactionsPage';
import { AccountsPage } from '@/features/accounts/AccountsPage';
import { SettingsPage } from '@/features/settings/SettingsPage';

// 统计页依赖图表库，按需加载 —— 首屏不必为它付出体积
const ReportsPage = lazy(() =>
  import('@/features/reports/ReportsPage').then((m) => ({ default: m.ReportsPage })),
);

export function App() {
  const ready = useLedger((s) => s.ready);
  const init = useLedger((s) => s.init);
  const lockEnabled = useLedger((s) => s.lockEnabled);
  const unlocked = useLedger((s) => s.unlocked);
  const [formOpen, setFormOpen] = useState(false);

  useThemeSync();

  useEffect(() => {
    void init();
  }, [init]);

  // 全局快捷键：N 记一笔
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable);
      if (typing) return;
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        setFormOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const openForm = useCallback(() => setFormOpen(true), []);

  if (!ready) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          gap: 10,
          color: 'var(--text-3)',
          fontSize: 13,
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> 正在读取本机数据…
        </span>
      </div>
    );
  }

  // 密码锁：等数据读完再判断 —— 锁配置本身就存在 IndexedDB 里。
  // 这样首屏只会出现「读取中 → 解锁页」，不会先闪一眼账目再被盖住。
  if (lockEnabled && !unlocked) {
    return <LockScreen />;
  }

  return (
    <BrowserRouter>
      <Layout onAdd={openForm}>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<Dashboard onAdd={openForm} />} />
            <Route path="/transactions" element={<TransactionsPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/accounts" element={<AccountsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Dashboard onAdd={openForm} />} />
          </Routes>
        </Suspense>
      </Layout>

      <TransactionSheet open={formOpen} onClose={() => setFormOpen(false)} />
      <Toasts />
    </BrowserRouter>
  );
}

function RouteFallback() {
  return (
    <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
      <Loader2 size={16} style={{ animation: 'spin 1s linear infinite', verticalAlign: '-3px' }} /> 加载中…
    </div>
  );
}
