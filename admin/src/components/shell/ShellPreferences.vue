<script setup lang="ts">
import { ref } from 'vue';
import { Setting } from '@element-plus/icons-vue';
import { preferences, resetPreferences, updatePreferences } from '@vben/preferences';
const open = ref(false);
const widgetLabels = { fullscreen: '全屏按钮', globalSearch: '菜单搜索', refresh: '刷新页面', themeToggle: '主题切换', notification: '任务通知' };
</script>
<template>
  <el-tooltip content="偏好设置"><el-button text circle aria-label="偏好设置" @click="open = true"><el-icon><Setting /></el-icon></el-button></el-tooltip>
  <BusinessDrawer v-model="open" title="偏好设置" size="480px">
    <BusinessForm label-width="140px">
      <el-divider content-position="left">主题</el-divider>
      <el-form-item label="显示模式"><el-radio-group :model-value="preferences.theme.mode" @update:model-value="(value: unknown) => updatePreferences({theme:{mode:value as 'light' | 'dark' | 'auto'}})"><el-radio-button value="light">浅色</el-radio-button><el-radio-button value="dark">深色</el-radio-button><el-radio-button value="auto">跟随系统</el-radio-button></el-radio-group></el-form-item>
      <el-form-item label="深色侧边栏"><el-switch :model-value="preferences.theme.semiDarkSidebar" @update:model-value="(value: unknown) => updatePreferences({theme:{semiDarkSidebar:!!value}})" /></el-form-item>
      <el-divider content-position="left">导航与工具</el-divider>
      <el-form-item label="侧边栏宽度"><el-input-number :model-value="preferences.sidebar.width" :min="180" :max="360" :step="8" @update:model-value="(value: unknown) => updatePreferences({sidebar:{width:Number(value) || 224}})" /></el-form-item>
      <el-form-item label="折叠后悬停展开"><el-switch :model-value="preferences.sidebar.expandOnHover" @update:model-value="(value: unknown) => updatePreferences({sidebar:{expandOnHover:!!value}})" /></el-form-item>
      <el-form-item label="多标签栏"><el-switch :model-value="preferences.tabbar.enable" @update:model-value="(value: unknown) => updatePreferences({tabbar:{enable:!!value}})" /></el-form-item>
      <el-form-item v-for="(label,key) in widgetLabels" :key="key" :label="label"><el-switch :model-value="preferences.widget[key]" @update:model-value="(value: unknown) => updatePreferences({widget:{[key]:!!value}})" /></el-form-item>
      <el-form-item label="页面标题跟随菜单"><el-switch :model-value="preferences.app.dynamicTitle" @update:model-value="(value: unknown) => updatePreferences({app:{dynamicTitle:!!value}})" /></el-form-item>
      <el-divider content-position="left">版本更新</el-divider>
      <el-form-item label="自动检测更新"><el-switch :model-value="preferences.app.enableCheckUpdates" @update:model-value="(value: unknown) => updatePreferences({app:{enableCheckUpdates:!!value}})" /></el-form-item>
      <el-form-item label="检查间隔（分钟）"><el-input-number :model-value="preferences.app.checkUpdatesInterval" :min="1" :max="60" @update:model-value="(value: unknown) => updatePreferences({app:{checkUpdatesInterval:Number(value) || 1}})" /></el-form-item>
      <p>界面偏好保存在当前浏览器；恢复默认不会清除登录态、业务资料或任务历史。</p>
      <el-button @click="resetPreferences()">恢复默认界面</el-button>
    </BusinessForm>
  </BusinessDrawer>
</template>
<style scoped>p { color:var(--el-text-color-secondary); line-height:1.7; margin:16px 0; }</style>
