<template>
  <div>
    <div class="toolbar">
      <el-select v-model="filterStatus" placeholder="按状态筛选" clearable style="width: 140px" @change="reload">
        <el-option label="未使用" value="unused" />
        <el-option label="已使用" value="used" />
        <el-option label="已禁用" value="disabled" />
        <el-option label="已过期" value="expired" />
      </el-select>
      <el-button type="primary" :icon="Plus" @click="genDialog = true">批量生成</el-button>
    </div>

    <el-table :data="rows" v-loading="loading" border>
      <el-table-column prop="code" label="兑换码" min-width="200" />
      <el-table-column prop="plan_name" label="卡名" width="130" />
      <el-table-column prop="plan_type" label="类型" width="90" />
      <el-table-column prop="duration_days" label="天数" width="80" />
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="statusType(row.status)" size="small">{{ statusText(row.status) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="batch_id" label="批次" width="120" />
      <el-table-column label="操作" width="100" fixed="right">
        <template #default="{ row }">
          <el-button v-if="row.status === 'unused'" size="small" type="danger" @click="onDisable(row)">禁用</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination class="pager" layout="total, prev, pager, next" :total="total"
      :page-size="size" :current-page="page" @current-change="onPage" />

    <!-- 批量生成 -->
    <el-dialog v-model="genDialog" title="批量生成兑换码" width="480px">
      <el-form :model="genForm" label-width="100px">
        <el-form-item label="卡类型">
          <el-select v-model="genForm.plan_type">
            <el-option label="月卡 month" value="month" />
            <el-option label="年卡 year" value="year" />
            <el-option label="体验 trial" value="trial" />
          </el-select>
        </el-form-item>
        <el-form-item label="卡名"><el-input v-model="genForm.plan_name" placeholder="月悦体验卡" /></el-form-item>
        <el-form-item label="时长(天)"><el-input-number v-model="genForm.duration_days" :min="1" /></el-form-item>
        <el-form-item label="数量"><el-input-number v-model="genForm.count" :min="1" :max="1000" /></el-form-item>
        <el-form-item label="前缀"><el-input v-model="genForm.prefix" /></el-form-item>
        <el-form-item label="备注"><el-input v-model="genForm.remark" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="genDialog = false">取消</el-button>
        <el-button type="primary" :loading="generating" @click="onGenerate">生成</el-button>
      </template>
    </el-dialog>

    <!-- 生成结果 -->
    <el-dialog v-model="resultDialog" title="生成成功" width="480px">
      <p>批次 <b>{{ genResult.batch_id }}</b>，共 {{ genResult.count }} 个：</p>
      <el-input type="textarea" :rows="10" :model-value="(genResult.codes || []).join('\n')" readonly />
      <template #footer>
        <el-button @click="copyResult">复制全部</el-button>
        <el-button type="primary" @click="exportResult">导出 TXT</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { Plus } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { listCdkeys, generateCdkeys, disableCdkey } from '@/api';

const rows = ref<any[]>([]);
const total = ref(0);
const page = ref(1);
const size = ref(20);
const loading = ref(false);
const filterStatus = ref('');

const genDialog = ref(false);
const generating = ref(false);
const genForm = reactive({ plan_type: 'month', plan_name: '', duration_days: 30, count: 10, prefix: 'WUXING', remark: '' });
const resultDialog = ref(false);
const genResult = ref<any>({});

function statusText(s: string) {
  return { unused: '未使用', used: '已使用', disabled: '已禁用', expired: '已过期' }[s] || s;
}
function statusType(s: string) {
  return { unused: 'success', used: 'info', disabled: 'danger', expired: 'warning' }[s] || '';
}

async function load() {
  loading.value = true;
  try {
    const data = await listCdkeys({ page: page.value, size: size.value, status: filterStatus.value || undefined });
    rows.value = data.items;
    total.value = data.total;
  } finally {
    loading.value = false;
  }
}
function reload() { page.value = 1; load(); }
function onPage(p: number) { page.value = p; load(); }

async function onGenerate() {
  if (!genForm.plan_name) { ElMessage.warning('请填卡名'); return; }
  generating.value = true;
  try {
    genResult.value = await generateCdkeys({ ...genForm });
    genDialog.value = false;
    resultDialog.value = true;
    load();
  } finally {
    generating.value = false;
  }
}

async function onDisable(row: any) {
  await ElMessageBox.confirm(`确定禁用 ${row.code}？`, '提示', { type: 'warning' });
  await disableCdkey(row.id);
  ElMessage.success('已禁用');
  load();
}

function copyResult() {
  navigator.clipboard.writeText((genResult.value.codes || []).join('\n'));
  ElMessage.success('已复制');
}
function exportResult() {
  const blob = new Blob([(genResult.value.codes || []).join('\n')], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `cdkeys-${genResult.value.batch_id}.txt`;
  a.click();
}

onMounted(load);
</script>

<style scoped>
.toolbar { margin-bottom: 16px; display: flex; gap: 12px; }
.pager { margin-top: 16px; justify-content: flex-end; }
</style>
