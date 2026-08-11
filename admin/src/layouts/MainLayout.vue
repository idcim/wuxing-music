<template>
  <el-container class="layout">
    <el-aside width="220px" class="layout__aside">
      <div class="layout__logo">{{ site.name }}</div>
      <el-menu :default-active="route.path" router class="layout__menu" background-color="#0a0e1a"
        text-color="#94a3b8" active-text-color="#fff">
        <el-menu-item v-for="item in mainNav" :key="item.path" :index="item.path">
          <el-icon><component :is="item.icon" /></el-icon><span>{{ item.title }}</span>
        </el-menu-item>
        <el-sub-menu v-if="agentNav.length" index="agent">
          <template #title><el-icon><Shop /></el-icon><span>代理分成</span></template>
          <el-menu-item v-for="item in agentNav" :key="item.path" :index="item.path">
            <el-icon><component :is="item.icon" /></el-icon><span>{{ item.title }}</span>
          </el-menu-item>
        </el-sub-menu>
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
import { useSiteStore } from '@/stores/site';
import { NAV_MAIN, NAV_AGENT, NAV_SYSTEM } from '@/menu';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
// 侧边栏品牌名跟着「设置中心 → 站点信息」的项目名称走
const site = useSiteStore();

// 无权限、或所属可选模块未开启的，都不进菜单
//（拦截以后端 require_perm / require_enabled 为准，这里只是体验）
const visible = (n: { perm: string; feature?: string }) =>
  auth.can(n.perm) && auth.hasFeature(n.feature);
const mainNav = computed(() => NAV_MAIN.filter(visible));
// 逐项过滤：模块关闭时这一组只剩「分成设置」，整组为空才隐藏
const agentNav = computed(() => NAV_AGENT.filter(visible));
const systemNav = computed(() => NAV_SYSTEM.filter(visible));

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
