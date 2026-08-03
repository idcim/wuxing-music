<template>
  <div>
    <el-alert v-if="payoutMode === 'manual'" type="warning" :closable="false" class="note">
      <template #title>
        当前打款方式为<b>线下转账</b>：审核通过后系统<b>不会自动打款</b>，
        请自行微信/银行转账给代理，再回来点「标记已打款」。
        （切换到微信自动转账需先开通商户号的「商家转账」产品权限，见 设置 → 代理分成）
      </template>
    </el-alert>

    <div class="toolbar">
      <el-select v-model="filterStatus" placeholder="按状态筛选" clearable style="width: 150px" @change="reload">
        <el-option label="待审核" value="pending" />
        <el-option label="待打款" value="approved" />
        <el-option label="已到账" value="paid" />
        <el-option label="已驳回" value="rejected" />
        <el-option label="打款失败" value="failed" />
      </el-select>
      <el-button :icon="Search" @click="reload">查询</el-button>
    </div>

    <el-table :data="rows" v-loading="loading" border>
      <el-table-column prop="agentName" label="代理" min-width="130" />
      <el-table-column label="金额" width="120">
        <template #default="{ row }"><b>¥{{ money(row.amount) }}</b></template>
      </el-table-column>
      <el-table-column label="状态" width="110">
        <template #default="{ row }">
          <el-tag size="small" :type="STATUS[row.status]?.type || ''">
            {{ STATUS[row.status]?.text || row.status }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="打款方式" width="110">
        <template #default="{ row }">{{ row.payoutMode === 'wxpay' ? '微信转账' : '线下转账' }}</template>
      </el-table-column>
      <el-table-column label="收款信息" min-width="180">
        <template #default="{ row }">
          <div>{{ row.agentRealName || '—' }}</div>
          <div class="muted">{{ row.agentPhone || '—' }}</div>
        </template>
      </el-table-column>
      <el-table-column label="申请时间" width="170">
        <template #default="{ row }">{{ fmt(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column prop="reviewedBy" label="经办人" width="110" />
      <el-table-column label="失败原因 / 备注" min-width="180">
        <template #default="{ row }">
          <span v-if="row.failReason" class="fail">{{ row.failReason }}</span>
          <span v-else>{{ row.remark || '—' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="210" fixed="right">
        <template #default="{ row }">
          <template v-if="row.status === 'pending'">
            <el-button size="small" type="primary" @click="onApprove(row)">通过</el-button>
            <el-button size="small" type="danger" @click="onReject(row)">驳回</el-button>
          </template>
          <template v-else-if="row.status === 'approved'">
            <el-button size="small" type="success" @click="onPaid(row)">标记已打款</el-button>
            <el-button size="small" type="danger" @click="onReject(row)">驳回</el-button>
          </template>
          <span v-else class="muted">—</span>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination class="pager" layout="total, prev, pager, next" :total="total"
      :page-size="size" :current-page="page" @current-change="onPage" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { Search } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import * as api from '@/api';

const rows = ref<any[]>([]);
const total = ref(0);
const page = ref(1);
const size = 20;
const loading = ref(false);
const filterStatus = ref('');
const payoutMode = ref('manual');

const money = (v: any) => Number(v || 0).toFixed(2);
const fmt = (s: string) => (s ? s.replace('T', ' ').slice(0, 16) : '—');

const STATUS: Record<string, { text: string; type: string }> = {
  pending: { text: '待审核', type: 'warning' },
  approved: { text: '待打款', type: '' },
  paid: { text: '已到账', type: 'success' },
  rejected: { text: '已驳回', type: 'info' },
  failed: { text: '打款失败', type: 'danger' },
};

async function reload() {
  loading.value = true;
  try {
    const d = await api.listWithdrawals({ page: page.value, size, status: filterStatus.value });
    rows.value = d.items || [];
    total.value = d.total || 0;
  } finally {
    loading.value = false;
  }
}

function onPage(p: number) {
  page.value = p;
  reload();
}

async function onApprove(row: any) {
  const auto = payoutMode.value === 'wxpay';
  await ElMessageBox.confirm(
    auto
      ? `通过后将立即向「${row.agentName}」的微信转账 ¥${money(row.amount)}，此操作不可撤销。`
      : `通过后状态变为「待打款」。请自行转账 ¥${money(row.amount)} 给「${row.agentName}」，再回来点「标记已打款」。`,
    '审核通过',
    { type: 'warning' }
  );
  const d = await api.approveWithdrawal(row.id);
  if (d.status === 'failed') ElMessage.error(`打款失败：${d.failReason || '未知原因'}`);
  else ElMessage.success(d.status === 'paid' ? '已打款' : '已通过，待打款');
  reload();
}

async function onReject(row: any) {
  const { value } = await ElMessageBox.prompt(
    '驳回后这笔钱会退回代理的可提现余额，代理可以重新申请。',
    '驳回提现',
    { inputPlaceholder: '驳回原因（会展示给代理）', inputValue: '' }
  );
  await api.rejectWithdrawal(row.id, value || '');
  ElMessage.success('已驳回，金额已退回可提现');
  reload();
}

async function onPaid(row: any) {
  await ElMessageBox.confirm(
    `确认已经把 ¥${money(row.amount)} 转给「${row.agentName}」了吗？标记后不可撤销。`,
    '标记已打款',
    { type: 'warning' }
  );
  await api.markWithdrawalPaid(row.id);
  ElMessage.success('已标记为已打款');
  reload();
}

onMounted(async () => {
  try {
    const cfg = await api.getAgentSetting();
    payoutMode.value = cfg.payout_mode || 'manual';
  } catch {
    // 读不到设置不影响列表，按默认的线下转账提示
  }
  reload();
});
</script>

<style scoped>
.toolbar {
  display: flex;
  gap: 10px;
  margin-bottom: 14px;
}
.pager {
  margin-top: 14px;
  justify-content: flex-end;
}
.note {
  margin-bottom: 14px;
}
.muted {
  color: #909399;
}
.fail {
  color: #f56c6c;
}
</style>
