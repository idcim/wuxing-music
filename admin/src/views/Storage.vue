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
          <el-alert type="info" :closable="false" show-icon style="margin-bottom: 16px"
            title="阿里云 OSS：保存配置后新上传的文件直传 OSS。可用下方「迁移」把已有本地文件搬到 OSS。" />
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

      <template v-if="form.provider === 'oss'">
        <el-divider />
        <div class="migrate">
          <div class="migrate-title">迁移本地文件到 OSS</div>
          <div class="migrate-hint">
            把后端 <code>/uploads</code> 下已有文件批量上传到 OSS（不删除本地）。
            勾选「改写数据库」会把曲目/封面/头像/Logo 里引用的旧本地地址替换为 OSS 地址。
          </div>
          <el-checkbox v-model="rewriteDb" style="margin: 8px 0">迁移后改写数据库引用</el-checkbox>
          <div>
            <el-button type="warning" :loading="migrating" @click="onMigrate">开始迁移</el-button>
          </div>
          <el-alert
            v-if="migrateResult"
            :type="migrateResult.failed.length ? 'warning' : 'success'"
            :closable="false"
            show-icon
            style="margin-top: 12px"
            :title="`迁移完成：成功 ${migrateResult.migrated} 个，失败 ${migrateResult.failed.length} 个，改写数据库 ${migrateResult.db_rewritten} 条`"
          />
        </div>
      </template>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { getStorageSetting, updateStorageSetting, migrateStorage } from '@/api';

const loading = ref(false);
const saving = ref(false);
const migrating = ref(false);
const rewriteDb = ref(true);
const migrateResult = ref<{ migrated: number; failed: string[]; db_rewritten: number } | null>(null);
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

async function onMigrate() {
  await ElMessageBox.confirm(
    '将把本地 /uploads 下所有文件上传到 OSS（不删除本地文件）。请先确认已保存 OSS 配置。继续？',
    '迁移确认',
    { type: 'warning' }
  );
  migrating.value = true;
  migrateResult.value = null;
  try {
    migrateResult.value = await migrateStorage(rewriteDb.value);
    ElMessage.success('迁移完成');
  } finally {
    migrating.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.migrate-title { font-weight: 600; margin-bottom: 6px; }
.migrate-hint { color: #909399; font-size: 13px; line-height: 1.6; }
.migrate-hint code { background: #f5f7fa; padding: 0 4px; border-radius: 3px; }
</style>
