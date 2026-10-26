<script setup lang="ts">
import { ref, watch } from 'vue';
import { useActivePolling } from '@/composables/useActivePolling';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { listAudioHistory, normalizeTrack } from '@/api';
import { useAuthStore } from '@/stores/auth';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const rows = ref<any[]>([]);
const total = ref(0);
const page = ref(1);
const size = ref(20);
const outcome = ref('');
const job = ref<number | undefined>(route.query.job ? Number(route.query.job) : undefined);
const batch = ref<any>(null);
const loading = ref(false);
const retrying = ref<number[]>([]);
let disposed = false;
let loadId = 0;

async function load() {
  if (loading.value || disposed) return;
  const id = ++loadId;
  loading.value = true;
  try {
    const data = await listAudioHistory({ page: page.value, size: size.value, outcome: outcome.value || undefined, job: job.value });
    if (disposed || id !== loadId) return;
    rows.value = data.items;
    total.value = data.total;
    batch.value = data.batch;
  } finally {
    if (id === loadId) loading.value = false;
  }
}
function reset() { page.value = 1; load(); }
// 从曲目任务跳到另一个批次时，缓存页也要应用新查询；普通菜单切回保留手动筛选。
watch(() => route.path === '/audio-history' ? route.query.job : undefined, (value) => {
  const requested = Number(value);
  if (!Number.isSafeInteger(requested) || requested < 1) return;
  job.value = requested; page.value = 1; loadId++; loading.value = false;
  load().catch(() => {});
});
function resultLabel(r: any) {
  const labels: Record<string, string> = { done: '成功', error: '失败', skip: '跳过', retry: '自动重试' };
  return labels[r.outcome] || r.outcome;
}
function resultType(r: any): 'success' | 'danger' | 'info' | 'warning' {
  return r.outcome === 'done' ? 'success' : r.outcome === 'error' ? 'danger' : r.outcome === 'retry' ? 'warning' : 'info';
}
async function retry(row: any) {
  retrying.value.push(row.trackId);
  try {
    await normalizeTrack(row.trackId);
    ElMessage.success('已重新排队，无需上传音频');
  } finally {
    retrying.value = retrying.value.filter(id => id !== row.trackId);
  }
}
useActivePolling(() => { disposed = false; return load(); }, 15000, () => { disposed = true; loadId++; loading.value = false; });
</script>

<template>
  <BusinessPage :card="false">
    <BusinessCard>
      <template #header><div class="history-heading"><div><b>音频任务历史</b><p>处理记录保存在服务器，刷新页面或重启服务后仍可查看。</p></div><el-button :loading="loading" @click="load">刷新</el-button></div></template>
      <div class="history-toolbar">
        <el-select v-model="outcome" clearable placeholder="全部结果" style="width:150px" @change="reset">
          <el-option label="成功" value="done" /><el-option label="失败" value="error" /><el-option label="自动重试" value="retry" /><el-option label="跳过" value="skip" />
        </el-select>
        <el-input-number v-model="job" :min="1" controls-position="right" placeholder="批次编号" @change="reset" />
        <el-button v-if="job" text @click="job = undefined; router.replace('/audio-history'); reset()">查看全部批次</el-button>
        <span class="history-hint">共 {{ total }} 条记录</span>
      </div>
      <el-alert v-if="batch" :closable="false" :type="batch.failed ? 'warning' : 'info'" class="history-summary"
        :title="`批次 #${batch.job}：已完成 ${batch.done}/${batch.total}，成功 ${batch.success}，失败 ${batch.failed}，跳过 ${batch.skipped}${batch.finished ? '（已结束）' : '（后台处理中）'}`" />
      <BusinessTable :data="rows" v-loading="loading" border>
        <el-table-column prop="seq" label="记录" width="85" />
        <el-table-column label="时间" width="180"><template #default="{ row }">{{ new Date(row.at).toLocaleString('zh-CN', { hour12: false }) }}</template></el-table-column>
        <el-table-column label="批次" width="85"><template #default="{ row }">{{ row.job ? `#${row.job}` : '单曲' }}</template></el-table-column>
        <el-table-column label="曲目" min-width="140"><template #default="{ row }">{{ row.title || `曲目 #${row.trackId}` }}</template></el-table-column>
        <el-table-column label="结果" width="100"><template #default="{ row }"><el-tag :type="resultType(row)">{{ resultLabel(row) }}</el-tag></template></el-table-column>
        <el-table-column label="详情" min-width="260"><template #default="{ row }"><span class="history-detail">{{ row.result.replace(/^[^:]+:/, '') }}</span></template></el-table-column>
        <el-table-column label="尝试" width="70" prop="attempt" />
        <el-table-column v-if="auth.can('tracks:edit')" label="操作" width="100" fixed="right"><template #default="{ row }"><el-button v-if="row.outcome === 'error' && row.trackId" type="primary" text :loading="retrying.includes(row.trackId)" @click="retry(row)">重试</el-button></template></el-table-column>
      </BusinessTable>
      <BusinessPagination v-model:current-page="page" v-model:page-size="size" :total="total" :page-sizes="[20, 50, 100]" layout="total, sizes, prev, pager, next" class="history-pager" @current-change="load" @size-change="reset" />
    </BusinessCard>

  </BusinessPage>
</template>

<style scoped>
.history-heading { display:flex; justify-content:space-between; align-items:center; gap:16px; }
.history-heading p { font-weight:400; }
.history-heading p,.history-hint { color:var(--el-text-color-secondary); font-size:13px; margin:6px 0 0; }
.history-toolbar { display:flex; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:16px; }
.history-summary { margin-bottom:16px; }
.history-detail { white-space:pre-wrap; overflow-wrap:anywhere; }
.history-pager { margin-top:20px; justify-content:flex-end; }
</style>
