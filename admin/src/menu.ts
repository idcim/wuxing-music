/** 侧边栏导航定义：路由守卫与 MainLayout 共用一份，避免菜单与鉴权走偏。
 *  perm 对应后端 app/permissions.py 的权限点。 */
export interface NavItem {
  path: string;
  title: string;
  perm: string;
  icon: string; // Element Plus 图标组件名（main.ts 已全局注册）
  /** 可选模块开关（后端 /me 的 features）。填了就要该模块已开启才显示。
   *  与 perm 是两道独立的门：有权限但模块没开，同样不显示。 */
  feature?: string;
}

export interface NavGroup {
  path: string;
  title: string;
  icon: string;
  items: NavItem[];
}

export const NAV_MAIN: NavItem[] = [
  { path: '/dashboard', title: '仪表盘', perm: 'dashboard:view', icon: 'DataLine' },
];

export const NAV_MUSIC: NavItem[] = [
  { path: '/tracks', title: '歌曲管理', perm: 'tracks:view', icon: 'Headset' },
  { path: '/elements', title: '五行管理', perm: 'elements:view', icon: 'MagicStick' },
  { path: '/quiz', title: '测评管理', perm: 'quiz:view', icon: 'EditPen' },
  { path: '/audio-history', title: '音频任务历史', perm: 'tracks:view', icon: 'Clock' },
];

export const NAV_MEMBERS: NavItem[] = [
  { path: '/users', title: '用户管理', perm: 'users:view', icon: 'User' },
  { path: '/plans', title: '套餐管理', perm: 'plans:view', icon: 'Goods' },
  { path: '/orders', title: '会员订单', perm: 'orders:view', icon: 'List' },
  { path: '/cdkeys', title: '兑换码', perm: 'cdkeys:view', icon: 'Ticket' },
];

export const NAV_COMMERCE: NavItem[] = [
  { path: '/commerce-catalog', title: '课程与商品', perm: 'commerce:view', icon: 'Goods' },
  { path: '/commerce-trades', title: '订单与售后', perm: 'commerce:view', icon: 'List' },
  { path: '/commerce-media', title: '课件与任务', perm: 'commerce:view', icon: 'VideoCamera' },
  { path: '/commerce-settings', title: '运营配置', perm: 'commerce:view', icon: 'Setting' },
];

/** 代理分成：独立子菜单，所有相关内容都在这一组里。
 *
 *  门禁是**逐项**而不是整组——前三项要模块已开启，「分成设置」常驻。
 *  这样关闭状态下菜单里只剩「分成设置」：既没把功能摊开，又不会让人找不到开关
 *  （开关此前藏在 设置中心 的 tab 里，实际用起来找不到）。
 *  组内一项都不可见时（无权限），整组自动隐藏。 */
export const NAV_AGENT: NavItem[] = [
  { path: '/agents', title: '代理管理', perm: 'agents:view', icon: 'Shop', feature: 'agent' },
  { path: '/commissions', title: '分成明细', perm: 'agents:view', icon: 'Money', feature: 'agent' },
  { path: '/withdrawals', title: '提现审核', perm: 'agents:view', icon: 'Wallet', feature: 'agent' },
  // 不带 feature：这是整个模块唯一的开启入口，挡住就没人能打开了
  { path: '/agent-settings', title: '分成设置', perm: 'settings:view', icon: 'SetUp' }
];

export const NAV_SYSTEM: NavItem[] = [
  { path: '/admins', title: '管理员', perm: 'admins:manage', icon: 'UserFilled' },
  { path: '/roles', title: '角色权限', perm: 'admins:manage', icon: 'Key' },
  { path: '/settings', title: '站点设置', perm: 'settings:view', icon: 'Setting' }
];

/** 侧边栏最多两级。组内仍逐项校验权限与模块开关；空组不展示。 */
export const NAV_GROUPS: NavGroup[] = [
  { path: '/music-menu', title: '音乐内容', icon: 'Headset', items: NAV_MUSIC },
  { path: '/members-menu', title: '会员与用户', icon: 'User', items: NAV_MEMBERS },
  { path: '/commerce-menu', title: '课程商城', icon: 'Goods', items: NAV_COMMERCE },
  { path: '/agent-menu', title: '代理分成', icon: 'Shop', items: NAV_AGENT },
  { path: '/system-menu', title: '系统管理', icon: 'Setting', items: NAV_SYSTEM },
];

export const NAV_ALL: NavItem[] = [...NAV_MAIN, ...NAV_GROUPS.flatMap(group => group.items)];
