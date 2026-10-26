<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useActivePolling } from '@/composables/useActivePolling';
import { ElMessage, ElMessageBox } from 'element-plus';
import { commerce, stateLabel } from '@/api/commerce';
import { useAuthStore } from '@/stores/auth';
const auth = useAuthStore();
const tab = ref('media'), media = ref<any[]>([]), jobs = ref<any[]>([]), events = ref<any[]>([]);
const status = ref<any>({}), uploading = ref(false), percentage = ref(0), kind = ref('video');
const page = ref(1), total = ref(0), loading = ref(false), state = ref(''), keyword = ref(''), jobKind = ref('');
const eventAction = ref(''), eventSubject = ref(''), eventDetail = ref<any>({}), detailDialog = ref(false);
const retrying = ref<number>();
const duration = ref(0);
function fileDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const element = document.createElement(kind.value === 'video' ? 'video' : 'audio');
    const url = URL.createObjectURL(file);
    const finish = (value?: number) => {
      clearTimeout(timer); element.onloadedmetadata = null; element.onerror = null;
      element.removeAttribute('src'); element.load(); URL.revokeObjectURL(url);
      if (value && Number.isFinite(value) && value <= 86400) resolve(Math.ceil(value));
      else reject(new Error('无法读取时长，请填写课件时长（秒）后上传'));
    };
    const timer = setTimeout(() => finish(), 10000);
    element.preload = 'metadata';
    element.onloadedmetadata = () => finish(element.duration);
    element.onerror = () => finish();
    element.src = url;
  });
}
async function useOriginal(asset: any) {
  try {
    const { value } = await ElMessageBox.prompt('确认课件可直接播放，填写课件时长（秒）；已就绪课件只固定当前播放版本。', '使用 OSS 原文件', {
      inputValue: asset.duration ? String(asset.duration) : '', inputPattern: /^[1-9]\d{0,4}$/, inputErrorMessage: '请填写 1 至 86400 秒',
      inputValidator: value => Number(value) >= 1 && Number(value) <= 86400 || '请填写 1 至 86400 秒',
    });
    await commerce.post(`/media/${asset.id}/complete`, { duration: Number(value) });
    ElMessage.success('原文件已就绪'); await load();
  } catch (error: any) { if (!['cancel', 'close'].includes(error)) ElMessage.error(error.message || '确认失败'); }
}
const states = computed(() => tab.value === 'media' ? ['uploading', 'processing', 'ready', 'failed'] : ['pending', 'running', 'failed', 'done']);
const jobKinds: Record<string, string> = { media: '媒体处理', payment: '支付补查', close: '关单', refund: '退款', shipping: '发货同步', receipt: '收货核对', course_delivery: '课程交付' };
let loadId = 0;
async function load() {
  if (!polling.isActive()) return;
  const id = ++loadId, selectedTab = tab.value;
  const params = new URLSearchParams({ page: String(page.value), size: '20', q: keyword.value.trim() });
  if (selectedTab === 'events') { params.set('subject', eventSubject.value); params.set('action', eventAction.value); }
  else { params.set('state', state.value); if (selectedTab === 'jobs') params.set('kind', jobKind.value); }
  loading.value = true;
  try {
    const nextStatus = await commerce.get('/status');
    if (id !== loadId) return;
    status.value = nextStatus;
    if (!nextStatus.migrated) { media.value = []; jobs.value = []; events.value = []; total.value = 0; return; }
    const result = await commerce.get(`/${selectedTab}?${params}`);
    if (id !== loadId) return;
    if (selectedTab === 'media') media.value = result.items;
    else if (selectedTab === 'jobs') jobs.value = result.items;
    else events.value = result.items;
    total.value = result.total;
  } finally { if (id === loadId) loading.value = false; }
}
const refresh = () => load().catch(() => {});
function search() { page.value = 1; refresh(); }
function resetFilters() { state.value = ''; keyword.value = ''; jobKind.value = ''; eventSubject.value = ''; eventAction.value = ''; search(); }
function history(job: any) { eventSubject.value = `job:${job.id}`; tab.value = 'events'; }
async function upload(options: any) {
  if (options.file.size > 2 * 1024 ** 3) return ElMessage.warning('课件不能超过 2GB');
  uploading.value = true; percentage.value = 0;
  try {
    const seconds = duration.value || await fileDuration(options.file);
    const ticket = await commerce.post('/media/sign', { name: options.file.name, kind: kind.value });
    await new Promise<void>((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open('POST', ticket.host);
      request.upload.onprogress = e => { if (e.lengthComputable) percentage.value = Math.round(e.loaded / e.total * 100); };
      request.onload = () => request.status >= 200 && request.status < 300 ? resolve() : reject(new Error('课件上传失败，请检查 OSS CORS 配置'));
      request.onerror = () => reject(new Error('网络中断，课件未上传完成'));
      const body = new FormData(); for (const [key, value] of Object.entries(ticket.fields)) body.append(key, String(value));
      body.append('file', options.file); request.send(body);
    });
    await commerce.post(`/media/${ticket.id}/complete`, { duration: seconds });
    duration.value = 0;
    ElMessage.success('OSS 上传完成，原文件已可使用'); await load();
  } catch (error: any) { ElMessage.error(error.message || '上传失败'); }
  finally { uploading.value = false; }
}
async function retry(job: any) {
  retrying.value = job.id;
  try { await commerce.post(`/jobs/${job.id}/retry`); ElMessage.success('已重新排队，原失败原因保留在处理历史中'); page.value = 1; await load(); }
  finally { retrying.value = undefined; }
}
const canRetry = (job: any) => auth.can(job.kind === 'media' ? 'commerce:content' : ['shipping','receipt'].includes(job.kind) ? 'commerce:ship' : 'commerce:payments');
watch(tab, () => { page.value = 1; state.value = ''; keyword.value = ''; jobKind.value = ''; eventAction.value = ''; refresh(); });
const polling = useActivePolling(refresh, 15000, () => { loadId++; loading.value = false; });
</script>
<template>
  <BusinessPage title="课件与任务" description="课件原样上传私有 OSS，不转码、不生成副本；支付、退款和发货同步继续后台执行。">
    <el-alert v-if="status.migrated === false" type="warning" title="数据库尚未升级，请先由技术负责人执行课程商城版本迁移。" :closable="false" />
    <template v-if="status.runtime">
      <el-alert v-if="!status.runtime.queues.transactions" type="error" :closable="false" style="margin-bottom:16px"
        title="交易任务没有在线 Worker，请联系技术负责人；课件原文件上传不依赖媒体 Worker。" />
      <el-alert v-if="status.runtime.delayed || status.runtime.expired_leases || status.runtime.jobs.failed" type="warning" :closable="false" style="margin-bottom:16px"
        :title="`待处理异常：${status.runtime.delayed} 个任务超过计划时间 5 分钟，${status.runtime.expired_leases} 个执行租约已过期，${status.runtime.jobs.failed} 个任务失败。请在后台任务中核对。`" />
      <el-descriptions :column="3" border style="margin-bottom:16px">
        <el-descriptions-item label="交易 Worker">{{ status.runtime.queues.transactions ? '在线' : '离线' }}</el-descriptions-item>
        <el-descriptions-item label="旧媒体任务收尾">{{ status.runtime.queues.media ? '在线' : '未启动，不影响上传' }}</el-descriptions-item>
        <el-descriptions-item label="待处理 / 执行中">{{ status.runtime.jobs.pending }} / {{ status.runtime.jobs.running }}</el-descriptions-item>
      </el-descriptions>
    </template>
    <el-alert v-if="status.capabilities && !status.capabilities.private_media" title="私有课程媒体存储尚未配置；不会回退到公开图片或音乐桶。" type="warning" :closable="false" style="margin-bottom:16px" />
    <div v-if="auth.can('commerce:content')" class="toolbar"><el-select v-model="kind" style="width:140px"><el-option label="视频课件" value="video" /><el-option label="音频课件" value="audio" /></el-select>
      <el-input-number v-model="duration" :min="0" :max="86400" :precision="0" :disabled="uploading" /><span>时长（秒），0 自动读取</span>
      <el-upload :show-file-list="false" :http-request="upload" :accept="kind === 'video' ? '.mp4' : '.mp3,.wav,.m4a'"><el-button type="primary" :loading="uploading" :disabled="uploading || !status.capabilities?.private_media">上传课件</el-button></el-upload></div>
    <p class="hint">请上传可直接播放的 MP4 视频或 MP3/M4A/WAV 音频。旧的未完成课件可确认时长后使用原文件。</p>
    <el-progress v-if="uploading" :percentage="percentage" />
    <el-tabs v-model="tab"><el-tab-pane label="媒体资产" name="media" /><el-tab-pane label="后台任务" name="jobs" /><el-tab-pane label="持久操作历史" name="events" /></el-tabs>
    <div class="toolbar">
      <el-input v-model="keyword" clearable :placeholder="tab === 'media' ? '文件名' : tab === 'jobs' ? '任务编号或标识' : '业务记录或操作人'" style="width:240px" @keyup.enter="search" @clear="search" />
      <el-select v-if="tab !== 'events'" v-model="state" placeholder="全部状态" style="width:150px" @change="search"><el-option label="全部状态" value="" /><el-option v-for="value in states" :key="value" :label="stateLabel(value)" :value="value" /></el-select>
      <el-select v-if="tab === 'jobs'" v-model="jobKind" placeholder="全部任务类型" style="width:150px" @change="search"><el-option label="全部任务类型" value="" /><el-option v-for="(label, value) in jobKinds" :key="value" :label="label" :value="value" /></el-select>
      <el-select v-if="tab === 'events'" v-model="eventAction" placeholder="全部操作" style="width:150px" @change="search"><el-option label="全部操作" value="" /><el-option v-for="value in ['failed','done','waiting','lease_lost','manual_retry','created','paid','refunded','shipped']" :key="value" :label="stateLabel(value)" :value="value" /></el-select>
      <el-button type="primary" @click="search">查询</el-button><el-button @click="resetFilters">重置</el-button><el-button :loading="loading" @click="refresh">刷新</el-button>
    </div>
    <el-alert v-if="tab === 'events' && eventSubject" :title="`当前仅查看 ${eventSubject} 的处理历史`" type="info" :closable="false" style="margin-bottom:12px"><el-button link @click="eventSubject = ''; search()">查看全部记录</el-button></el-alert>
    <BusinessTable v-if="tab === 'media'" v-loading="loading" :data="media"><el-table-column prop="id" label="编号" width="80" /><el-table-column prop="name" label="文件" min-width="200" /><el-table-column label="状态" width="120"><template #default="{ row }">{{ stateLabel(row.state) }}</template></el-table-column><el-table-column prop="duration" label="时长（秒）" width="120" /><el-table-column prop="error" label="错误详情" min-width="240" /><el-table-column label="操作" width="150"><template #default="{ row }"><el-button v-if="(row.state !== 'ready' || !row.playback_version) && auth.can('commerce:content')" @click="useOriginal(row)">{{ row.state === 'ready' ? '确认课件版本' : '使用原文件' }}</el-button></template></el-table-column></BusinessTable>
    <BusinessTable v-if="tab === 'jobs'" v-loading="loading" :data="jobs"><el-table-column prop="id" label="编号" width="80" /><el-table-column label="任务类型" width="120"><template #default="{ row }">{{ jobKinds[row.kind] || row.kind }}</template></el-table-column><el-table-column prop="key" label="任务标识" min-width="160" /><el-table-column label="状态" width="120"><template #default="{ row }">{{ stateLabel(row.state) }}</template></el-table-column><el-table-column prop="attempts" label="异常尝试次数" width="120" /><el-table-column prop="run_at" label="计划执行（UTC）" width="180" /><el-table-column prop="error" label="等待或失败原因" min-width="240" /><el-table-column label="操作" width="200" fixed="right"><template #default="{ row }"><el-button @click="history(row)">处理历史</el-button><el-button v-if="row.state === 'failed' && canRetry(row)" :loading="retrying === row.id" :disabled="retrying != null && retrying !== row.id" @click="retry(row)">重试</el-button></template></el-table-column></BusinessTable>
    <BusinessTable v-if="tab === 'events'" v-loading="loading" :data="events"><el-table-column prop="created_at" label="时间（UTC）" width="180" /><el-table-column prop="subject" label="业务记录" min-width="200" /><el-table-column label="操作" min-width="140"><template #default="{ row }">{{ stateLabel(row.action) }}</template></el-table-column><el-table-column prop="operator" label="操作人" width="120" /><el-table-column label="详情" min-width="220"><template #default="{ row }">{{ row.detail.error || row.detail.reason || row.detail.remark || row.detail.previous_error || '' }} <el-button link @click="eventDetail = row; detailDialog = true">查看详情</el-button></template></el-table-column></BusinessTable>
    <BusinessPagination v-model:current-page="page" :total="total" :page-size="20" layout="total, prev, pager, next" @current-change="refresh" />
    <p class="hint">全部记录可分页查询；处理结果与操作历史保存在服务器，刷新不会清空。时间使用 UTC。</p>
    <BusinessModal v-model="detailDialog" title="操作详情"><el-descriptions :column="1" border><el-descriptions-item label="业务记录">{{ eventDetail.subject }}</el-descriptions-item><el-descriptions-item label="操作">{{ stateLabel(eventDetail.action) }}</el-descriptions-item></el-descriptions><pre class="event-detail">{{ JSON.stringify(eventDetail.detail, null, 2) }}</pre></BusinessModal>
  </BusinessPage>
</template>
<style scoped>
.event-detail { max-height:50vh; overflow:auto; white-space:pre-wrap; overflow-wrap:anywhere; }
</style>
