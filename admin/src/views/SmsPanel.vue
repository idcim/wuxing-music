<template>
  <el-card style="max-width: 680px" v-loading="loading">
    <template #header>短信配置</template>
    <el-alert type="info" :closable="false" show-icon style="margin-bottom: 16px"
      title="短信验证码服务商配置，用于手机号登录发码。未启用或未配置时，后端走开发兜底（日志打印验证码），便于联调。" />
    <el-form :model="form" label-width="120px">
      <el-form-item label="启用">
        <el-switch v-model="form.enabled" />
      </el-form-item>
      <el-form-item label="服务商">
        <el-select v-model="form.provider">
          <el-option label="阿里云" value="aliyun" />
          <el-option label="腾讯云" value="tencent" />
        </el-select>
      </el-form-item>
      <el-form-item label="AccessKeyId">
        <el-input v-model="form.access_key_id" placeholder="服务商 AccessKeyId" />
      </el-form-item>
      <el-form-item label="AccessKeySecret">
        <el-input v-model="form.access_key_secret" type="password" show-password
          :placeholder="secretSet ? '已设置（留空则不修改）' : '服务商密钥'" />
      </el-form-item>
      <el-form-item label="短信签名">
        <el-input v-model="form.sign_name" placeholder="如：五行律音" />
      </el-form-item>
      <el-form-item label="模板 Code">
        <el-input v-model="form.template_code" placeholder="如：SMS_123456789" />
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
import { getSmsSetting, updateSmsSetting } from '@/api';

const loading = ref(false);
const saving = ref(false);
const secretSet = ref(false);
const form = reactive({
  provider: 'aliyun', access_key_id: '', access_key_secret: '',
  sign_name: '', template_code: '', enabled: false
});

async function load() {
  loading.value = true;
  try {
    const d = await getSmsSetting();
    form.provider = d.provider ?? 'aliyun';
    form.access_key_id = d.access_key_id ?? '';
    form.sign_name = d.sign_name ?? '';
    form.template_code = d.template_code ?? '';
    form.enabled = d.enabled ?? false;
    secretSet.value = d.access_key_secret_set ?? false;
    form.access_key_secret = '';
  } finally {
    loading.value = false;
  }
}

async function onSave() {
  saving.value = true;
  try {
    await updateSmsSetting({ ...form });
    ElMessage.success('已保存');
    load();
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>
