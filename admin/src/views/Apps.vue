<script setup lang="ts">
import { ref } from 'vue';
import AppSettings from '@/components/apps/AppSettings.vue';
import ReleaseManager from '@/components/apps/ReleaseManager.vue';
import WechatSettings from '@/components/apps/WechatSettings.vue';
const tab = ref('settings');
</script>

<template>
  <BusinessPage title="APP管理" description="集中维护下载页、安卓版本与微信开放平台登录。" :card="false">
    <BusinessCard>
      <el-tabs v-model="tab" class="apps-tabs">
        <el-tab-pane label="基础与下载" name="settings"><AppSettings /></el-tab-pane>
        <el-tab-pane label="版本发布" name="releases" lazy><ReleaseManager /></el-tab-pane>
        <el-tab-pane label="微信登录" name="wechat" lazy><WechatSettings /></el-tab-pane>
      </el-tabs>
    </BusinessCard>
  </BusinessPage>
</template>

<style scoped>
.apps-tabs :deep(.el-tabs__content) { padding-top: 12px; }
</style>
