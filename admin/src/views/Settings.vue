<template>
  <div>
    <el-card style="max-width: 640px">
      <template #header>微信支付参数</template>
      <el-form :model="form" label-width="120px" v-loading="loading">
        <el-form-item label="启用支付">
          <el-switch v-model="form.enabled" />
        </el-form-item>
        <el-form-item label="AppID">
          <el-input v-model="form.wx_app_id" placeholder="小程序 AppID" />
        </el-form-item>
        <el-form-item label="商户号">
          <el-input v-model="form.wx_mch_id" placeholder="微信支付商户号" />
        </el-form-item>
        <el-form-item label="API 密钥">
          <el-input v-model="form.wx_api_key" type="password" show-password
            :placeholder="apiKeySet ? '已设置（留空则不修改）' : '请输入 API v3 密钥'" />
        </el-form-item>
        <el-form-item label="回调地址">
          <el-input v-model="form.notify_url" placeholder="https://your-domain/api/pay/callback" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="saving" @click="onSave">保存</el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { getPaySetting, updatePaySetting } from '@/api';

const loading = ref(false);
const saving = ref(false);
const apiKeySet = ref(false);
const form = reactive({ enabled: false, wx_app_id: '', wx_mch_id: '', wx_api_key: '', notify_url: '' });

async function load() {
  loading.value = true;
  try {
    const data = await getPaySetting();
    form.enabled = data.enabled ?? false;
    form.wx_app_id = data.wx_app_id ?? '';
    form.wx_mch_id = data.wx_mch_id ?? '';
    form.notify_url = data.notify_url ?? '';
    apiKeySet.value = data.wx_api_key_set ?? false;
    form.wx_api_key = '';
  } finally {
    loading.value = false;
  }
}

async function onSave() {
  saving.value = true;
  try {
    await updatePaySetting({ ...form });
    ElMessage.success('已保存');
    load();
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>
