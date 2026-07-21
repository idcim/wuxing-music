import { createRouter, createWebHistory } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '@/stores/auth';
import { NAV_ALL } from '@/menu';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', component: () => import('@/views/Login.vue'), meta: { public: true } },
    {
      path: '/',
      component: () => import('@/layouts/MainLayout.vue'),
      redirect: '/dashboard',
      children: [
        { path: 'dashboard', component: () => import('@/views/Dashboard.vue'), meta: { title: '仪表盘', perm: 'dashboard:view' } },
        { path: 'plans', component: () => import('@/views/Plans.vue'), meta: { title: '套餐管理', perm: 'plans:view' } },
        { path: 'elements', component: () => import('@/views/Elements.vue'), meta: { title: '五行管理', perm: 'elements:view' } },
        { path: 'tracks', component: () => import('@/views/Tracks.vue'), meta: { title: '歌曲管理', perm: 'tracks:view' } },
        { path: 'cdkeys', component: () => import('@/views/Cdkeys.vue'), meta: { title: '兑换码', perm: 'cdkeys:view' } },
        { path: 'quiz', component: () => import('@/views/Quiz.vue'), meta: { title: '测评管理', perm: 'quiz:view' } },
        { path: 'orders', component: () => import('@/views/Orders.vue'), meta: { title: '订单管理', perm: 'orders:view' } },
        { path: 'users', component: () => import('@/views/Users.vue'), meta: { title: '用户', perm: 'users:view' } },
        { path: 'settings', component: () => import('@/views/SettingsCenter.vue'), meta: { title: '站点设置', perm: 'settings:view' } },
        { path: 'admins', component: () => import('@/views/Admins.vue'), meta: { title: '管理员', perm: 'admins:manage' } },
        { path: 'roles', component: () => import('@/views/Roles.vue'), meta: { title: '角色权限', perm: 'admins:manage' } },
        // 旧路径重定向到合并后的设置中心
        { path: 'site', redirect: '/settings' },
        { path: 'storage', redirect: '/settings' }
      ]
    }
  ]
});

/** 该管理员有权访问的第一个页面；一个都没有则返回 null。 */
function firstAllowed(can: (p: string) => boolean): string | null {
  return NAV_ALL.find((n) => can(n.perm))?.path ?? null;
}

router.beforeEach(async (to) => {
  const token = localStorage.getItem('admin_token');
  if (!to.meta.public && !token) return '/login';
  if (to.path === '/login' && token) return '/dashboard';
  if (!token) return true;

  const auth = useAuthStore();
  // 刷新页面后 store 是空的，先把权限拉回来再判断
  if (!auth.loaded) {
    try {
      await auth.loadMe();
    } catch {
      return true; // 401 已由 axios 拦截器踢回登录页
    }
  }

  const perm = to.meta.perm as string | undefined;
  if (perm && !auth.can(perm)) {
    const fallback = firstAllowed(auth.can);
    if (!fallback) {
      ElMessage.error('当前账号没有任何后台权限，请联系管理员');
      auth.logout();
      return '/login';
    }
    // 默认落地页没权限时静默改道，避免刚登录就弹「无权限」
    if (to.path !== '/dashboard') ElMessage.error('无权限访问该页面');
    return fallback;
  }
  return true;
});

export default router;
