# 小账本 Ledger

纯本地的个人记账 Web 应用。打开即用、三秒记一笔、数据不出本机。

需求文档见 [`docs/PRD-个人记账应用.md`](docs/PRD-个人记账应用.md)。

## 快速开始

```bash
npm install
npm run dev        # http://127.0.0.1:5178
npm run build      # 产物到 dist/
npm run test       # 领域逻辑单元测试
```

首次打开是空账本。想先看效果，进「我的 → 载入示例数据」，会生成近 3 个月的模拟账单与预算。

## 技术栈

React 18 + TypeScript + Vite ｜ Zustand（状态）｜ Dexie / IndexedDB（存储）｜ Recharts（图表）｜ dayjs（日期）

无后端、无账号、无网络请求。

## 三条不能破的约定

1. **金额一律以「分」为单位存整数**，只在展示层转元。所有换算走 `src/domain/money.ts`，不要在业务代码里直接做 `元 * 100`。
2. **收支配色遵循中文习惯**：支出红、收入绿。切换成国际配色的入口在「设置 → 外观」，由 `<html data-scheme>` 驱动 CSS 变量，不要在各组件里硬编码颜色。
3. **月份归属统一走 `src/domain/period.ts`**，以支持「每月起始日」配置。不要直接 `dayjs().format('YYYY-MM')`。

## 目录结构

```
src/
├── app 层
│   ├── App.tsx              路由 + 全局快捷键
│   ├── main.tsx             入口
│   └── components/          通用 UI（无业务逻辑）
├── domain/                  纯函数：金额、周期、统计、趋势（单元测试覆盖）
├── db/                      Dexie schema、预置数据、演示数据
├── store/                   Zustand 全局状态与所有写操作
├── hooks/                   派生数据（useLedgerData）、主题同步
├── features/                业务编排层
│   ├── dashboard/           首页
│   ├── transaction/         记账表单、账单列表、筛选
│   ├── reports/             统计与排行
│   ├── accounts/            账户与转账
│   ├── category/            分类管理
│   └── settings/            设置、预算、导入导出
└── styles/global.css        设计令牌 + 全部样式
```

分层原则：`domain/` 不依赖 React 与 db（便于单测）；`db/` 只做读写；`store/` 是唯一的写入口；`features/` 负责编排；`components/` 保持无业务逻辑。

## 数据与备份

数据存在浏览器的 IndexedDB（库名 `xiaozhangben`）。**清除浏览器数据会一并清除账单**，请定期在「设置 → 数据管理」导出 JSON 备份到硬盘。

导出 CSV 使用 UTF-8 with BOM，Excel 直接打开不乱码，金额列可参与计算。

## 已知边界

- 单账本。`Transaction.ledgerId` 字段已预留，二期扩多账本无需数据迁移。
- 未实现 PWA 离线缓存（Service Worker）；应用本身不依赖网络，但首次需从服务器加载资源。
- 本地密码锁未实现（计划 M6）。实现后也仅为界面遮挡，数据仍是明文存储，不提供加密保护。
- 分类预算目前由示例数据预置，单独编辑分类预算的 UI 待补。
