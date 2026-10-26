<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Search } from '@element-plus/icons-vue';
import { preferences } from '@vben/preferences';
import type { NavItem } from '@/menu';
const props = defineProps<{ menus: NavItem[] }>();
const router = useRouter(), open = ref(false), keyword = ref(''), input = ref<{ focus: () => void }>();
const matches = computed(() => props.menus.filter((menu) => `${menu.title} ${menu.path}`.toLowerCase().includes(keyword.value.trim().toLowerCase())));
async function show() { open.value = true; await nextTick(); input.value?.focus(); }
function navigate(path: string) { open.value = false; void router.push(path); }
function shortcut(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && preferences.widget.globalSearch && preferences.shortcutKeys.enable && preferences.shortcutKeys.globalSearch) {
    event.preventDefault(); void show();
  }
}
watch(open, (value) => { if (!value) keyword.value = ''; });
onMounted(() => window.addEventListener('keydown', shortcut));
onUnmounted(() => window.removeEventListener('keydown', shortcut));
</script>
<template>
  <el-tooltip content="菜单搜索（Ctrl / ⌘ + K）"><el-button text circle aria-label="菜单搜索" @click="show"><el-icon><Search /></el-icon></el-button></el-tooltip>
  <BusinessModal v-model="open" title="菜单搜索" width="560px">
    <el-input ref="input" v-model="keyword" placeholder="搜索可访问的菜单" clearable @keydown.enter.prevent="matches[0] && navigate(matches[0].path)" />
    <div class="menu-search__results"><button v-for="menu in matches" :key="menu.path" class="menu-search__item" @click="navigate(menu.path)"><span>{{ menu.title }}</span><small>{{ menu.path }}</small></button><el-empty v-if="!matches.length" description="没有匹配的可访问菜单" /></div>
  </BusinessModal>
</template>
<style scoped>
.menu-search__results { max-height:50vh; overflow:auto; margin-top:12px; }
.menu-search__item { display:flex; justify-content:space-between; width:100%; padding:12px; border-radius:6px; text-align:left; }
.menu-search__item:hover,.menu-search__item:focus-visible { background:var(--el-color-primary-light-9); color:var(--el-color-primary); }
small { color:var(--el-text-color-secondary); }
</style>
