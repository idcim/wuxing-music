<template>
  <div>
    <div class="toolbar">
      <el-select v-model="filterElement" placeholder="按五行筛选" clearable style="width: 160px" @change="reload">
        <el-option v-for="e in elements" :key="e.id" :label="`${e.id} · ${e.note}音`" :value="e.id" />
      </el-select>
      <el-button type="primary" :icon="Plus" @click="openEdit()">新增曲目</el-button>
      <el-button plain :loading="normRunning" @click="onNormalize">
        {{ normRunning ? normText || '修复中…' : '全部处理' }}
      </el-button>
      <span class="hint">为每首曲目录入 16-bit（PC 兼容）与 AAC（省流量）播放副本，母版不动；单行「处理」可单独重做</span>
    </div>

    <el-table :data="rows" v-loading="loading" border @sort-change="onSort">
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
            <el-tag v-if="row.play_url" size="small" type="success">16bit</el-tag>
            <el-tag v-if="row.aac_url" size="small" type="warning" style="margin-left: 4px">AAC</el-tag>
            <span v-if="!row.play_url && !row.aac_url" class="hint">仅母版</span>
            <el-tooltip v-if="normMap[row.id]?.result.startsWith('error:')" :content="normMap[row.id].result" placement="top">
              <el-tag size="small" type="danger" style="margin-left: 4px">失败</el-tag>
            </el-tooltip>
          </template>
          <el-button
            size="small" text type="primary" style="margin-left: 6px"
            :disabled="normQueuedIds.includes(row.id) || normCurrentId === row.id"
            @click="onProcessOne(row)"
          >处理</el-button>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="90" prop="is_online" sortable="custom">
        <template #default="{ row }">
          <el-tag v-if="!row.is_online" type="info" size="small">下架</el-tag>
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
    </el-table>

    <el-pagination
      class="pager"
      layout="total, prev, pager, next"
      :total="total"
      :page-size="size"
      :current-page="page"
      @current-change="onPage"
    />

    <el-dialog v-model="dialog" :title="form.id ? '编辑曲目' : '新增曲目'" width="560px">
      <el-form :model="form" label-width="90px">
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
            <!-- 音频一律先传服务端暂存（见 uploadAudio），保存后归一管线在后台
                 生成 16-bit/AAC 副本并把母版推上 OSS -->
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
            音频先传服务端暂存；保存曲目后后台自动生成 16-bit（PC 兼容）与 AAC（省流量）播放副本，
            并把母版推上 OSS——母版内容永不改动。无需等待，保存后可离开页面。
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
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">取消</el-button>
        <el-button type="primary" @click="onSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Plus, Upload, Loading } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { listTracks, createTrack, updateTrack, deleteTrack, listElements, UPLOAD_URL, normalizeAudio, normalizeAudioStatus, normalizeTrack } from '@/api';

const uploadHeaders = computed(() => ({
  Authorization: `Bearer ${localStorage.getItem('admin_token')}`
}));

// 上传进度/状态
const audioUploading = ref(false);
const audioPct = ref(0);
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

/**
 * 音频上传：一律先传服务端（暂存母版），保存曲目后归一管线在后台自动
 * 生成 16-bit/AAC 播放副本并把母版推上 OSS——上传者不用在场等。
 * 不再用浏览器直传 OSS：服务端拿不到字节就没法做转码。
 */
async function uploadAudio(opt: any) {
  const file: File = opt.file;
  audioUploading.value = true;
  audioPct.value = 0;
  try {
    const fd = new FormData();
    fd.append('file', file);
    const res = await xhrUpload(UPLOAD_URL, fd, (p) => { audioPct.value = p; }, {
      Authorization: `Bearer ${localStorage.getItem('admin_token')}`
    });
    const body = JSON.parse(res);
    if (body?.code !== 0) throw new Error(body?.msg || '上传失败');
    form.value.audio_url = body.data.url;
    ElMessage.success('音频已上传，保存后后台自动生成播放副本');
    readAudioDuration(body.data.full_url || body.data.url);
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
  if (!form.value.element_id || !form.value.title) {
    ElMessage.warning('五行和曲名必填');
    return;
  }
  syncSec();
  if (form.value.id) {
    await updateTrack(form.value.id, form.value);
  } else {
    await createTrack(form.value);
  }
  ElMessage.success('已保存');
  dialog.value = false;
  load();
}

async function onDelete(row: any) {
  await ElMessageBox.confirm(`确定删除曲目「${row.title}」？`, '提示', { type: 'warning' });
  await deleteTrack(row.id);
  ElMessage.success('已删除');
  load();
}

// ── 音频归一（后台线程跑，页面轮询进度；支持全量与单曲目）──
const normRunning = ref(false);
const normText = ref('');
const normQueuedIds = ref<number[]>([]);
const normCurrentId = ref(0);
// 每个曲目的最新处理结果（按 seq 取新），行内展示失败原因用
const normMap = ref<Record<number, { seq: number; result: string }>>({});
let normTimer: ReturnType<typeof setInterval> | null = null;
let normJob = 0;

function mergeResults(results: any[]) {
  const m = { ...normMap.value };
  for (const r of results || []) {
    if (r.trackId && (!m[r.trackId] || m[r.trackId].seq < r.seq)) {
      m[r.trackId] = { seq: r.seq, result: r.result };
    }
  }
  normMap.value = m;
}

function stopPolling() {
  if (normTimer) clearInterval(normTimer);
  normTimer = null;
}

function ensurePolling() {
  if (!normTimer) normTimer = setInterval(pollNorm, 3000);
  pollNorm();
}

async function pollNorm() {
  try {
    const s = await normalizeAudioStatus();
    normQueuedIds.value = s.queuedIds || [];
    normCurrentId.value = s.currentId || 0;
    mergeResults(s.results);
    if (s.running) {
      if (normJob) {
        const mine = s.results.filter((r: any) => r.job === normJob);
        normText.value = `修复中（本轮已处理 ${mine.length}，队列剩 ${s.pending}）`;
      }
      return;
    }
    stopPolling();
    if (normJob) {
      normRunning.value = false;
      // 按 job 编号取本轮结果（不能用条数偏移——多轮任务/自动检查会互相污染计数）
      const fresh = s.results.filter((r: any) => r.job === normJob);
      const conv = fresh.filter((r: any) => String(r.result).startsWith('done:')).length;
      const errs = fresh.filter((r: any) => String(r.result).startsWith('error:'));
      const skip = fresh.length - conv - errs.length;
      normJob = 0;
      ElMessageBox.alert(
        `处理 ${conv} 条（母版上 OSS / 16-bit / AAC 副本按需生成），无需处理或跳过 ${skip} 条` +
        (errs.length
          ? `，失败 ${errs.length} 条：\n` + errs.map((e: any) => `#${e.trackId} ${e.title}：${e.result}`).join('\n')
          : ''),
        '全部处理完成'
      );
    }
    load();  // 刷新版本标识
  } catch {
    // 轮询失败（网络抖动）下一轮再试，不打断任务
  }
}

async function onNormalize() {
  await ElMessageBox.confirm(
    '扫描全部曲目，为每首生成缺失的 16-bit / AAC 播放副本（母版不动）。任务在后台执行，期间可正常操作后台。',
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
  load();
  // 可能上一轮处理还在后台跑（比如刚保存过曲目），接上进度显示
  try {
    const s = await normalizeAudioStatus();
    normQueuedIds.value = s.queuedIds || [];
    normCurrentId.value = s.currentId || 0;
    mergeResults(s.results);
    if (s.running) {
      normJob = s.job || 0;
      if (normJob) normRunning.value = true;
      ensurePolling();
    }
  } catch { /* 状态拉不到就算了 */ }
});
</script>

<style scoped>
.toolbar { margin-bottom: 16px; display: flex; gap: 12px; }
.pager { margin-top: 16px; justify-content: flex-end; }
.hint { margin-left: 10px; color: #999; font-size: 12px; }
.up-row { display: flex; gap: 12px; align-items: center; width: 100%; }
.up-audio { display: block; margin-top: 10px; width: 100%; height: 36px; }
.up-cover { width: 64px; height: 64px; object-fit: cover; border-radius: 8px; }
.up-cover--loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border: 1px dashed #d9d9d9;
  color: #999;
  font-size: 12px;
}
.up-cover-pct { font-size: 12px; }
</style>
