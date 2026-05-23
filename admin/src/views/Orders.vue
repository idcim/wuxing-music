<template>
  <div>
    <div class="toolbar">
      <el-input v-model="orderNo" placeholder="订单号" clearable style="width: 200px" @keyup.enter="reload" />
      <el-select v-model="filterStatus" placeholder="按状态筛选" clearable style="width: 150px" @change="reload">
        <el-option label="待支付" value="pending" />
        <el-option label="已支付" value="paid" />
        <el-option label="退款中" value="refunding" />
        <el-option label="已退款" value="refunded" />
        <el-option label="已关闭" value="closed" />
      </el-select>
      <el-button :icon="Search" @click="reload">查询</el-button>
    </div>

    <el-table :data="rows" v-loading="loading" border>
      <el-table-column prop="order_no" label="订单号" min-width="190" />
      <el-table-column prop="plan_name" label="套餐" width="90" />
      <el-table-column label="金额" width="90">
        <template #default="{ row }">¥{{ row.amount }}</template>
      </el-table-column>
      <el-table-column prop="user_id" label="用户ID" width="90" />
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="statusType(row.status)" size="small">{{ statusText(row.status) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="退款" width="160">
        <template #default="{ row }">
          <span v-if="row.refund_amount">¥{{ row.refund_amount }}<span v-if="row.refund_reason" class="reason"> · {{ row.refund_reason }}</span></span>
        </template>
      </el-table-column>
      <el-table-column label="支付时间" width="170">
        <template #default="{ row }">{{ fmt(row.paid_at) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="150" fixed="right">
        <template #default="{ row }">
          <el-button v-if="row.status === 'paid'" size="small" type="warning" @click="openRefund(row)">退款</el-button>
          <el-button v-else-if="row.status === 'refunding'" size="small" type="danger" @click="onConfirm(row)">确认退款</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination class="pager" layout="total, prev, pager, next" :total="total"
      :page-size="size" :current-page="page" @current-change="onPage" />

    <el-dialog v-model="refundDialog" title="发起退款" width="460px">
      <el-form label-width="90px">
        <el-form-item label="订单号">{{ current.order_no }}</el-form-item>
        <el-form-item label="订单金额">¥{{ current.amount }}</el-form-item>
        <el-form-item label="退款金额">
          <el-input-number v-model="refundForm.amount" :min="0.01" :max="current.amount" :precision="2" />
        </el-form-item>
        <el-form-item label="退款原因">
          <el-input v-model="refundForm.reason" type="textarea" :rows="3" placeholder="选填" />
        </el-form-item>
      </el-form>
      <el-alert type="info" :closable="false" show-icon
        title="发起后订单转为「退款中」，确认退款后将回收该用户会员权益。" />
      <template #footer>
        <el-button @click="refundDialog = false">取消</el-button>
        <el-button type="warning" :loading="submitting" @click="onRefund">发起退款</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { Search } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { listOrders, refundOrder, confirmRefund } from '@/api';

const rows = ref<any[]>([]);
const total = ref(0);
const page = ref(1);
const size = ref(20);
const loading = ref(false);
const filterStatus = ref('');
const orderNo = ref('');

const refundDialog = ref(false);
const submitting = ref(false);
const current = ref<any>({});
const refundForm = reactive({ amount: 0, reason: '' });

function statusText(s: string) {
  return { pending: '待支付', paid: '已支付', refunding: '退款中', refunded: '已退款', failed: '失败', closed: '已关闭' }[s] || s;
}
function statusType(s: string) {
  return { pending: 'info', paid: 'success', refunding: 'warning', refunded: 'danger', failed: 'info', closed: 'info' }[s] || '';
}
function fmt(s?: string) {
  return s ? new Date(s).toLocaleString('zh-CN') : '-';
}

async function load() {
  loading.value = true;
  try {
    const d = await listOrders({ page: page.value, size: size.value, status: filterStatus.value || undefined, order_no: orderNo.value || undefined });
    rows.value = d.items;
    total.value = d.total;
  } finally {
    loading.value = false;
  }
}
function reload() { page.value = 1; load(); }
function onPage(p: number) { page.value = p; load(); }

function openRefund(row: any) {
  current.value = row;
  refundForm.amount = row.amount;
  refundForm.reason = '';
  refundDialog.value = true;
}

async function onRefund() {
  submitting.value = true;
  try {
    await refundOrder(current.value.id, { amount: refundForm.amount, reason: refundForm.reason });
    ElMessage.success('已发起退款');
    refundDialog.value = false;
    load();
  } finally {
    submitting.value = false;
  }
}

async function onConfirm(row: any) {
  await ElMessageBox.confirm(
    `确认订单 ${row.order_no} 已退款完成？将回收该用户会员权益。`,
    '确认退款', { type: 'warning' }
  );
  await confirmRefund(row.id);
  ElMessage.success('退款已完成');
  load();
}

onMounted(load);
</script>

<style scoped>
.toolbar { margin-bottom: 16px; display: flex; gap: 12px; }
.pager { margin-top: 16px; justify-content: flex-end; }
.reason { color: #999; }
</style>
