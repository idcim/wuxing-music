<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { commerce, stateLabel } from '@/api/commerce';
import { useAuthStore } from '@/stores/auth';
const auth = useAuthStore();
const tab = ref('media'), media = ref<any[]>([]), jobs = ref<any[]>([]), events = ref<any[]>([]);
const status = ref<any>({}), uploading = ref(false), percentage = ref(0), kind = ref('video');
let timer: ReturnType<typeof setInterval>;
async function load() {
  status.value = await commerce.get('/status');
  if (!status.value.migrated) return;
  [media.value, jobs.value, events.value] = await Promise.all([commerce.get('/media'), commerce.get('/jobs'), commerce.get('/events')]);
}
async function upload(options: any) {
  if (options.file.size > 2 * 1024 ** 3) return ElMessage.warning('课件不能超过 2GB');
  uploading.value = true; percentage.value = 0;
  try {
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
    await commerce.post(`/media/${ticket.id}/complete`);
    ElMessage.success('上传完成，已进入后台处理，可离开页面'); await load();
  } catch (error: any) { ElMessage.error(error.message || '上传失败'); }
  finally { uploading.value = false; }
}
async function retry(job: any) { await commerce.post(`/jobs/${job.id}/retry`); await load(); }
const canRetry = (job: any) => auth.can(job.kind === 'media' ? 'commerce:content' : ['shipping','receipt'].includes(job.kind) ? 'commerce:ship' : 'commerce:payments');
onMounted(async () => { await load(); timer = setInterval(() => load().catch(() => {}), 15000); });
onUnmounted(() => clearInterval(timer));
</script>
<template>
  <BusinessPage title="课件与任务" description="上传完成即可离开；媒体处理、支付核对、退款和发货同步由独立 Worker 持续执行。">
    <el-alert v-if="status.migrated === false" type="warning" title="数据库尚未升级，请先由技术负责人执行课程商城版本迁移。" :closable="false" />
    <el-alert v-if="status.capabilities && !status.capabilities.private_media" title="私有课程媒体存储尚未配置；不会回退到公开图片或音乐桶。" type="warning" :closable="false" style="margin-bottom:16px" />
    <div v-if="auth.can('commerce:content')" class="toolbar"><el-select v-model="kind" style="width:140px"><el-option label="视频课件" value="video" /><el-option label="音频课件" value="audio" /></el-select>
      <el-upload :show-file-list="false" :http-request="upload" :accept="kind === 'video' ? '.mp4,.mov,.mkv' : '.mp3,.wav,.m4a'"><el-button type="primary" :loading="uploading" :disabled="!status.capabilities?.private_media">上传课件</el-button></el-upload><el-button @click="load">刷新</el-button></div>
    <el-progress v-if="uploading" :percentage="percentage" />
    <el-tabs v-model="tab"><el-tab-pane label="媒体资产" name="media" /><el-tab-pane label="后台任务" name="jobs" /><el-tab-pane label="持久操作历史" name="events" /></el-tabs>
    <BusinessTable v-if="tab === 'media'" :data="media"><el-table-column prop="id" label="编号" width="80" /><el-table-column prop="name" label="文件" min-width="200" /><el-table-column label="状态" width="120"><template #default="{ row }">{{ stateLabel(row.state) }}</template></el-table-column><el-table-column prop="duration" label="时长（秒）" width="120" /><el-table-column prop="error" label="错误详情" min-width="240" /></BusinessTable>
    <BusinessTable v-if="tab === 'jobs'" :data="jobs"><el-table-column prop="id" label="编号" width="80" /><el-table-column prop="kind" label="任务类型" width="120" /><el-table-column label="状态" width="120"><template #default="{ row }">{{ stateLabel(row.state) }}</template></el-table-column><el-table-column prop="attempts" label="尝试次数" width="100" /><el-table-column prop="error" label="失败原因" min-width="240" /><el-table-column label="操作" width="110" fixed="right"><template #default="{ row }"><el-button v-if="row.state === 'failed' && canRetry(row)" @click="retry(row)">重试</el-button></template></el-table-column></BusinessTable>
    <BusinessTable v-if="tab === 'events'" :data="events"><el-table-column prop="created_at" label="时间" width="180" /><el-table-column prop="subject" label="业务记录" min-width="200" /><el-table-column prop="action" label="操作" min-width="180" /><el-table-column prop="operator" label="操作人" width="120" /><el-table-column label="详情" min-width="220"><template #default="{ row }">{{ row.detail.error || row.detail.remark || row.detail.amount_fen || '' }}</template></el-table-column></BusinessTable>
    <p class="hint">显示最近 100 条；所有处理结果与操作历史均保存在服务器，刷新不会清空。</p>
  </BusinessPage>
</template>
