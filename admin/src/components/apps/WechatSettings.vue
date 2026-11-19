<template>
  <div v-loading="loading" class="settings-panel">
    <el-alert v-if="failed" title="配置加载失败，已禁止保存以避免覆盖。" type="error" :closable="false"><el-button @click="load">重新加载</el-button></el-alert>
    <el-alert title="请填写开放平台「移动应用」凭据，与小程序、公众号和网站扫码应用分别配置。" type="info" :closable="false" show-icon />
    <BusinessForm :model="form" label-width="150px" style="margin-top: 20px">
      <el-form-item label="开放 APP 微信登录"><el-switch v-model="form.enabled" :disabled="!canEdit || !loaded || loading" /></el-form-item>
      <el-form-item label="移动应用 AppID"><el-input v-model="form.app_id" :disabled="!canEdit || !loaded || loading" placeholder="wx…" /></el-form-item>
      <el-form-item label="AppSecret"><el-input v-model="form.app_secret" :disabled="!canEdit || !loaded || loading" type="password" show-password autocomplete="new-password" :placeholder="secretSet ? '已配置，留空保留原值' : '仅保存在服务器，不会打包到 APP'" /></el-form-item>
      <el-form-item label="安卓应用包名"><el-input v-model="form.android_package" :disabled="!canEdit || !loaded || loading" /><div class="hint">须与上传 APK 的包名、微信开放平台登记包名完全一致。</div></el-form-item>
      <el-form-item label="安卓签名 MD5"><el-input v-model="form.android_signature" :disabled="!canEdit || !loaded || loading" placeholder="32 位 APK 证书 MD5，可带冒号" /><div class="hint">填写实际安装包签名证书的 MD5。体验包与正式包可能使用不同证书，换签名后须同步微信开放平台。</div></el-form-item>
      <el-form-item label="iOS Bundle ID"><el-input v-model="form.ios_bundle_id" :disabled="!canEdit || !loaded || loading" placeholder="预留，当前仅提供 Android APP" /></el-form-item>
      <el-form-item label="APP 隐私政策"><el-input v-model="form.privacy_policy" type="textarea" :maxlength="12000" show-word-limit :rows="10" :disabled="!canEdit || !loaded || loading" placeholder="填写运营主体、联系方式、资料收集与用途、微信 SDK 信息处理、保存与删除、用户权利等真实政策。用户可在登录前阅读；未填写不可开启微信登录。" /></el-form-item>
      <el-form-item v-if="canEdit"><el-button type="primary" :loading="saving" :disabled="!loaded || loading" @click="save">保存微信登录配置</el-button></el-form-item>
    </BusinessForm>
  </div>
</template>
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import req from '@/api/request';
import { useAuthStore } from '@/stores/auth';
const auth = useAuthStore();
const canEdit = computed(() => auth.can('apps:edit'));
const loading = ref(false), saving = ref(false), secretSet = ref(false), loaded = ref(false), failed = ref(false);
const form = reactive({ enabled: false, app_id: '', app_secret: '', android_package: 'cn.azureglow.wuxing.preview', android_signature: '', ios_bundle_id: '', privacy_policy: '' });
async function load() {
  loading.value = true;
  loaded.value = false; failed.value = false;
  try {
    const data = await req.get('/api/admin/apps/wechat');
    for (const key of Object.keys(form) as (keyof typeof form)[]) if (key !== 'app_secret' && data[key] !== undefined) (form as any)[key] = data[key];
    form.app_secret = '';
    secretSet.value = !!data.app_secret_set;
    loaded.value = true;
  } catch { failed.value = true; } finally { loading.value = false; }
}
async function save() {
  if (!loaded.value || loading.value || saving.value || !canEdit.value) return;
  saving.value = true;
  try { await req.put('/api/admin/apps/wechat', { ...form }); ElMessage.success('微信登录配置已保存'); await load(); }
  catch { /* 请求层已提示；保留输入供重试。 */ }
  finally { saving.value = false; }
}
onMounted(load);
</script>
<style scoped>.hint { margin-top: 5px; color: var(--el-text-color-secondary); font-size: 12px; line-height: 1.6; }</style>
