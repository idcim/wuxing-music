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

export const NAV_MAIN: NavItem[] = [
  { path: '/dashboard', title: '仪表盘', perm: 'dashboard:view', icon: 'DataLine' },
  { path: '/tracks', title: '歌曲管理', perm: 'tracks:view', icon: 'Headset' },
  { path: '/elements', title: '五行管理', perm: 'elements:view', icon: 'MagicStick' },
  { path: '/plans', title: '套餐管理', perm: 'plans:view', icon: 'Goods' },
  { path: '/cdkeys', title: '兑换码', perm: 'cdkeys:view', icon: 'Ticket' },
  { path: '/quiz', title: '测评管理', perm: 'quiz:view', icon: 'EditPen' },
  { path: '/orders', title: '订单管理', perm: 'orders:view', icon: 'List' },
  { path: '/users', title: '用户', perm: 'users:view', icon: 'User' }
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

export const NAV_ALL: NavItem[] = [...NAV_MAIN, ...NAV_AGENT, ...NAV_SYSTEM];
