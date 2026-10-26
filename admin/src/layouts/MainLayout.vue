<script setup lang="ts">
import { computed, markRaw, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import * as Icons from '@element-plus/icons-vue';
import { VbenAdminLayout } from '@vben-core/layout-ui';
import { Menu } from '@vben-core/menu-ui';
import { preferences, updatePreferences, usePreferences } from '@vben/preferences';
import { VbenFullScreen } from '@vben-core/shadcn-ui';
import { useMediaQuery } from '@vueuse/core';
import { useAuthStore } from '@/stores/auth';
import { useSiteStore } from '@/stores/site';
import { NAV_MAIN, NAV_AGENT, NAV_SYSTEM, NAV_ALL, type NavItem } from '@/menu';
import NotifyBell from '@/components/NotifyBell.vue';
import CheckUpdates from '@/components/shell/CheckUpdates.vue';
import MenuSearch from '@/components/shell/MenuSearch.vue';
import ShellPreferences from '@/components/shell/ShellPreferences.vue';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const site = useSiteStore();
const mobile = useMediaQuery('(max-width: 767px)');
const collapsed = computed({
  get: () => preferences.sidebar.collapsed,
  set: (value: boolean) => updatePreferences({ sidebar: { collapsed: value } }),
});
const { isDark } = usePreferences();
const updates = ref<InstanceType<typeof CheckUpdates>>();
const visible = (n: NavItem) => auth.can(n.perm) && auth.hasFeature(n.feature);
const asMenu = (n: NavItem) => ({
  path: n.path, name: n.title,
  icon: markRaw((Icons as Record<string, any>)[n.icon] || Icons.Menu),
});
const menus = computed(() => {
  const agent = NAV_AGENT.filter(visible).map(asMenu);
  const system = NAV_SYSTEM.filter(visible).map(asMenu);
  return [
    ...NAV_MAIN.filter(visible).map(asMenu),
    ...(agent.length ? [{ path: '/agent-menu', name: '代理分成', icon: markRaw(Icons.Shop), children: agent }] : []),
    ...(system.length ? [{ path: '/system-menu', name: '系统管理', icon: markRaw(Icons.Setting), children: system }] : []),
  ];
});
const tabKey = computed(() => `admin_tabs_${auth.username}`);
const tabs = ref<{ path: string; title: string }[]>([]);
const refreshKey = ref(0);
watch(() => [route.meta.title, site.name, preferences.app.dynamicTitle], () => {
  document.title = preferences.app.dynamicTitle && route.meta.title ? `${route.meta.title} · ${site.name}` : `${site.name} · 管理后台`;
}, { immediate: true });
try {
  const cached = JSON.parse(localStorage.getItem(tabKey.value) || '[]');
  if (Array.isArray(cached)) tabs.value = cached.filter(t => NAV_ALL.some(n => n.path === t.path && visible(n)));
} catch { /* 损坏的浏览器缓存不影响进入后台 */ }
watch(() => route.path, () => {
  if (!tabs.value.some(t => t.path === route.path)) {
    tabs.value.push({ path: route.path, title: String(route.meta.title || '') });
  }
  tabs.value = tabs.value.slice(-16);
  localStorage.setItem(tabKey.value, JSON.stringify(tabs.value));
  if (mobile.value) collapsed.value = true;
}, { immediate: true });

function closeTab(path: string) {
  const index = tabs.value.findIndex(t => t.path === path);
  if (index < 0 || tabs.value.length === 1) return;
  tabs.value.splice(index, 1);
  localStorage.setItem(tabKey.value, JSON.stringify(tabs.value));
  if (route.path === path) router.push(tabs.value[Math.max(0, index - 1)].path);
}
function tabCommand(command: string) {
  if (command === 'refresh') { refreshKey.value++; return; }
  const current = tabs.value.findIndex((tab) => tab.path === route.path);
  tabs.value = tabs.value.filter((tab, index) => tab.path === route.path || (command === 'left' ? index > current : command === 'right' ? index < current : false));
  localStorage.setItem(tabKey.value, JSON.stringify(tabs.value));
}
function logout() {
  auth.logout();
  router.push('/login');
}
</script>

<template>
  <VbenAdminLayout v-model:sidebar-collapse="collapsed" :is-mobile="mobile"
    :sidebar-width="preferences.sidebar.width" :side-collapse-width="64" :header-height="56"
    :header-toggle-sidebar-button="false" :sidebar-fixed-button="false"
    :sidebar-expand-on-hover="preferences.sidebar.expandOnHover" :tabbar-enable="preferences.tabbar.enable"
    :sidebar-draggable="false" :content-padding="0" :content-padding-top="0"
    :content-padding-left="0" :content-padding-right="0" :content-padding-bottom="0"
    :header-theme="isDark ? 'dark' : 'light'" :sidebar-theme="isDark || preferences.theme.semiDarkSidebar ? 'dark' : 'light'" @toggle-sidebar="collapsed = !collapsed">
    <template #logo>
      <router-link to="/" class="admin-brand" :class="{ 'is-dark': isDark || preferences.theme.semiDarkSidebar }">
        <span class="admin-brand__mark"><el-icon><Icons.Headset /></el-icon></span>
        <span v-if="!collapsed" class="admin-brand__name">{{ site.name }}</span>
      </router-link>
    </template>
    <template #menu>
      <Menu :menus="menus" :collapse="collapsed" :default-active="route.path"
        :theme="isDark || preferences.theme.semiDarkSidebar ? 'dark' : 'light'" rounded @select="(path: string) => router.push(path)" />
    </template>
    <template #header>
      <div class="admin-header">
        <el-button text circle aria-label="展开或折叠菜单" @click="collapsed = !collapsed">
          <el-icon :size="20"><Icons.Expand v-if="collapsed" /><Icons.Fold v-else /></el-icon>
        </el-button>
        <el-breadcrumb class="admin-breadcrumb">
          <el-breadcrumb-item>工作台</el-breadcrumb-item>
          <el-breadcrumb-item>{{ route.meta.title }}</el-breadcrumb-item>
        </el-breadcrumb>
        <div class="admin-header__actions">
          <MenuSearch v-if="preferences.widget.globalSearch" :menus="NAV_ALL.filter(visible)" />
          <el-tooltip v-if="preferences.widget.refresh" content="刷新当前页面"><el-button text circle aria-label="刷新当前页面" @click="refreshKey++"><el-icon><Icons.Refresh /></el-icon></el-button></el-tooltip>
          <el-tooltip content="检查后台更新"><el-button text circle aria-label="检查后台更新" :loading="updates?.checking" @click="updates?.check(true)"><el-icon><Icons.RefreshRight /></el-icon></el-button></el-tooltip>
          <el-tooltip v-if="preferences.widget.fullscreen" content="切换全屏"><VbenFullScreen aria-label="切换全屏" /></el-tooltip>
          <el-tooltip v-if="preferences.widget.themeToggle" :content="isDark ? '切换浅色主题' : '切换深色主题'">
            <el-button text circle aria-label="切换主题" @click="updatePreferences({ theme: { mode: isDark ? 'light' : 'dark' } })"><el-icon><Icons.Sunny v-if="isDark" /><Icons.Moon v-else /></el-icon></el-button>
          </el-tooltip>
          <NotifyBell v-if="preferences.widget.notification && auth.can('tracks:view')" />
          <ShellPreferences v-if="preferences.app.enablePreferences" />
          <el-dropdown @command="logout">
            <span class="admin-user"><el-avatar :size="30">{{ (auth.nickname || auth.username || '管').slice(0, 1) }}</el-avatar>
              <span>{{ auth.nickname || auth.username }}</span><el-icon><Icons.ArrowDown /></el-icon></span>
            <template #dropdown><el-dropdown-menu><el-dropdown-item disabled>{{ auth.isSuper ? '超级管理员' : auth.roleName || '管理员' }}</el-dropdown-item><el-dropdown-item command="logout" divided>退出登录</el-dropdown-item></el-dropdown-menu></template>
          </el-dropdown>
        </div>
      </div>
    </template>
    <template #tabbar>
      <div class="admin-tabs">
        <div v-for="tab in tabs" :key="tab.path" class="admin-tab" :class="{ 'is-active': route.path === tab.path }">
          <button class="admin-tab__link" @click="router.push(tab.path)">{{ tab.title }}</button>
          <button v-if="tabs.length > 1" class="admin-tab__close" :aria-label="`关闭${tab.title}`" @click="closeTab(tab.path)">×</button>
        </div>
        <el-dropdown class="admin-tabs__more" @command="tabCommand"><el-button text aria-label="标签页操作"><el-icon><Icons.MoreFilled /></el-icon></el-button><template #dropdown><el-dropdown-menu><el-dropdown-item command="refresh">刷新当前标签</el-dropdown-item><el-dropdown-item command="left">关闭左侧标签</el-dropdown-item><el-dropdown-item command="right">关闭右侧标签</el-dropdown-item><el-dropdown-item command="others">关闭其他标签</el-dropdown-item></el-dropdown-menu></template></el-dropdown>
      </div>
    </template>
    <template #content><router-view :key="refreshKey" /></template>
  </VbenAdminLayout>
  <CheckUpdates ref="updates" />
</template>

<style scoped>
.admin-brand { display:flex; align-items:center; gap:12px; height:56px; padding:0 18px; color:var(--el-text-color-primary); text-decoration:none; overflow:hidden; }
.admin-brand.is-dark { color:#f8fafc; }
.admin-brand__mark { display:flex; align-items:center; justify-content:center; flex-shrink:0; width:30px; height:30px; border-radius:9px; background:#3b82f6; color:white; }
.admin-brand__name { white-space:nowrap; font-size:17px; font-weight:600; letter-spacing:1px; }
.admin-header { display:flex; align-items:center; gap:12px; width:100%; height:100%; padding:0 16px; }
.admin-breadcrumb { flex:1; }
.admin-header__actions { display:flex; align-items:center; gap:8px; margin-left:auto; }
.admin-user { display:flex; align-items:center; gap:8px; cursor:pointer; color:var(--el-text-color-primary); }
.admin-tabs { display:flex; align-items:center; height:40px; padding:0 12px; gap:4px; overflow:auto; border-bottom:1px solid var(--el-border-color-light); background:var(--el-bg-color); }
.admin-tab { display:flex; align-items:center; flex-shrink:0; height:32px; border-radius:6px 6px 0 0; color:var(--el-text-color-regular); }
.admin-tab.is-active { color:var(--el-color-primary); background:var(--el-color-primary-light-9); }
.admin-tab__link { height:100%; padding:0 12px; font-size:13px; }
.admin-tab__close { padding:0 8px 0 0; font-size:18px; }
.admin-tabs__more { margin-left:auto; position:sticky; right:0; background:var(--el-bg-color); }
@media(max-width:767px) {
  .admin-breadcrumb { display:none; }
  .admin-header { padding:0 8px; gap:4px; min-width:0; }
  .admin-user > span { display:none; }
  .admin-header__actions { min-width:0; overflow-x:auto; max-width:calc(100vw - 64px); }
  .admin-header__actions > * { flex-shrink:0; }
}
</style>
