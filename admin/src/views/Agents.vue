<template>
  <div>
    <div class="summary">
      <el-card shadow="never"><div class="summary__label">在用代理</div><div class="summary__num">{{ sum.agents ?? '—' }}</div></el-card>
      <el-card shadow="never"><div class="summary__label">待审核提现</div><div class="summary__num">{{ sum.pendingWithdrawals ?? '—' }}</div></el-card>
      <el-card shadow="never"><div class="summary__label">累计分成</div><div class="summary__num">¥{{ money(sum.totalCommission) }}</div></el-card>
      <el-card shadow="never"><div class="summary__label">待结算</div><div class="summary__num">¥{{ money(sum.unsettled) }}</div></el-card>
    </div>

    <div class="toolbar">
      <el-input v-model="keyword" placeholder="名称 / 推广码 / 手机号" clearable style="width: 220px" @keyup.enter="reload" />
      <el-select v-model="filterType" placeholder="类型" clearable style="width: 140px" @change="reload">
        <el-option label="实体店" value="store" />
        <el-option label="网络推手" value="promoter" />
      </el-select>
      <el-select v-model="filterStatus" placeholder="状态" clearable style="width: 120px" @change="reload">
        <el-option label="启用" value="active" />
        <el-option label="停用" value="disabled" />
      </el-select>
      <el-button :icon="Search" @click="reload">查询</el-button>
      <el-button type="primary" :icon="Plus" @click="openCreate">新增代理</el-button>
    </div>

    <el-table :data="rows" v-loading="loading" border>
      <el-table-column prop="name" label="代理名称" min-width="140" />
      <el-table-column label="类型" width="100">
        <template #default="{ row }">
          <el-tag size="small" :type="row.type === 'store' ? '' : 'success'">
            {{ row.type === 'store' ? '实体店' : '网络推手' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="推广码" width="120">
        <template #default="{ row }">
          <span class="code" @click="copy(row.code)" title="点击复制">{{ row.code }}</span>
        </template>
      </el-table-column>
      <el-table-column label="分成比例" width="120">
        <template #default="{ row }">
          <span v-if="row.rate === null || row.rate === undefined" class="muted">
            {{ pct(row.effectiveRate) }}（默认）
          </span>
          <span v-else>{{ pct(row.rate) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="可提现" width="110">
        <template #default="{ row }">¥{{ money(row.balance?.available) }}</template>
      </el-table-column>
      <el-table-column label="冻结中" width="110">
        <template #default="{ row }">¥{{ money(row.balance?.frozen) }}</template>
      </el-table-column>
      <el-table-column label="已到账" width="110">
        <template #default="{ row }">¥{{ money(row.balance?.paid) }}</template>
      </el-table-column>
      <el-table-column prop="phone" label="手机号" width="130" />
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag size="small" :type="row.status === 'active' ? 'success' : 'info'">
            {{ row.status === 'active' ? '启用' : '停用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="150" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="openEdit(row)">编辑</el-button>
          <el-button size="small" :type="row.status === 'active' ? 'danger' : 'success'" @click="onToggle(row)">
            {{ row.status === 'active' ? '停用' : '启用' }}
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination class="pager" layout="total, prev, pager, next" :total="total"
      :page-size="size" :current-page="page" @current-change="onPage" />

    <el-dialog v-model="dialog" :title="form.id ? '编辑代理' : '新增代理'" width="520px">
      <el-form :model="form" label-width="110px">
        <el-form-item label="代理名称">
          <el-input v-model="form.name" placeholder="如：城东琴行 / 推手小李" />
        </el-form-item>
        <el-form-item label="类型">
          <el-radio-group v-model="form.type">
            <el-radio label="store">实体店</el-radio>
            <el-radio label="promoter">网络推手</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="分成比例">
          <el-input-number v-model="ratePct" :min="0" :max="100" :step="1" :precision="1" />
          <span class="unit">%</span>
          <el-checkbox v-model="useDefaultRate" style="margin-left: 12px">跟随默认</el-checkbox>
          <div class="tip">
            勾选「跟随默认」即随设置里的全局比例变动；填 0 表示不分成，两者不同。
            改比例<b>只影响之后的新订单</b>，历史分成按成交时点快照，不回溯。
          </div>
        </el-form-item>
        <el-form-item label="手机号">
          <el-input v-model="form.phone" placeholder="用于联系与核对" />
        </el-form-item>
        <el-form-item label="收款人姓名">
          <el-input v-model="form.real_name" placeholder="微信转账大额时需与实名一致" />
        </el-form-item>
        <el-form-item label="关联用户 ID">
          <el-input-number v-model="userIdNum" :min="0" />
          <div class="tip">
            填了代理才能在小程序/H5 的「代理中心」看到自己的业绩。
            填 0 表示暂不关联。可在「用户」页查到用户 ID。
          </div>
        </el-form-item>
        <el-form-item label="联系方式"><el-input v-model="form.contact" /></el-form-item>
        <el-form-item label="备注"><el-input v-model="form.remark" /></el-form-item>
        <el-form-item v-if="form.id" label="状态">
          <el-radio-group v-model="form.status">
            <el-radio label="active">启用</el-radio>
            <el-radio label="disabled">停用</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="onSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { Search, Plus } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import * as api from '@/api';

const rows = ref<any[]>([]);
const sum = ref<any>({});
const total = ref(0);
const page = ref(1);
const size = 20;
const loading = ref(false);
const saving = ref(false);
const dialog = ref(false);
const keyword = ref('');
const filterType = ref('');
const filterStatus = ref('');

const form = reactive<any>({
  id: 0, name: '', type: 'store', phone: '', real_name: '',
  contact: '', remark: '', commission_rate: null, status: 'active', user_id: null,
});

// 比例在界面上用百分数，存的是小数；「跟随默认」= commission_rate 为 null
const ratePct = ref(20);
const useDefaultRate = ref(true);
// el-input-number 不接受 null，用 0 表示未关联
const userIdNum = ref(0);

const money = (v: any) => Number(v || 0).toFixed(2);
const pct = (v: any) => `${(Number(v || 0) * 100).toFixed(1)}%`;

async function reload() {
  loading.value = true;
  try {
    const d = await api.listAgents({
      page: page.value, size, keyword: keyword.value,
      type: filterType.value, status: filterStatus.value,
    });
    rows.value = d.items || [];
    total.value = d.total || 0;
    sum.value = await api.agentsSummary();
  } finally {
    loading.value = false;
  }
}

function onPage(p: number) {
  page.value = p;
  reload();
}

function openCreate() {
  Object.assign(form, {
    id: 0, name: '', type: 'store', phone: '', real_name: '',
    contact: '', remark: '', commission_rate: null, status: 'active', user_id: null,
  });
  useDefaultRate.value = true;
  ratePct.value = 20;
  userIdNum.value = 0;
  dialog.value = true;
}

function openEdit(row: any) {
  Object.assign(form, {
    id: row.id, name: row.name, type: row.type, phone: row.phone || '',
    real_name: row.realName || '', contact: row.contact || '', remark: row.remark || '',
    commission_rate: row.rate, status: row.status, user_id: row.userId,
  });
  useDefaultRate.value = row.rate === null || row.rate === undefined;
  ratePct.value = Number(((row.rate ?? row.effectiveRate ?? 0.2) * 100).toFixed(1));
  userIdNum.value = row.userId || 0;
  dialog.value = true;
}

const payload = computed(() => ({
  name: form.name,
  type: form.type,
  phone: form.phone,
  real_name: form.real_name,
  contact: form.contact,
  remark: form.remark,
  commission_rate: useDefaultRate.value ? null : Number((ratePct.value / 100).toFixed(4)),
  status: form.status,
  user_id: userIdNum.value > 0 ? userIdNum.value : null,
}));

async function onSave() {
  if (!form.name.trim()) {
    ElMessage.warning('请填写代理名称');
    return;
  }
  saving.value = true;
  try {
    if (form.id) await api.updateAgent(form.id, payload.value);
    else await api.createAgent(payload.value);
    ElMessage.success('已保存');
    dialog.value = false;
    reload();
  } finally {
    saving.value = false;
  }
}

async function onToggle(row: any) {
  const on = row.status === 'active';
  await ElMessageBox.confirm(
    on
      ? '停用后该代理不再产生新分成，也进不了代理中心。已产生的分成不受影响。'
      : '确定重新启用该代理？',
    on ? '停用代理' : '启用代理'
  );
  await api.toggleAgent(row.id);
  ElMessage.success('已更新');
  reload();
}

function copy(code: string) {
  navigator.clipboard?.writeText(code);
  ElMessage.success(`已复制推广码 ${code}`);
}

onMounted(reload);
</script>

<style scoped>
.summary {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}
.summary__label {
  font-size: 13px;
  color: #909399;
}
.summary__num {
  margin-top: 6px;
  font-size: 22px;
  font-weight: 600;
}
.toolbar {
  display: flex;
  gap: 10px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}
.pager {
  margin-top: 14px;
  justify-content: flex-end;
}
.code {
  font-family: Consolas, Menlo, monospace;
  letter-spacing: 1px;
  cursor: pointer;
  color: #409eff;
}
.muted {
  color: #909399;
}
.unit {
  margin-left: 6px;
  color: #909399;
}
.tip {
  font-size: 12px;
  color: #909399;
  line-height: 1.6;
  margin-top: 4px;
}
</style>
