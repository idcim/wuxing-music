<template>
  <el-card style="max-width: 680px" v-loading="loading">
    <template #header>公众号配置</template>
    <el-alert type="info" :closable="false" show-icon style="margin-bottom: 16px"
      title="服务号 AppID/AppSecret，用于 H5（微信内）网页授权登录、JS-SDK 与公众号 JSAPI 支付。填入后即启用；需在公众号后台配置「网页授权域名」与「JS 接口安全域名」。留空则走开发兜底。" />
    <el-form :model="form" label-width="120px">
      <el-form-item label="AppID">
        <el-input v-model="form.app_id" placeholder="wx 开头的公众号（服务号）AppID" />
      </el-form-item>
      <el-form-item label="AppSecret">
        <el-input v-model="form.app_secret" type="password" show-password
          :placeholder="secretSet ? '已设置（留空则不修改）' : '公众号密钥'" />
      </el-form-item>
      <el-form-item label="原始 ID">
        <el-input v-model="form.original_id" placeholder="gh_xxxxxx" />
      </el-form-item>
      <el-form-item label="公众号名称">
        <el-input v-model="form.oa_name" />
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
import { getOaSetting, updateOaSetting } from '@/api';

const loading = ref(false);
const saving = ref(false);
const secretSet = ref(false);
const form = reactive({ app_id: '', app_secret: '', original_id: '', oa_name: '' });

async function load() {
  loading.value = true;
  try {
    const d = await getOaSetting();
    form.app_id = d.app_id ?? '';
    form.original_id = d.original_id ?? '';
    form.oa_name = d.oa_name ?? '';
    secretSet.value = d.app_secret_set ?? false;
    form.app_secret = '';
  } finally {
    loading.value = false;
  }
}

async function onSave() {
  saving.value = true;
  try {
    await updateOaSetting({ ...form });
    ElMessage.success('已保存');
    load();
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>
