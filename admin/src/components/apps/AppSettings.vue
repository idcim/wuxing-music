<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import req from '@/api/request';
import { useAuthStore } from '@/stores/auth';
interface AppConfig { enabled: boolean; app_name: string; android_package: string; title: string; description: string; install_guide: string; ios_store_url: string; download_domain: string; }
const auth = useAuthStore();
const form = ref<AppConfig>({ enabled: false, app_name: '', android_package: 'cn.azureglow.wuxing.preview', title: '', description: '', install_guide: '', ios_store_url: '', download_domain: 'https://cdn.azure-glow.cn' });
const loading = ref(true), failed = ref(false), saving = ref(false);
const channel = ref<'preview' | 'stable'>('preview');
const downloadUrl = computed(() => new URL(`/download${channel.value === 'stable' ? '?channel=stable' : ''}`, window.location.origin).href);
async function load() {
  loading.value = true; failed.value = false;
  try { form.value = await req.get<AppConfig>('/api/admin/apps/config'); }
  catch { failed.value = true; }
  finally { loading.value = false; }
}
async function save() {
  if (!auth.can('apps:edit') || failed.value) return;
  saving.value = true;
  try { form.value = await req.put<AppConfig>('/api/admin/apps/config', form.value); ElMessage.success('APP配置已保存'); }
  catch { /* 统一请求层显示失败原因。 */ }
  finally { saving.value = false; }
}
async function copy() {
  try { await navigator.clipboard.writeText(downloadUrl.value); ElMessage.success('下载页地址已复制'); }
  catch { ElMessage.info('请手动复制下载页地址'); }
}
onMounted(load);
</script>

<template>
  <div v-loading="loading" class="app-settings">
    <section class="download-entry">
      <div><h3>固定下载页</h3><p>无需登录即可访问。开放下载后展示对应渠道已发布的版本；安装包沿用站点 OSS 存储。</p><el-radio-group v-model="channel" size="small" class="download-channel"><el-radio-button value="preview">体验版下载页</el-radio-button><el-radio-button value="stable">正式版下载页</el-radio-button></el-radio-group><a :href="downloadUrl" target="_blank" rel="noopener noreferrer">{{ downloadUrl }}</a></div>
      <div class="download-entry__actions"><el-button @click="copy">复制地址</el-button><el-button tag="a" :href="downloadUrl" target="_blank" rel="noopener noreferrer">访问下载页</el-button></div>
    </section>
    <el-result v-if="failed" icon="warning" title="配置加载失败" sub-title="请重试后再编辑，避免覆盖现有配置。"><template #extra><el-button @click="load">重新加载</el-button></template></el-result>
    <BusinessForm v-else :model="form" :disabled="loading || saving || !auth.can('apps:edit')">
      <div class="app-settings__grid">
        <el-form-item label="公开下载"><el-switch v-model="form.enabled" active-text="开放下载" /><p class="field-hint">关闭后停止公开下载，已安装的 APP 仍可使用。</p></el-form-item>
        <el-form-item label="APP名称"><el-input v-model="form.app_name" maxlength="60" placeholder="留空沿用站点名称" /></el-form-item>
        <el-form-item label="安卓应用包名"><el-input v-model="form.android_package" maxlength="180" /><p class="field-hint">用于核对上传的 APK；已安装用户升级需要保持包名与签名一致。</p></el-form-item>
        <el-form-item label="iOS App Store 地址（选填）"><el-input v-model="form.ios_store_url" placeholder="https://apps.apple.com/…" /></el-form-item>
        <el-form-item label="APP 文件下载域名"><el-input v-model="form.download_domain" maxlength="300" placeholder="https://cdn.azure-glow.cn" /><p class="field-hint">仅用于 APK 下载，可直接填写域名。需已配置 HTTPS 和当前 OSS 的 CDN 回源；上传仍走 OSS，音乐与课件域名不受影响。</p></el-form-item>
      </div>
      <el-form-item label="下载页标题"><el-input v-model="form.title" maxlength="100" placeholder="留空使用APP名称" /></el-form-item>
      <el-form-item label="APP介绍"><el-input v-model="form.description" type="textarea" :rows="4" maxlength="2000" show-word-limit /></el-form-item>
      <el-form-item label="安装说明"><el-input v-model="form.install_guide" type="textarea" :rows="5" maxlength="4000" show-word-limit placeholder="例如：下载完成后打开安装包，按系统提示允许安装；微信内请先在浏览器打开。" /></el-form-item>
      <div v-if="auth.can('apps:edit')" class="app-settings__actions"><el-button type="primary" :loading="saving" @click="save">保存配置</el-button></div>
    </BusinessForm>
  </div>
</template>

<style scoped>
.app-settings { max-width: 1100px; }
.download-entry { display: flex; justify-content: space-between; gap: 24px; padding: 20px; margin-bottom: 28px; background: var(--el-fill-color-light); border-radius: 8px; }
.download-entry h3 { margin: 0 0 8px; font-size: 16px; }
.download-entry p, .field-hint { color: var(--el-text-color-secondary); line-height: 1.7; }
.download-entry p { margin: 0 0 10px; }
.download-entry a { color: var(--el-color-primary); overflow-wrap: anywhere; }
.download-channel { display: flex; margin-bottom: 10px; }
.download-entry__actions { display: flex; gap: 8px; align-items: center; flex-shrink: 0; }
.download-entry__actions .el-button + .el-button { margin-left: 0; }
.app-settings__grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 28px; }
.field-hint { margin: 8px 0 0; font-size: 12px; width: 100%; }
.app-settings__actions { padding-top: 18px; border-top: 1px solid var(--el-border-color-lighter); }
@media (max-width: 900px) { .download-entry { flex-direction: column; } .download-entry__actions { flex-wrap: wrap; } .app-settings__grid { grid-template-columns: 1fr; } }
</style>
