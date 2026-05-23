<template>
  <el-card style="max-width: 680px" v-loading="loading">
    <template #header>小程序配置</template>
    <el-alert type="info" :closable="false" show-icon style="margin-bottom: 16px"
      title="AppID/AppSecret 用于后端 wx.login code 换取 openid/unionid。前端的 AppID 另需在小程序 project.config.json 配置。" />
    <el-form :model="form" label-width="120px">
      <el-form-item label="AppID">
        <el-input v-model="form.app_id" placeholder="wx 开头的小程序 AppID" />
      </el-form-item>
      <el-form-item label="AppSecret">
        <el-input v-model="form.app_secret" type="password" show-password
          :placeholder="secretSet ? '已设置（留空则不修改）' : '小程序密钥'" />
      </el-form-item>
      <el-form-item label="原始 ID">
        <el-input v-model="form.original_id" placeholder="gh_xxxxxx" />
      </el-form-item>
      <el-form-item label="小程序名称">
        <el-input v-model="form.mp_name" />
      </el-form-item>
      <el-form-item label="客服号/方式">
        <el-input v-model="form.customer_service" />
      </el-form-item>
      <el-form-item label="环境版本">
        <el-select v-model="form.env_version">
          <el-option label="正式版 release" value="release" />
          <el-option label="体验版 trial" value="trial" />
          <el-option label="开发版 develop" value="develop" />
        </el-select>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" :loading="saving" @click="onSave">保存</el-button>
      </el-form-item>
    </el-form>
  </el-card>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { getMpSetting, updateMpSetting } from '@/api';

const loading = ref(false);
const saving = ref(false);
const secretSet = ref(false);
const form = reactive({
  app_id: '', app_secret: '', original_id: '',
  mp_name: '', customer_service: '', env_version: 'release'
});

async function load() {
  loading.value = true;
  try {
    const d = await getMpSetting();
    form.app_id = d.app_id ?? '';
    form.original_id = d.original_id ?? '';
    form.mp_name = d.mp_name ?? '';
    form.customer_service = d.customer_service ?? '';
    form.env_version = d.env_version ?? 'release';
    secretSet.value = d.app_secret_set ?? false;
    form.app_secret = '';
  } finally {
    loading.value = false;
  }
}

async function onSave() {
  saving.value = true;
  try {
    await updateMpSetting({ ...form });
    ElMessage.success('已保存');
    load();
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>
