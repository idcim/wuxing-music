<template>
  <div>
    <el-card style="max-width: 720px" v-loading="loading">
      <template #header>站点信息</template>
      <el-form :model="form" label-width="110px">
        <el-form-item label="项目名称">
          <el-input v-model="form.site_name" placeholder="五行律音" />
        </el-form-item>
        <el-form-item label="LOGO">
          <el-upload
            class="logo-upload"
            :action="UPLOAD_URL"
            :headers="uploadHeaders"
            :show-file-list="false"
            accept="image/*"
            :on-success="onLogoSuccess"
            :on-error="onUploadError"
          >
            <img v-if="form.logo_url" :src="form.logo_url" class="logo-preview" />
            <el-icon v-else class="logo-uploader-icon"><Plus /></el-icon>
          </el-upload>
          <div class="hint">点击上传，建议正方形 PNG</div>
        </el-form-item>
        <el-form-item label="备案号">
          <el-input v-model="form.icp_no" placeholder="粤ICP备2026000000号" />
        </el-form-item>
        <el-form-item label="联系邮箱">
          <el-input v-model="form.contact_email" />
        </el-form-item>
        <el-form-item label="联系电话">
          <el-input v-model="form.contact_phone" />
        </el-form-item>
        <el-form-item label="关于我们">
          <el-input v-model="form.about_us" type="textarea" :rows="6"
            placeholder="将展示在小程序「关于我们」页面" />
        </el-form-item>
        <el-form-item label="服务条款">
          <el-input v-model="form.service_terms" type="textarea" :rows="4" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="saving" @click="onSave">保存</el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { Plus } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { getSiteSetting, updateSiteSetting, UPLOAD_URL } from '@/api';

const loading = ref(false);
const saving = ref(false);
const form = reactive({
  site_name: '', logo_url: '', icp_no: '', contact_email: '',
  contact_phone: '', about_us: '', service_terms: ''
});

const uploadHeaders = computed(() => ({
  Authorization: `Bearer ${localStorage.getItem('admin_token')}`
}));

async function load() {
  loading.value = true;
  try {
    const d = await getSiteSetting();
    Object.assign(form, {
      site_name: d.site_name ?? '五行律音',
      logo_url: d.logo_url ?? '',
      icp_no: d.icp_no ?? '',
      contact_email: d.contact_email ?? '',
      contact_phone: d.contact_phone ?? '',
      about_us: d.about_us ?? '',
      service_terms: d.service_terms ?? ''
    });
  } finally {
    loading.value = false;
  }
}

function onLogoSuccess(res: any) {
  if (res?.code === 0) {
    form.logo_url = res.data.url;
    ElMessage.success('LOGO 已上传');
  } else {
    ElMessage.error(res?.msg || '上传失败');
  }
}
function onUploadError() {
  ElMessage.error('上传失败');
}

async function onSave() {
  saving.value = true;
  try {
    await updateSiteSetting({ ...form });
    ElMessage.success('已保存');
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.logo-upload :deep(.el-upload) {
  border: 1px dashed #d9d9d9;
  border-radius: 8px;
  width: 100px;
  height: 100px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.logo-preview { width: 100px; height: 100px; object-fit: contain; }
.logo-uploader-icon { font-size: 28px; color: #999; }
.hint { margin-top: 6px; color: #999; font-size: 12px; }
</style>
