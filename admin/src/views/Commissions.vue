<template>
  <div>
    <div class="toolbar">
      <el-select v-model="filterAgent" placeholder="按代理筛选" clearable filterable style="width: 200px" @change="reload">
        <el-option v-for="a in agents" :key="a.id" :label="`${a.name}（${a.code}）`" :value="a.id" />
      </el-select>
      <el-select v-model="filterStatus" placeholder="按状态筛选" clearable style="width: 150px" @change="reload">
        <el-option label="冻结中" value="pending" />
        <el-option label="可提现" value="available" />
        <el-option label="提现处理中" value="withdrawing" />
        <el-option label="已到账" value="paid" />
        <el-option label="已作废" value="void" />
      </el-select>
      <el-select v-model="filterLevel" placeholder="按层级筛选" clearable style="width: 140px" @change="reload">
        <el-option label="直推" :value="1" />
        <el-option label="下级抽成" :value="2" />
      </el-select>
      <el-button :icon="Search" @click="reload">查询</el-button>
    </div>

    <el-table :data="rows" v-loading="loading" border>
      <el-table-column prop="agentName" label="代理" min-width="130" />
      <el-table-column label="订单金额" width="110">
        <template #default="{ row }">¥{{ money(row.orderAmount) }}</template>
      </el-table-column>
      <el-table-column label="比例" width="90">
        <template #default="{ row }">{{ (Number(row.rate || 0) * 100).toFixed(1) }}%</template>
      </el-table-column>
      <el-table-column label="层级" width="150">
        <template #default="{ row }">
          <el-tag v-if="row.level === 2" size="small" type="warning" effect="plain">
            下级抽成
          </el-tag>
          <el-tag v-else size="small" effect="plain">直推</el-tag>
          <span v-if="row.level === 2 && row.sourceAgentName" class="muted src">
            来自 {{ row.sourceAgentName }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="分成" width="170">
        <template #default="{ row }">
          <b>¥{{ money(row.amount) }}</b>
          <!-- 直推被上级抽走过就把差额标出来，否则「为什么只拿到 15」没人解释得清 -->
          <span v-if="row.level === 1 && row.baseAmount > row.amount" class="muted src">
            (基数 {{ money(row.baseAmount) }})
          </span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="180">
        <template #default="{ row }">
          <el-tag size="small" :type="tagType(row)">{{ statusText(row) }}</el-tag>
          <el-tag v-if="row.clawback" size="small" type="danger" style="margin-left: 6px">已付款后退款</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="解冻时间" width="170">
        <template #default="{ row }">{{ fmt(row.availableAt) }}</template>
      </el-table-column>
      <el-table-column prop="orderId" label="订单 ID" width="100" />
      <el-table-column label="成交时间" width="170">
        <template #default="{ row }">{{ fmt(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column prop="voidReason" label="作废原因" min-width="160" />
    </el-table>

    <el-pagination class="pager" layout="total, prev, pager, next" :total="total"
      :page-size="size" :current-page="page" @current-change="onPage" />

    <el-alert type="info" :closable="false" class="note">
      <template #title>
        「已付款后退款」是指分成的钱已经打给代理、订单事后才退款——这笔钱系统追不回来，需人工向代理追讨。
        把设置里的<b>冻结天数</b>调得比退款窗口长，可以基本杜绝这种情况。
      </template>
    </el-alert>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { Search } from '@element-plus/icons-vue';
import * as api from '@/api';

const rows = ref<any[]>([]);
const agents = ref<any[]>([]);
const total = ref(0);
const page = ref(1);
const size = 20;
const loading = ref(false);
const filterAgent = ref<number | ''>('');
const filterStatus = ref('');
const filterLevel = ref<number | ''>('');

const money = (v: any) => Number(v || 0).toFixed(2);
const fmt = (s: string) => (s ? s.replace('T', ' ').slice(0, 16) : '—');

const STATUS: Record<string, { text: string; type: string }> = {
  pending: { text: '冻结中', type: 'warning' },
  available: { text: '可提现', type: 'success' },
  withdrawing: { text: '提现处理中', type: '' },
  paid: { text: '已到账', type: 'info' },
  void: { text: '已作废', type: 'danger' },
};

// pending 但已过解冻时间，实际就是可提现——列表按实际状态显示，别让人误以为还冻着
function effective(row: any): string {
  if (row.status === 'pending' && row.availableAt && new Date(row.availableAt) <= new Date()) {
    return 'available';
  }
  return row.status;
}
const statusText = (row: any) => STATUS[effective(row)]?.text || row.status;
const tagType = (row: any) => STATUS[effective(row)]?.type || '';

async function reload() {
  loading.value = true;
  try {
    const d = await api.listCommissions({
      page: page.value, size,
      agent_id: filterAgent.value || 0,
      status: filterStatus.value,
      level: filterLevel.value || 0,
    });
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

onMounted(async () => {
  const d = await api.listAgents({ page: 1, size: 100 });
  agents.value = d.items || [];
  reload();
});
</script>

<style scoped>
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
.note {
  margin-top: 16px;
}
.muted {
  color: #909399;
}
.src {
  margin-left: 6px;
  font-size: 12px;
}
</style>
