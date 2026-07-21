<template>
  <el-container class="layout">
    <el-aside width="220px" class="layout__aside">
      <div class="layout__logo">五行律音</div>
      <el-menu :default-active="route.path" router class="layout__menu" background-color="#0a0e1a"
        text-color="#94a3b8" active-text-color="#fff">
        <el-menu-item v-for="item in mainNav" :key="item.path" :index="item.path">
          <el-icon><component :is="item.icon" /></el-icon><span>{{ item.title }}</span>
        </el-menu-item>
        <el-sub-menu v-if="systemNav.length" index="system">
          <template #title><el-icon><Tools /></el-icon><span>系统管理</span></template>
          <el-menu-item v-for="item in systemNav" :key="item.path" :index="item.path">
            <el-icon><component :is="item.icon" /></el-icon><span>{{ item.title }}</span>
          </el-menu-item>
        </el-sub-menu>
      </el-menu>
    </el-aside>
    <el-container>
      <el-header class="layout__header">
        <span class="layout__title">{{ route.meta.title || '' }}</span>
        <el-dropdown @command="onCommand">
          <span class="layout__user">
            {{ auth.nickname || '管理员' }}
            <el-tag v-if="auth.isSuper" size="small" type="danger" effect="plain">超管</el-tag>
            <el-tag v-else-if="auth.roleName" size="small" effect="plain">{{ auth.roleName }}</el-tag>
            <el-icon><ArrowDown /></el-icon>
          </span>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="logout">退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </el-header>
      <el-main class="layout__main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { NAV_MAIN, NAV_SYSTEM } from '@/menu';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

// 无权限的模块不进菜单（拦截以后端 require_perm 为准，这里只是体验）
const mainNav = computed(() => NAV_MAIN.filter((n) => auth.can(n.perm)));
const systemNav = computed(() => NAV_SYSTEM.filter((n) => auth.can(n.perm)));

onMounted(() => {
  if (!auth.loaded) auth.loadMe().catch(() => {});
});

function onCommand(cmd: string) {
  if (cmd === 'logout') {
    auth.logout();
    router.push('/login');
  }
}
</script>

<style scoped>
.layout { height: 100vh; }
.layout__aside { background: #0a0e1a; }
.layout__logo {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 18px;
  letter-spacing: 3px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.layout__menu { border-right: none; }
.layout__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #fff;
  border-bottom: 1px solid #eee;
}
.layout__title { font-size: 16px; font-weight: 500; }
.layout__user { cursor: pointer; display: flex; align-items: center; gap: 4px; color: #555; }
.layout__main { background: #f5f7fa; }
</style>
