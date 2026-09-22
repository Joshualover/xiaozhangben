import { NavLink, useLocation } from 'react-router-dom';
import { BarChart3, Landmark, Plus, Receipt, Settings, Wallet } from 'lucide-react';
import type { ReactNode } from 'react';

const NAV = [
  { to: '/', label: '首页', icon: Wallet, end: true },
  { to: '/transactions', label: '账单', icon: Receipt, end: false },
  { to: '/reports', label: '统计', icon: BarChart3, end: false },
  { to: '/accounts', label: '账户', icon: Landmark, end: false },
  { to: '/settings', label: '我的', icon: Settings, end: false },
];

export function Sidebar({ onAdd }: { onAdd: () => void }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark">
          <Wallet size={17} />
        </span>
        <span>
          <span className="brand-name">小账本</span>
          <span className="brand-sub">Ledger · 数据留在本机</span>
        </span>
      </div>

      <nav className="nav-list" aria-label="主导航">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) => `nav-item${isActive ? ' is-active' : ''}`}
          >
            <n.icon size={17} />
            {n.label}
          </NavLink>
        ))}
      </nav>

      <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={onAdd}>
        <Plus size={15} /> 记一笔
        <span style={{ marginLeft: 'auto', fontSize: 11, opacity: 0.75 }}>N</span>
      </button>

      <div className="sidebar-foot">
        全部数据存于本机浏览器
        <br />
        定期导出备份，换设备时导入即可
      </div>
    </aside>
  );
}

export function TabBar({ onAdd }: { onAdd: () => void }) {
  const { pathname } = useLocation();
  const isActive = (to: string, end: boolean) => (end ? pathname === to : pathname.startsWith(to));

  return (
    <nav className="tabbar" aria-label="主导航">
      {NAV.slice(0, 2).map((n) => (
        <NavLink key={n.to} to={n.to} end={n.end} className={`tab${isActive(n.to, n.end) ? ' is-active' : ''}`}>
          <n.icon size={19} />
          <span>{n.label}</span>
        </NavLink>
      ))}

      <button className="tab tab-fab" onClick={onAdd} aria-label="记一笔">
        <span className="tab-fab-inner">
          <Plus size={22} />
        </span>
        <span className="tab-fab-label">记一笔</span>
      </button>

      {NAV.slice(2).map((n) => (
        <NavLink key={n.to} to={n.to} end={n.end} className={`tab${isActive(n.to, n.end) ? ' is-active' : ''}`}>
          <n.icon size={19} />
          <span>{n.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export function Layout({ children, onAdd }: { children: ReactNode; onAdd: () => void }) {
  return (
    <div className="app-shell">
      <Sidebar onAdd={onAdd} />
      <main className="app-body">{children}</main>
      <TabBar onAdd={onAdd} />
    </div>
  );
}
