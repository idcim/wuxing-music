/** 侧边栏导航定义：路由守卫与 MainLayout 共用一份，避免菜单与鉴权走偏。
 *  perm 对应后端 app/permissions.py 的权限点。 */
export interface NavItem {
  path: string;
  title: string;
  perm: string;
  icon: string; // Element Plus 图标组件名（main.ts 已全局注册）
}

export const NAV_MAIN: NavItem[] = [
  { path: '/dashboard', title: '仪表盘', perm: 'dashboard:view', icon: 'DataLine' },
  { path: '/tracks', title: '歌曲管理', perm: 'tracks:view', icon: 'Headset' },
  { path: '/elements', title: '五行管理', perm: 'elements:view', icon: 'MagicStick' },
  { path: '/plans', title: '套餐管理', perm: 'plans:view', icon: 'Goods' },
  { path: '/cdkeys', title: '兑换码', perm: 'cdkeys:view', icon: 'Ticket' },
  { path: '/quiz', title: '测评管理', perm: 'quiz:view', icon: 'EditPen' },
  { path: '/orders', title: '订单管理', perm: 'orders:view', icon: 'List' },
  { path: '/users', title: '用户', perm: 'users:view', icon: 'User' },
  { path: '/settings', title: '站点设置', perm: 'settings:view', icon: 'Setting' }
];

export const NAV_SYSTEM: NavItem[] = [
  { path: '/admins', title: '管理员', perm: 'admins:manage', icon: 'UserFilled' },
  { path: '/roles', title: '角色权限', perm: 'admins:manage', icon: 'Key' }
];

export const NAV_ALL: NavItem[] = [...NAV_MAIN, ...NAV_SYSTEM];
