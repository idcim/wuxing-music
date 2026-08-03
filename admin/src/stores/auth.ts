import { defineStore } from 'pinia';
import { ref } from 'vue';
import * as api from '@/api';

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('admin_token') || '');
  const nickname = ref(localStorage.getItem('admin_nickname') || '');
  const username = ref('');
  const isSuper = ref(false);
  const roleName = ref('');
  const permissions = ref<string[]>([]);
  // 可选模块开关（后端 /me 下发）。与权限是两回事：有权限但模块没开，菜单一样不该出现。
  const features = ref<Record<string, boolean>>({});
  // 刷新页面后权限尚未拉回来，此时不能把菜单全判成无权限
  const loaded = ref(false);

  /** 拉取当前管理员权限，用于显隐菜单与路由守卫（真正的拦截在后端 require_perm）。 */
  async function loadMe() {
    if (!token.value) return;
    const data = await api.getMe();
    nickname.value = data.nickname || '';
    username.value = data.username || '';
    isSuper.value = !!data.is_super;
    roleName.value = data.role_name || '';
    permissions.value = data.permissions || [];
    features.value = data.features || {};
    loaded.value = true;
    localStorage.setItem('admin_nickname', nickname.value);
  }

  async function login(username: string, password: string, captchaId: string, captchaCode: string) {
    const data = await api.login(username, password, captchaId, captchaCode);
    token.value = data.token;
    nickname.value = data.nickname;
    localStorage.setItem('admin_token', data.token);
    localStorage.setItem('admin_nickname', data.nickname);
    await loadMe();
  }

  function logout() {
    token.value = '';
    nickname.value = '';
    username.value = '';
    isSuper.value = false;
    roleName.value = '';
    permissions.value = [];
    features.value = {};
    loaded.value = false;
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_nickname');
  }

  /** 是否拥有某权限点。超管恒为真；权限还没加载完先放行，避免菜单闪烁。 */
  function can(perm: string): boolean {
    if (!loaded.value) return true;
    if (isSuper.value) return true;
    return permissions.value.includes(perm);
  }

  /** 可选模块是否开启。与 can() 不同：**未加载完时判为关闭**——
   *  宁可菜单晚一拍出现，也不能让关闭的模块闪一下。 */
  function hasFeature(name?: string): boolean {
    if (!name) return true;
    return !!features.value[name];
  }

  return {
    token, nickname, username, isSuper, roleName, permissions, features, loaded,
    login, logout, loadMe, can, hasFeature,
  };
});
