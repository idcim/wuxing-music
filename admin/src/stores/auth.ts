import { defineStore } from 'pinia';
import { ref } from 'vue';
import * as api from '@/api';

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('admin_token') || '');
  const nickname = ref(localStorage.getItem('admin_nickname') || '');

  async function login(username: string, password: string) {
    const data = await api.login(username, password);
    token.value = data.token;
    nickname.value = data.nickname;
    localStorage.setItem('admin_token', data.token);
    localStorage.setItem('admin_nickname', data.nickname);
  }

  function logout() {
    token.value = '';
    nickname.value = '';
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_nickname');
  }

  return { token, nickname, login, logout };
});
