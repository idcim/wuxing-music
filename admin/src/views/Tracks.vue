<template>
  <BusinessPage>
    <div>
      <div class="toolbar">
        <el-select v-model="filterElement" placeholder="按五行筛选" clearable style="width: 160px" @change="reload">
          <el-option v-for="e in elements" :key="e.id" :label="`${e.id} · ${e.note}音`" :value="e.id" />
        </el-select>
        <el-button type="primary" :icon="Plus" @click="openEdit()">新增曲目</el-button>
        <el-button plain :loading="normRunning" @click="onNormalize">
          {{ normRunning ? normText || '修复中…' : '全部处理' }}
        </el-button>
        <span class="hint">默认直接播放母版；按存储设置补 AAC，会员曲目补试听，单行「处理」可单独执行</span>
      </div>

      <BusinessTable :data="rows" v-loading="loading" border @sort-change="onSort">
        <el-table-column prop="id" label="ID" width="70" sortable="custom" />
        <el-table-column prop="element_id" label="五行" width="70" />
        <el-table-column prop="title" label="曲名" min-width="120" sortable="custom" />
        <el-table-column prop="hz" label="频率" width="90" />
        <el-table-column prop="tag" label="标签" width="110" />
        <el-table-column prop="duration_sec" label="时长" width="90" sortable="custom">
          <template #default="{ row }">{{ row.duration }}</template>
        </el-table-column>
        <el-table-column label="会员专属" width="90" prop="is_premium" sortable="custom">
          <template #default="{ row }">
            <el-tag :type="row.is_premium ? 'warning' : 'success'" size="small">
              {{ row.is_premium ? '会员' : '免费' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="播放版本" width="230">
          <template #default="{ row }">
            <template v-if="normCurrentId === row.id">
              <el-tag size="small" type="warning"><el-icon class="is-loading"><Loading /></el-icon> 处理中</el-tag>
            </template>
            <el-tag v-else-if="normQueuedIds.includes(row.id)" size="small" type="info">排队中</el-tag>
            <template v-else>
              <el-tag v-if="row.play_url" size="small" type="info">旧版副本</el-tag>
              <el-tag v-if="row.aac_url" size="small" type="warning" style="margin-left: 4px">AAC</el-tag>
              <span v-if="!row.play_url && !row.aac_url" class="hint">仅母版</span>
              <el-tooltip v-if="row.process_error" :content="row.process_error" placement="top">
                <el-tag size="small" type="danger" style="margin-left: 4px">失败</el-tag>
              </el-tooltip>
            </template>
            <el-button
              size="small" text type="primary" style="margin-left: 6px"
              :disabled="normQueuedIds.includes(row.id) || normCurrentId === row.id"
              @click="onProcessOne(row)"
            >处理</el-button>
            <el-button size="small" text @click="openVersions(row)">版本</el-button>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90" prop="is_online" sortable="custom">
          <template #default="{ row }">
            <el-tag v-if="!row.is_online" type="info" size="small">下架</el-tag>
            <el-tag v-else-if="row.process_state === 'error'" type="danger" size="small">处理失败</el-tag>
            <el-tag v-else-if="row.process_state === 'processing'" type="warning" size="small">处理中</el-tag>
            <el-tag v-else-if="row.process_state === 'pending'" size="small" effect="plain">待处理</el-tag>
            <el-tag v-else type="success" size="small">已上架</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="openEdit(row)">编辑</el-button>
            <el-button size="small" type="danger" @click="onDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </BusinessTable>

      <BusinessPagination
        class="pager"
        layout="total, prev, pager, next"
        :total="total"
        :page-size="size"
        :current-page="page"
        @current-change="onPage"
      />

      <BusinessModal v-model="dialog" :title="form.id ? '编辑曲目' : '新增曲目'" width="560px">
        <BusinessForm :model="form" label-width="90px">
          <el-form-item label="五行">
            <el-select v-model="form.element_id" placeholder="选择五行">
              <el-option v-for="e in elements" :key="e.id" :label="`${e.id} · ${e.note}音`" :value="e.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="曲名"><el-input v-model="form.title" /></el-form-item>
          <el-form-item label="时长">
            <el-input v-model="form.duration" placeholder="MM:SS" style="width: 140px" @change="syncSec" />
            <span class="hint">（{{ form.duration_sec }} 秒）</span>
          </el-form-item>
          <el-form-item label="频率"><el-input v-model="form.hz" placeholder="324Hz / 角调" /></el-form-item>
          <el-form-item label="标签"><el-input v-model="form.tag" /></el-form-item>
          <el-form-item label="播放量"><el-input v-model="form.plays" placeholder="12.4k" /></el-form-item>
          <el-form-item label="音频">
            <div class="up-row">
              <el-upload
                :show-file-list="false"
                accept="audio/*,.mp3,.m4a,.wav"
                :http-request="uploadAudio"
              >
                <el-button :icon="Upload" :loading="audioUploading" :disabled="audioUploading">
                  {{ audioUploading ? `上传中 ${audioPct}%` : '上传音频' }}
                </el-button>
              </el-upload>
              <el-input v-model="form.audio_url" placeholder="或填 CDN 地址" />
            </div>
            <div class="hint">
              OSS 配置下音频直接上传 OSS，默认播放原始母版；保存后仅按存储设置补 AAC，
              会员曲目补试听剪辑。后台处理无需等待，保存后可离开页面。
            </div>
            <el-progress
              v-if="audioUploading"
              :percentage="audioPct"
              :stroke-width="6"
              style="margin-top: 8px"
            />
            <audio v-if="form.audio_url && !audioUploading" :src="form.audio_url" controls class="up-audio" />
          </el-form-item>
          <el-form-item label="封面">
            <div class="up-row">
              <el-upload
                :action="UPLOAD_URL"
                :headers="uploadHeaders"
                :show-file-list="false"
                accept="image/*"
                :before-upload="() => { coverUploading = true; coverPct = 0; }"
                :on-progress="(e: any) => { coverPct = Math.round(e.percent || 0); }"
                :on-success="onCoverSuccess"
                :on-error="onUploadError"
              >
                <div v-if="coverUploading" class="up-cover up-cover--loading">
                  <el-icon class="is-loading"><Loading /></el-icon>
                  <span class="up-cover-pct">{{ coverPct }}%</span>
                </div>
                <img v-else-if="form.cover_url" :src="form.cover_url" class="up-cover" />
                <el-button v-else :icon="Upload">上传封面</el-button>
              </el-upload>
              <el-input v-model="form.cover_url" placeholder="或填 CDN 地址" />
            </div>
          </el-form-item>
          <el-form-item label="会员专属"><el-switch v-model="form.is_premium" /></el-form-item>
          <el-form-item label="试听(秒)"><el-input-number v-model="form.preview_sec" :min="0" /></el-form-item>
          <el-form-item label="上架"><el-switch v-model="form.is_online" /></el-form-item>
          <el-form-item label="排序"><el-input-number v-model="form.sort" :min="0" /></el-form-item>
        </BusinessForm>
        <template #footer>
          <el-button @click="dialog = false">取消</el-button>
          <el-button type="primary" :loading="saving" :disabled="audioUploading || coverUploading" @click="onSave">保存</el-button>
        </template>
      </BusinessModal>

      <!-- 版本详情：母版与各播放副本的地址 + 试听 -->
      <BusinessModal v-model="versionsDialog" :title="`音频版本 · ${versionsRow?.title || ''}`" width="640px">
        <div v-for="v in versionList" :key="v.label" class="ver">
          <div class="ver__head">
            <el-tag size="small" :type="v.tagType">{{ v.label }}</el-tag>
            <span class="ver__url">{{ v.url }}</span>
            <el-button size="small" text type="primary" @click="copyUrl(v.url)">复制</el-button>
          </div>
          <audio :src="v.url" controls preload="none" class="ver__audio" />
        </div>
        <el-empty v-if="!versionList.length" description="该曲目还没有音频地址" />
      </BusinessModal>
    </div>

  </BusinessPage>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { Plus, Upload, Loading } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { listTracks, createTrack, updateTrack, deleteTrack, listElements, UPLOAD_URL, ossSign, normalizeAudio, normalizeAudioStatus, normalizeTrack } from '@/api';

const uploadHeaders = computed(() => ({
  Authorization: `Bearer ${localStorage.getItem('admin_token')}`
}));

// 上传进度/状态
const audioUploading = ref(false);
const audioPct = ref(0);
const saving = ref(false);
const coverUploading = ref(false);
const coverPct = ref(0);

const rows = ref<any[]>([]);
const elements = ref<any[]>([]);
const total = ref(0);
const page = ref(1);
const size = ref(20);
const loading = ref(false);
const filterElement = ref('');
const sortBy = ref('');
const sortOrder = ref('');
const dialog = ref(false);
const form = ref<any>({});

/** 音频优先 OSS 直传；本地存储回退服务器分块上传。 */
async function uploadAudio(opt: any) {
  const file: File = opt.file;
  audioUploading.value = true;
  audioPct.value = 0;
  try {
    const sign = await ossSign(file.name);
    let finalUrl = '';
    let probeUrl = '';
    if (sign?.provider === 'oss') {
      const fd = new FormData();
      fd.append('key', sign.key);
      fd.append('policy', sign.policy);
      fd.append('OSSAccessKeyId', sign.OSSAccessKeyId);
      fd.append('signature', sign.signature);
      fd.append('Content-Type', sign.contentType);
      fd.append('success_action_status', '200');
      fd.append('file', file);
      await xhrUpload(sign.host, fd, (p) => { audioPct.value = p; });
      finalUrl = sign.url;
      probeUrl = sign.url;
    } else {
      const fd = new FormData();
      fd.append('file', file);
      const res = await xhrUpload(UPLOAD_URL, fd, (p) => { audioPct.value = p; }, {
        Authorization: `Bearer ${localStorage.getItem('admin_token')}`
      });
      const body = JSON.parse(res);
      if (body?.code !== 0) throw new Error(body?.msg || '上传失败');
      finalUrl = body.data.url;
      probeUrl = body.data.full_url || body.data.url;
    }
    form.value.audio_url = finalUrl;
    ElMessage.success('音频已上传，保存后按设置处理');
    readAudioDuration(probeUrl);
    opt.onSuccess?.({});
  } catch (e: any) {
    ElMessage.error(e?.message || '上传失败');
    opt.onError?.(e);
  } finally {
    audioUploading.value = false;
  }
}

// 用 XHR 而不是 fetch：需要 upload.onprogress 来显示百分比，
// 大文件上传没有进度反馈体验很差（用户不知道是在传还是卡死了）。
function xhrUpload(
  url: string,
  fd: FormData,
  onProgress: (pct: number) => void,
  headers?: Record<string, string>
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    if (headers) {
      Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    }
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.responseText);
      else reject(new Error(`上传失败 HTTP ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error('网络错误，上传失败'));
    xhr.send(fd);
  });
}

// 读取音频时长，自动填 duration_sec 与 duration(MM:SS)
function readAudioDuration(url: string) {
  const a = new Audio();
  a.preload = 'metadata';
  a.src = url;
  a.addEventListener('loadedmetadata', () => {
    const sec = Math.round(a.duration || 0);
    if (sec > 0) {
      form.value.duration_sec = sec;
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      form.value.duration = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      ElMessage.success(`已识别时长 ${form.value.duration}`);
    }
  });
  a.addEventListener('error', () => { /* 读不到则保持手填 */ });
}
function onCoverSuccess(res: any) {
  coverUploading.value = false;
  if (res?.code === 0) {
    form.value.cover_url = res.data.url;
    ElMessage.success('封面已上传');
  } else {
    ElMessage.error(res?.msg || '上传失败');
  }
}
function onUploadError() {
  audioUploading.value = false;
  coverUploading.value = false;
  ElMessage.error('上传失败');
}

async function load() {
  loading.value = true;
  try {
    const data = await listTracks({
      page: page.value, size: size.value,
      element_id: filterElement.value || undefined,
      sort_by: sortBy.value || undefined,
      sort_order: sortOrder.value || undefined
    });
    rows.value = data.items;
    total.value = data.total;
  } finally {
    loading.value = false;
  }
}

// 表头排序（Element Plus custom：真正排序在后端做，这里只换参数）
function onSort({ prop, order }: { prop: string; order: string | null }) {
  sortBy.value = order ? prop : '';
  sortOrder.value = order === 'descending' ? 'desc' : 'asc';
  page.value = 1;
  load();
}

function reload() {
  page.value = 1;
  load();
}

function onPage(p: number) {
  page.value = p;
  load();
}

function syncSec() {
  const [m, s] = String(form.value.duration || '').split(':').map(Number);
  form.value.duration_sec = (m || 0) * 60 + (s || 0);
}

function openEdit(row?: any) {
  form.value = row
    ? { ...row }
    : { element_id: '', title: '', duration: '00:00', duration_sec: 0, hz: '', tag: '', plays: '0', audio_url: '', cover_url: '', is_premium: true, preview_sec: 30, is_online: true, sort: 0 };
  dialog.value = true;
}

async function onSave() {
  if (saving.value || audioUploading.value || coverUploading.value) return;
  if (!form.value.element_id || !form.value.title) {
    ElMessage.warning('五行和曲名必填');
    return;
  }
  saving.value = true;
  try {
    syncSec();
    if (form.value.id) {
      await updateTrack(form.value.id, form.value);
    } else {
      await createTrack(form.value);
    }
    ElMessage.success(form.value.audio_url ? '已保存，后续音频处理在后台继续，可离开页面' : '已保存');
    dialog.value = false;
    load();
    ensurePolling();
  } finally {
    saving.value = false;
  }
}

async function onDelete(row: any) {
  await ElMessageBox.confirm(`确定删除曲目「${row.title}」？`, '提示', { type: 'warning' });
  await deleteTrack(row.id);
  ElMessage.success('已删除');
  load();
}

// ── 版本详情（地址 + 试听）──
const versionsDialog = ref(false);
const versionsRow = ref<any>(null);

const versionList = computed(() => {
  const r = versionsRow.value;
  if (!r) return [];
  const list: { label: string; url: string; tagType: string }[] = [];
  if (r.audio_url) list.push({ label: '母版（原始上传）', url: r.audio_url, tagType: 'info' });
  if (r.play_url) list.push({ label: '旧版 16-bit 副本（不再生成）', url: r.play_url, tagType: 'info' });
  if (r.aac_url) list.push({ label: 'AAC 副本（省流量）', url: r.aac_url, tagType: 'warning' });
  if (r.preview_url) list.push({ label: `试听剪辑（${r.preview_sec || 30} 秒）`, url: r.preview_url, tagType: 'danger' });
  return list;
});

function openVersions(row: any) {
  versionsRow.value = row;
  versionsDialog.value = true;
}

async function copyUrl(url: string) {
  try {
    await navigator.clipboard.writeText(url);
    ElMessage.success('已复制');
  } catch {
    ElMessage.warning('复制失败，请手动选择复制');
  }
}

// ── 音频归一（后台线程跑，页面轮询进度；支持全量与单曲目）──
const normRunning = ref(false);
const normText = ref('');
const normQueuedIds = ref<number[]>([]);
const normCurrentId = ref(0);
let normTimer: ReturnType<typeof setInterval> | null = null;
let normJob = 0;
let polling = false;
let disposed = false;

function stopPolling() {
  if (normTimer) clearInterval(normTimer);
  normTimer = null;
}

function ensurePolling() {
  if (!normTimer) normTimer = setInterval(pollNorm, 3000);
  pollNorm();
}

async function pollNorm() {
  if (polling || disposed) return;
  polling = true;
  try {
    const s = await normalizeAudioStatus();
    if (disposed) return;
    normQueuedIds.value = s.queuedIds || [];
    normCurrentId.value = s.currentId || 0;
    const activeBatch = s.batch?.job === normJob ? s.batch : null;
    if (s.running && !activeBatch?.finished) {
      if (normJob) {
        const b = s.batch;
        normText.value = b?.job === normJob
          ? `处理中（${b.done}/${b.total}，失败 ${b.failed}）`
          : `处理中（队列剩 ${s.pending}）`;
      }
      return;
    }
    if (!s.running) stopPolling();
    if (normJob) {
      normRunning.value = false;
      // 按 job 编号取本轮结果（不能用条数偏移——多轮任务/自动检查会互相污染计数）
      const fresh = s.results.filter((r: any) => r.job === normJob);
      const summary = s.batch?.job === normJob ? s.batch : null;
      const conv = summary?.success ?? fresh.filter((r: any) => String(r.result).startsWith('done:')).length;
      const errs = fresh.filter((r: any) => String(r.result).startsWith('error:'));
      const failed = summary?.failed ?? errs.length;
      const skip = summary?.skipped ?? fresh.filter((r: any) => String(r.result).startsWith('skip:')).length;
      normJob = 0;
      ElMessageBox.alert(
        `处理 ${conv} 条（母版上 OSS / 可选 AAC / 会员试听），无需处理或跳过 ${skip} 条` +
        (failed ? `，失败 ${failed} 条。完整记录请到「音频任务历史」查看。` : ''),
        '全部处理完成'
      );
    }
    load();  // 刷新版本标识
  } catch {
    // 轮询失败（网络抖动）下一轮再试，不打断任务
  } finally {
    polling = false;
  }
}

async function onNormalize() {
  await ElMessageBox.confirm(
    '扫描全部曲目，按需搬运本地母版、补会员试听；仅在存储设置开启时补 AAC。任务在后台执行，期间可正常操作后台。',
    '全部处理',
    { type: 'info', confirmButtonText: '开始处理' }
  );
  const s = await normalizeAudio();
  normJob = s.job;
  normRunning.value = true;
  normText.value = '';
  ensurePolling();
}

// 单曲目处理：后台执行，行内显示排队中/处理中/失败原因
async function onProcessOne(row: any) {
  try {
    await normalizeTrack(row.id);
    ElMessage.info(`「${row.title}」已加入后台处理队列`);
    ensurePolling();
  } catch {
    // 拦截器已提示
  }
}

onMounted(async () => {
  elements.value = await listElements();
  if (disposed) return;
  load();
  // 可能上一轮处理还在后台跑（比如刚保存过曲目），接上进度显示
  try {
    const s = await normalizeAudioStatus();
    if (disposed) return;
    normQueuedIds.value = s.queuedIds || [];
    normCurrentId.value = s.currentId || 0;
    if (s.running) {
      normJob = s.batch && !s.batch.finished ? s.batch.job : 0;
      if (normJob) normRunning.value = true;
      ensurePolling();
    }
  } catch { /* 状态拉不到就算了 */ }
});
onUnmounted(() => {
  disposed = true;
  stopPolling();
});
</script>

<style scoped>


.hint { margin-left: 10px; color: var(--el-text-color-secondary); font-size: 12px; }
.up-row { display: flex; gap: 12px; align-items: center; width: 100%; }
.up-audio { display: block; margin-top: 10px; width: 100%; height: 36px; }
.up-cover { width: 64px; height: 64px; object-fit: cover; border-radius: 8px; }
.up-cover--loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border: 1px dashed var(--el-border-color);
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.up-cover-pct { font-size: 12px; }
.ver { margin-bottom: 14px; }
.ver__head { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.ver__url { flex: 1; font-size: 12px; color: var(--el-text-color-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ver__audio { width: 100%; height: 36px; }
</style>
