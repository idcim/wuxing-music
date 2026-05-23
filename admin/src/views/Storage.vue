<template>
  <div>
    <el-card style="max-width: 680px" v-loading="loading">
      <template #header>文件存储设置</template>
      <el-form :model="form" label-width="130px">
        <el-form-item label="存储方式">
          <el-radio-group v-model="form.provider">
            <el-radio value="local">本地存储</el-radio>
            <el-radio value="oss">阿里云 OSS</el-radio>
          </el-radio-group>
        </el-form-item>

        <template v-if="form.provider === 'oss'">
          <el-alert type="warning" :closable="false" show-icon style="margin-bottom: 16px"
            title="OSS 上传逻辑尚未启用，当前仅保存配置；切到本地存储可正常上传。" />
          <el-form-item label="Endpoint">
            <el-input v-model="form.oss_endpoint" placeholder="oss-cn-hangzhou.aliyuncs.com" />
          </el-form-item>
          <el-form-item label="Bucket">
            <el-input v-model="form.oss_bucket" />
          </el-form-item>
          <el-form-item label="AccessKey ID">
            <el-input v-model="form.oss_access_key_id" />
          </el-form-item>
          <el-form-item label="AccessKey Secret">
            <el-input v-model="form.oss_access_key_secret" type="password" show-password
              :placeholder="secretSet ? '已设置（留空不修改）' : '请输入'" />
          </el-form-item>
          <el-form-item label="访问域名">
            <el-input v-model="form.oss_base_url" placeholder="https://cdn.your-domain.com" />
          </el-form-item>
        </template>

        <template v-else>
          <el-alert type="success" :closable="false" show-icon style="margin-bottom: 16px"
            title="本地存储：上传文件保存在后端 /uploads，通过后端 URL 访问（已持久化到卷）。" />
        </template>

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
import { getStorageSetting, updateStorageSetting } from '@/api';

const loading = ref(false);
const saving = ref(false);
const secretSet = ref(false);
const form = reactive({
  provider: 'local', oss_endpoint: '', oss_bucket: '',
  oss_access_key_id: '', oss_access_key_secret: '', oss_base_url: ''
});

async function load() {
  loading.value = true;
  try {
    const d = await getStorageSetting();
    Object.assign(form, {
      provider: d.provider ?? 'local',
      oss_endpoint: d.oss_endpoint ?? '',
      oss_bucket: d.oss_bucket ?? '',
      oss_access_key_id: d.oss_access_key_id ?? '',
      oss_access_key_secret: '',
      oss_base_url: d.oss_base_url ?? ''
    });
    secretSet.value = d.oss_access_key_secret_set ?? false;
  } finally {
    loading.value = false;
  }
}

async function onSave() {
  saving.value = true;
  try {
    await updateStorageSetting({ ...form });
    ElMessage.success('已保存');
    load();
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>
