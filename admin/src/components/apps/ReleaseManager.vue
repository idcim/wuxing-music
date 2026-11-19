<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import req from '@/api/request';
import { useAuthStore } from '@/stores/auth';
import { uploadApk, type SignedUpload } from './upload';
interface PackageInfo { asset_id: string; version_name: string; version_code: number; package_name: string; size: number; sha256: string; }
interface Release extends Omit<PackageInfo, 'asset_id'> { id: string; status: 'draft' | 'published' | 'withdrawn'; channel: 'preview' | 'stable'; notes: string; force_update: boolean; min_supported_code: number; created_at: string; published_at?: string; }
const auth = useAuthStore();
const releases = ref<Release[]>([]), loading = ref(false), failed = ref(false);
const open = ref(false), editing = ref<string | null>(null), saving = ref(false), uploading = ref(false), progress = ref(0), verifying = ref(false);
const selected = ref<PackageInfo | null>(null), filename = ref(''), fileInput = ref<HTMLInputElement>();
const form = reactive({ channel: 'preview' as 'preview' | 'stable', notes: '', force_update: false, min_supported_code: 0 });
let controller: AbortController | undefined;
const statusLabel = { draft: '草稿', published: '已发布', withdrawn: '已撤回' };
const statusType = { draft: 'info', published: 'success', withdrawn: 'warning' } as const;
const sizeLabel = (value: number) => `${(value / 1024 / 1024).toFixed(1)} MB`;
const dateLabel = (value?: string) => value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '—';
async function load() {
  loading.value = true; failed.value = false;
  try { releases.value = await req.get<Release[]>('/api/admin/apps/releases'); }
  catch { failed.value = true; }
  finally { loading.value = false; }
}
function create() {
  controller?.abort(); controller = undefined; uploading.value = false; verifying.value = false;
  editing.value = null; selected.value = null; filename.value = ''; progress.value = 0;
  Object.assign(form, { channel: 'preview', notes: '', force_update: false, min_supported_code: 0 });
  open.value = true;
}
function edit(item: Release) {
  editing.value = item.id; selected.value = { ...item, asset_id: '' }; filename.value = '';
  Object.assign(form, { channel: item.channel, notes: item.notes, force_update: item.force_update, min_supported_code: item.min_supported_code });
  open.value = true;
}
async function chooseFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0]; input.value = '';
  if (!file || !auth.can('apps:edit')) return;
  if (!file.name.toLowerCase().endsWith('.apk') || !file.size) { ElMessage.warning('请选择有效的 APK 安装包'); return; }
  selected.value = null; filename.value = file.name; uploading.value = true; progress.value = 0;
  const activeController = new AbortController();
  controller = activeController;
  try {
    const signed = await req.post<SignedUpload & { asset_id: string }>('/api/admin/apps/packages/sign', { filename: file.name }, { signal: activeController.signal });
    await uploadApk(file, signed, value => { if (controller === activeController) progress.value = value; }, activeController.signal);
    verifying.value = true;
    const metadata = await req.post<PackageInfo>(`/api/admin/apps/packages/${signed.asset_id}/complete`, {}, { timeout: 300000, signal: activeController.signal });
    if (activeController.signal.aborted || controller !== activeController) return;
    selected.value = metadata;
    ElMessage.success('安装包上传并核验完成，可保存为草稿');
  } catch (error) {
    if (!activeController.signal.aborted && error instanceof Error && !('isAxiosError' in error)) ElMessage.error(error.message);
  } finally { if (controller === activeController) { uploading.value = false; verifying.value = false; controller = undefined; } }
}
async function save() {
  if (!selected.value || uploading.value || !auth.can('apps:edit')) return;
  if (!form.notes.trim()) { ElMessage.warning('请填写更新说明'); return; }
  if (form.min_supported_code > selected.value.version_code) { ElMessage.warning('最低支持版本号不能高于当前安装包版本号'); return; }
  saving.value = true;
  try {
    if (editing.value) await req.put(`/api/admin/apps/releases/${editing.value}`, { ...form });
    else await req.post('/api/admin/apps/releases', { ...form, asset_id: selected.value.asset_id });
    open.value = false; ElMessage.success('版本草稿已保存，发布后才会开放下载'); await load();
  } catch { /* 统一请求层提示。 */ }
  finally { saving.value = false; }
}
async function changeStatus(item: Release, action: 'publish' | 'withdraw') {
  if (!auth.can('apps:publish')) return;
  try {
    await ElMessageBox.confirm(action === 'publish'
      ? `发布 ${item.version_name}（${item.version_code}）到${item.channel === 'stable' ? '正式' : '体验'}渠道？开放下载后，用户可获取该版本。请确认安装包签名与功能已验证。`
      : `撤回 ${item.version_name}？该版本将停止公开下载；已安装的用户仍可使用。`, action === 'publish' ? '发布版本' : '撤回版本', { type: 'warning', confirmButtonText: action === 'publish' ? '确认发布' : '确认撤回', cancelButtonText: '取消' });
  } catch { return; }
  try { await req.post(`/api/admin/apps/releases/${item.id}/${action}`, {}); ElMessage.success(action === 'publish' ? '版本已发布' : '版本已撤回'); await load(); }
  catch { /* 统一请求层提示。 */ }
}
function beforeClose(done: () => void) {
  if (saving.value || verifying.value) { ElMessage.info('正在保存或核验，请稍候'); return; }
  controller?.abort(); done();
}
watch(open, value => { if (!value) { controller?.abort(); controller = undefined; uploading.value = false; verifying.value = false; } });
onMounted(load);
onUnmounted(() => controller?.abort());
</script>

<template>
  <div class="releases">
    <div class="release-toolbar"><p>上传安装包 → 保存草稿 → 确认发布。版本号、包名和文件校验信息由安装包自动识别。</p><div><el-button :loading="loading" @click="load">刷新</el-button><el-button v-if="auth.can('apps:edit')" type="primary" @click="create">上传新版本</el-button></div></div>
    <el-alert v-if="failed" title="版本列表加载失败，请刷新重试。" type="warning" :closable="false" />
    <el-table v-loading="loading" :data="releases" row-key="id" empty-text="暂无版本，上传 APK 后保存第一份草稿">
      <el-table-column type="expand"><template #default="{ row }"><div class="release-detail"><div><strong>更新说明</strong><p>{{ row.notes }}</p></div><dl><dt>应用包名</dt><dd>{{ row.package_name }}</dd><dt>SHA-256</dt><dd>{{ row.sha256 }}</dd><dt>更新要求</dt><dd>{{ row.force_update ? '要求更新' : '允许稍后更新' }} · 最低支持版本号 {{ row.min_supported_code || '未限制' }}</dd><dt>创建时间</dt><dd>{{ dateLabel(row.created_at) }}</dd></dl></div></template></el-table-column>
      <el-table-column label="版本" min-width="170"><template #default="{ row }"><strong>{{ row.version_name }}</strong><div class="release-sub">版本号 {{ row.version_code }}</div></template></el-table-column>
      <el-table-column label="渠道" width="100"><template #default="{ row }">{{ row.channel === 'stable' ? '正式版' : '体验版' }}</template></el-table-column>
      <el-table-column label="大小" width="110"><template #default="{ row }">{{ sizeLabel(row.size) }}</template></el-table-column>
      <el-table-column label="状态" width="105"><template #default="{ row }"><el-tag :type="statusType[row.status as Release['status']]">{{ statusLabel[row.status as Release['status']] }}</el-tag></template></el-table-column>
      <el-table-column label="发布时间" min-width="180"><template #default="{ row }">{{ dateLabel(row.published_at) }}</template></el-table-column>
      <el-table-column label="操作" width="160" fixed="right"><template #default="{ row }"><el-button v-if="row.status === 'draft' && auth.can('apps:edit')" link type="primary" @click="edit(row)">编辑</el-button><el-button v-if="row.status === 'draft' && auth.can('apps:publish')" link type="primary" @click="changeStatus(row, 'publish')">发布</el-button><el-button v-if="row.status === 'published' && auth.can('apps:publish')" link type="danger" @click="changeStatus(row, 'withdraw')">撤回</el-button></template></el-table-column>
    </el-table>
    <BusinessModal v-model="open" :title="editing ? '编辑版本草稿' : '上传新版本'" width="640px" :close-on-click-modal="false">
      <BusinessForm :model="form" :disabled="saving || uploading || !auth.can('apps:edit')">
        <el-form-item v-if="!editing" label="安卓安装包"><input ref="fileInput" type="file" accept=".apk,application/vnd.android.package-archive" class="file-input" @change="chooseFile" /><el-button :loading="uploading" @click="fileInput?.click()">{{ filename ? '重新选择 APK' : '选择 APK' }}</el-button><span class="file-name">{{ filename || '使用站点已配置的 OSS，文件直接上传至云存储' }}</span><div v-if="uploading" class="upload-progress"><el-progress :percentage="progress" /><p>{{ verifying ? '文件已上传，正在核验安装包…' : '正在上传至 OSS，请保持页面打开…' }}</p></div></el-form-item>
        <div v-if="selected" class="package-summary"><strong>{{ selected.version_name }}</strong><span>版本号 {{ selected.version_code }} · {{ sizeLabel(selected.size) }}</span><small>{{ selected.package_name }}</small></div>
        <el-form-item label="发布渠道"><el-radio-group v-model="form.channel"><el-radio-button value="preview">体验版</el-radio-button><el-radio-button value="stable">正式版</el-radio-button></el-radio-group></el-form-item>
        <el-form-item label="更新说明"><el-input v-model="form.notes" type="textarea" :rows="5" maxlength="10000" show-word-limit placeholder="说明本次新增功能、优化和修复内容" /></el-form-item>
        <el-collapse class="release-options"><el-collapse-item title="更新策略（可选）" name="update"><el-form-item label="要求更新"><el-switch v-model="form.force_update" /><p class="release-sub">要求该渠道的旧版本用户更新后再继续使用，请谨慎开启。</p></el-form-item><el-form-item label="最低支持版本号"><el-input-number v-model="form.min_supported_code" :min="0" :max="selected?.version_code || 2147483647" :precision="0" /><p class="release-sub">0 表示不限制；低于该版本号时要求更新。</p></el-form-item></el-collapse-item></el-collapse>
      </BusinessForm>
      <template #footer><el-button :disabled="saving || verifying" @click="beforeClose(() => { open = false; })">{{ uploading && !verifying ? '取消上传' : '取消' }}</el-button><el-button type="primary" :loading="saving" :disabled="!selected || uploading || !auth.can('apps:edit')" @click="save">保存草稿</el-button></template>
    </BusinessModal>
  </div>
</template>

<style scoped>
.release-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-bottom: 20px; }
.release-toolbar p, .release-sub { color: var(--el-text-color-secondary); line-height: 1.7; }
.release-toolbar p { margin: 0; }
.release-toolbar > div { white-space: nowrap; }
.release-sub { font-size: 12px; margin: 4px 0 0; }
.release-detail { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; padding: 18px 30px; }
.release-detail p { white-space: pre-wrap; line-height: 1.7; overflow-wrap: anywhere; }
.release-detail dl { margin: 0; min-width: 0; }
.release-detail dt { color: var(--el-text-color-secondary); margin-bottom: 4px; }
.release-detail dd { margin: 0 0 12px; overflow-wrap: anywhere; }
.file-input { display: none; }
.file-name { margin-left: 12px; color: var(--el-text-color-secondary); overflow-wrap: anywhere; }
.upload-progress { width: 100%; margin-top: 15px; }
.upload-progress p { color: var(--el-text-color-secondary); margin: 4px 0 0; }
.package-summary { padding: 16px; margin-bottom: 22px; border-radius: 8px; background: var(--el-fill-color-light); display: flex; gap: 7px; flex-direction: column; }
.package-summary small { color: var(--el-text-color-secondary); overflow-wrap: anywhere; }
.release-options { margin-bottom: 10px; }
@media (max-width: 900px) { .release-toolbar { align-items: flex-start; flex-direction: column; } .release-detail { grid-template-columns: 1fr; padding: 16px; } }
</style>
