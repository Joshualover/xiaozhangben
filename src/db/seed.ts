export interface CategorySeed {
  name: string;
  icon: string;
  color: string;
  children?: string[];
}

export interface CategoryPreset extends CategorySeed {}

/** 预置分类 —— 二级分类仅给常用项，保持录入成本低 */
export const PRESET_EXPENSE: CategoryPreset[] = [
  { name: '餐饮', icon: 'utensils', color: '#D85A30', children: ['早餐', '午餐', '晚餐', '零食饮料', '外卖'] },
  { name: '交通', icon: 'bus', color: '#378ADD', children: ['公交地铁', '打车', '加油', '停车'] },
  { name: '购物', icon: 'shopping-bag', color: '#D4537E', children: ['日用百货', '服饰', '数码'] },
  { name: '居住', icon: 'home', color: '#854F0B', children: ['房租', '水电燃气', '物业'] },
  { name: '娱乐', icon: 'gamepad', color: '#7F77DD', children: ['电影', '游戏', '旅行'] },
  { name: '医疗', icon: 'pill', color: '#1D9E75', children: ['门诊', '药品'] },
  { name: '学习', icon: 'book-open', color: '#185FA5', children: ['书籍', '课程'] },
  { name: '人情', icon: 'gift', color: '#993C1D', children: ['红包', '请客'] },
  { name: '其他', icon: 'more-horizontal', color: '#888780', children: [] },
];

export const PRESET_INCOME: CategoryPreset[] = [
  { name: '工资', icon: 'wallet', color: '#639922', children: ['基本工资', '奖金'] },
  { name: '兼职', icon: 'briefcase', color: '#0F6E56', children: ['稿费', '外包'] },
  { name: '投资', icon: 'trending-up', color: '#BA7517', children: ['利息', '分红'] },
  { name: '其他', icon: 'more-horizontal', color: '#888780', children: ['退款', '红包', '报销'] },
];

export interface AccountSeed {
  name: string;
  kind: 'cash' | 'wechat' | 'alipay' | 'debit' | 'credit' | 'other';
  icon: string;
  color: string;
  includeInTotal: boolean;
}

export const PRESET_ACCOUNTS: AccountSeed[] = [
  { name: '现金', kind: 'cash', icon: 'banknote', color: '#639922', includeInTotal: true },
  { name: '微信钱包', kind: 'wechat', icon: 'message-circle', color: '#1D9E75', includeInTotal: true },
  { name: '支付宝', kind: 'alipay', icon: 'smartphone', color: '#378ADD', includeInTotal: true },
  { name: '银行卡', kind: 'debit', icon: 'credit-card', color: '#185FA5', includeInTotal: true },
  { name: '信用卡', kind: 'credit', icon: 'credit-card', color: '#E24B4A', includeInTotal: true },
];

/** 环形图 / 排行等场景的颜色回退顺序 */
export const CHART_COLORS = [
  '#D85A30',
  '#378ADD',
  '#639922',
  '#7F77DD',
  '#BA7517',
  '#D4537E',
  '#1D9E75',
  '#185FA5',
  '#993C1D',
  '#888780',
];
