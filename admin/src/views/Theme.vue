<template>
  <BusinessPage title="风格管理">
    <BusinessCard v-loading="loading">
      <template #header>全端风格</template>
      <p class="description">发布后，小程序与 H5 下次打开或回到前台时读取新风格。后续页面沿用统一风格变量。</p>
      <div class="themes">
        <button v-for="item in options" :key="item.id" type="button" class="theme-option"
          :class="{ selected: selected === item.id }" :style="item.preview" @click="selected = item.id">
          <span class="theme-mark">{{ item.id === 'chinese_classic' ? '雅' : '✦' }}</span>
          <span class="theme-title">{{ item.name }}</span>
          <span class="theme-description">{{ item.description }}</span>
          <span class="theme-selection">{{ selected === item.id ? '已选' : '选择此风格' }}</span>
        </button>
      </div>
      <div class="actions">
        <el-button type="primary" :loading="saving" :disabled="selected === current || !canEdit" @click="save">发布风格</el-button>
        <span v-if="!canEdit" class="description">当前账号没有修改设置的权限</span>
      </div>
    </BusinessCard>
  </BusinessPage>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { getThemeSetting, updateThemeSetting } from '@/api';
import { useAuthStore } from '@/stores/auth';

type ThemeId = 'starlight' | 'chinese_classic';
const options = [
  { id: 'starlight', name: '星夜', description: '现有深色音乐风格', preview: 'background:#03050a;color:#e2e8f0;border-color:#475569;--preview-accent:#84cc16' },
  { id: 'chinese_classic', name: '中国古风', description: '水墨底色 · 宣纸暖字 · 朱砂点缀', preview: 'background:#151810;color:#f2e8d1;border-color:#cb7758;--preview-accent:#cb7758' }
] as const;
const auth = useAuthStore();
const canEdit = auth.can('settings:edit');
const loading = ref(false);
const saving = ref(false);
const selected = ref<ThemeId>('starlight');
const current = ref<ThemeId>('starlight');

async function load() {
  loading.value = true;
  try {
    const data = await getThemeSetting();
    current.value = data.theme_id === 'chinese_classic' ? 'chinese_classic' : 'starlight';
    selected.value = current.value;
  } finally { loading.value = false; }
}

async function save() {
  saving.value = true;
  try {
    await updateThemeSetting(selected.value);
    current.value = selected.value;
    ElMessage.success('风格已发布');
  } finally { saving.value = false; }
}
onMounted(load);
</script>

<style scoped>
.description { color: var(--el-text-color-secondary); line-height: 1.6; }
.themes { display: flex; flex-wrap: wrap; gap: 20px; margin: 24px 0; }
.theme-option { width: 230px; min-height: 188px; padding: 20px; text-align: left; border: 2px solid; border-radius: 12px; cursor: pointer; display: flex; flex-direction: column; gap: 8px; }
.theme-option.selected { box-shadow: 0 0 0 3px var(--el-color-primary-light-5); }
.theme-mark { font-family: serif; font-size: 36px; color: var(--preview-accent); }
.theme-title { font-size: 18px; font-weight: 600; }
.theme-description { font-size: 12px; opacity: .75; }
.theme-selection { margin-top: auto; font-size: 12px; }
.actions { display: flex; gap: 12px; align-items: center; }
</style>
