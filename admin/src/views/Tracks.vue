<template>
  <div>
    <div class="toolbar">
      <el-select v-model="filterElement" placeholder="按五行筛选" clearable style="width: 160px" @change="reload">
        <el-option v-for="e in elements" :key="e.id" :label="`${e.id} · ${e.note}音`" :value="e.id" />
      </el-select>
      <el-button type="primary" :icon="Plus" @click="openEdit()">新增曲目</el-button>
    </div>

    <el-table :data="rows" v-loading="loading" border>
      <el-table-column prop="id" label="ID" width="70" />
      <el-table-column prop="element_id" label="五行" width="70" />
      <el-table-column prop="title" label="曲名" min-width="120" />
      <el-table-column prop="hz" label="频率" width="90" />
      <el-table-column prop="tag" label="标签" width="110" />
      <el-table-column prop="duration" label="时长" width="90" />
      <el-table-column label="会员专属" width="90">
        <template #default="{ row }">
          <el-tag :type="row.is_premium ? 'warning' : 'success'" size="small">
            {{ row.is_premium ? '会员' : '免费' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="上架" width="80">
        <template #default="{ row }">
          <el-tag :type="row.is_online ? 'success' : 'info'" size="small">
            {{ row.is_online ? '上架' : '下架' }}
          </el-tag>
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
            <el-upload
              :action="UPLOAD_URL"
              :headers="uploadHeaders"
              :show-file-list="false"
              accept="audio/*,.mp3,.m4a,.wav"
              :before-upload="() => { audioUploading = true; audioPct = 0; }"
              :on-progress="(e: any) => { audioPct = Math.round(e.percent || 0); }"
              :on-success="onAudioSuccess"
              :on-error="onUploadError"
            >
              <el-button :icon="Upload" :loading="audioUploading" :disabled="audioUploading">
                {{ audioUploading ? `上传中 ${audioPct}%` : '上传音频' }}
              </el-button>
            </el-upload>
            <el-input v-model="form.audio_url" placeholder="或填 CDN 地址" />
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
import { listTracks, createTrack, updateTrack, deleteTrack, listElements, UPLOAD_URL } from '@/api';

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
const dialog = ref(false);
const form = ref<any>({});

function onAudioSuccess(res: any) {
  audioUploading.value = false;
  if (res?.code === 0) {
    form.value.audio_url = res.data.url;
    ElMessage.success('音频已上传');
  } else {
    ElMessage.error(res?.msg || '上传失败');
  }
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
    const data = await listTracks({ page: page.value, size: size.value, element_id: filterElement.value || undefined });
    rows.value = data.items;
    total.value = data.total;
  } finally {
    loading.value = false;
  }
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

onMounted(async () => {
  elements.value = await listElements();
  load();
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
