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
    loaded.value = true;
    localStorage.setItem('admin_nickname', nickname.value);
  }

  async function login(username: string, password: string) {
    const data = await api.login(username, password);
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

  return { token, nickname, username, isSuper, roleName, permissions, loaded, login, logout, loadMe, can };
});
