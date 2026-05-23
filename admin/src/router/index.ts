import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', component: () => import('@/views/Login.vue'), meta: { public: true } },
    {
      path: '/',
      component: () => import('@/layouts/MainLayout.vue'),
      redirect: '/dashboard',
      children: [
        { path: 'dashboard', component: () => import('@/views/Dashboard.vue'), meta: { title: '仪表盘' } },
        { path: 'plans', component: () => import('@/views/Plans.vue'), meta: { title: '套餐管理' } },
        { path: 'elements', component: () => import('@/views/Elements.vue'), meta: { title: '五行管理' } },
        { path: 'tracks', component: () => import('@/views/Tracks.vue'), meta: { title: '歌曲管理' } },
        { path: 'cdkeys', component: () => import('@/views/Cdkeys.vue'), meta: { title: '兑换码' } },
        { path: 'quiz', component: () => import('@/views/Quiz.vue'), meta: { title: '测评管理' } },
        { path: 'users', component: () => import('@/views/Users.vue'), meta: { title: '用户' } },
        { path: 'settings', component: () => import('@/views/Settings.vue'), meta: { title: '支付设置' } }
      ]
    }
  ]
});

router.beforeEach((to) => {
  const token = localStorage.getItem('admin_token');
  if (!to.meta.public && !token) return '/login';
  if (to.path === '/login' && token) return '/dashboard';
  return true;
});

export default router;
