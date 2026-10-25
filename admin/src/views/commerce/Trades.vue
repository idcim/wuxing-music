<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { commerce, stateLabel, yuan } from '@/api/commerce';
import { useAuthStore } from '@/stores/auth';
const auth = useAuthStore();
const tab = ref('orders'), kind = ref(''), rows = ref<any[]>([]), page = ref(1), total = ref(0), loading = ref(false);
const detail = ref<any>({}), drawer = ref(false), shipDialog = ref(false), shipping = ref({ carrier: 'SF', tracking_no: '' });
const reviewDialog = ref(false), sale = ref<any>({}), review = ref({ action: 'approve', remark: '', restock: false });
const busy = ref(false);
async function load() {
  loading.value = true;
  try { const result = await commerce.get(tab.value === 'orders' ? `/orders?kind=${kind.value}&page=${page.value}` : `/aftersales?page=${page.value}`); rows.value = result.items; total.value = result.total; }
  finally { loading.value = false; }
}
async function ship() {
  busy.value = true;
  try { await commerce.post(`/orders/${detail.value.id}/ship`, shipping.value); shipDialog.value = false; drawer.value = false; await load(); }
  finally { busy.value = false; }
}
async function submitReview() {
  busy.value = true;
  try { await commerce.post(`/aftersales/${sale.value.id}/review`, review.value); reviewDialog.value = false; await load(); }
  finally { busy.value = false; }
}
watch([tab, kind], () => { page.value = 1; load(); });
onMounted(load);
</script>
<template>
  <BusinessPage title="课程商城交易" description="课程与实物订单独立管理；退款由支付渠道确认，发货和售后操作均保留历史。">
    <el-tabs v-model="tab"><el-tab-pane label="交易订单" name="orders" /><el-tab-pane label="售后处理" name="aftersales" /></el-tabs>
    <div class="toolbar"><el-select v-if="tab === 'orders'" v-model="kind" style="width:160px"><el-option label="全部订单" value="" /><el-option label="课程" value="course" /><el-option label="实物" value="physical" /></el-select><el-button @click="load">刷新</el-button></div>
    <BusinessTable :data="rows" v-loading="loading">
      <el-table-column prop="id" label="编号" width="80" />
      <el-table-column v-if="tab === 'orders'" prop="order_no" label="订单号" min-width="250" />
      <el-table-column v-else prop="order_id" label="订单编号" width="100" />
      <el-table-column prop="user_id" label="用户编号" width="100" />
      <el-table-column label="金额" width="120"><template #default="{ row }">{{ yuan(row.amount_fen) }}</template></el-table-column>
      <el-table-column label="状态" min-width="160"><template #default="{ row }">{{ stateLabel(row.status || row.state) }} {{ row.fulfillment ? `· ${stateLabel(row.fulfillment)}` : '' }}</template></el-table-column>
      <el-table-column v-if="tab === 'aftersales'" prop="reason" label="申请原因" min-width="180" />
      <el-table-column label="操作" width="210" fixed="right"><template #default="{ row }">
        <el-button v-if="tab === 'orders'" @click="detail = row; drawer = true">详情</el-button>
        <el-button v-if="tab === 'orders' && row.kind === 'physical' && row.status === 'paid' && (row.fulfillment === 'unshipped' || row.shipment?.sync_state === 'failed') && auth.can('commerce:ship')" @click="detail = row; shipping = { carrier: row.shipment?.carrier || 'SF', tracking_no: row.shipment?.tracking_no || '' }; shipDialog = true">{{ row.shipment ? '更正发货' : '发货' }}</el-button>
        <el-button v-if="tab === 'aftersales' && ['requested','returning'].includes(row.state) && auth.can('commerce:aftersales')" @click="sale = row; review = { action: row.state === 'returning' ? 'received' : 'approve', remark: '', restock: false }; reviewDialog = true">处理售后</el-button>
      </template></el-table-column>
    </BusinessTable>
    <BusinessPagination v-model:current-page="page" :total="total" :page-size="tab === 'orders' ? 20 : 30" layout="total, prev, pager, next" @current-change="load" />
    <BusinessDrawer v-model="drawer" title="交易详情" size="720px">
      <el-descriptions :column="1" border><el-descriptions-item label="订单号">{{ detail.order_no }}</el-descriptions-item><el-descriptions-item label="状态">{{ stateLabel(detail.status) }} · {{ stateLabel(detail.fulfillment) }}</el-descriptions-item><el-descriptions-item label="实付 / 已退">{{ yuan(detail.amount_fen) }} / {{ yuan(detail.refund_fen) }}</el-descriptions-item><el-descriptions-item label="收货信息">{{ detail.address?.name }} {{ detail.address?.phone }} {{ detail.address?.province }}{{ detail.address?.city }}{{ detail.address?.district }}{{ detail.address?.detail }}</el-descriptions-item></el-descriptions>
      <BusinessTable :data="detail.items"><el-table-column prop="title" label="内容" min-width="180" /><el-table-column prop="spec" label="规格" /><el-table-column prop="quantity" label="数量" width="70" /><el-table-column prop="refund_quantity" label="售后占用" width="90" /></BusinessTable>
      <p v-if="detail.shipment">快递：{{ detail.shipment.carrier }} {{ detail.shipment.tracking_no }} · 同步：{{ stateLabel(detail.shipment.sync_state) }} {{ detail.shipment.error }}</p>
      <el-alert v-if="detail.status === 'closing'" type="warning" title="正在确认渠道关单，尚未释放库存；请到课件与任务查看异常并核对。" :closable="false" />
    </BusinessDrawer>
    <BusinessModal v-model="shipDialog" title="登记快递发货"><BusinessForm :model="shipping"><el-form-item label="快递公司"><el-select v-model="shipping.carrier" filterable allow-create><el-option label="顺丰 SF" value="SF" /><el-option label="中通 ZTO" value="ZTO" /><el-option label="圆通 YTO" value="YTO" /><el-option label="韵达 YUNDA" value="YUNDA" /><el-option label="申通 STO" value="STO" /><el-option label="京东 JD" value="JD" /></el-select></el-form-item><el-form-item label="快递单号"><el-input v-model="shipping.tracking_no" /></el-form-item></BusinessForm><template #footer><el-button @click="shipDialog = false">取消</el-button><el-button type="primary" :loading="busy" @click="ship">确认发货</el-button></template></BusinessModal>
    <BusinessModal v-model="reviewDialog" title="审核售后 / 退货验收">
      <el-descriptions :column="1" border><el-descriptions-item label="申请">{{ sale.reason }} · {{ sale.quantity }} 件 · {{ yuan(sale.amount_fen) }}</el-descriptions-item><el-descriptions-item label="退货快递">{{ sale.return_carrier }} {{ sale.return_tracking }}</el-descriptions-item></el-descriptions>
      <div v-if="sale.images?.length" style="display:flex;gap:12px;margin:12px 0"><el-image v-for="src in sale.images" :key="src" :src="src" style="width:100px;height:100px" :preview-src-list="sale.images" /></div>
      <BusinessForm :model="review"><el-form-item label="处理结果"><el-select v-model="review.action"><el-option v-if="sale.state === 'requested'" label="审核通过" value="approve" /><el-option v-if="sale.state === 'requested'" label="审核不通过" value="reject" /><el-option v-if="sale.state === 'returning'" label="已收到退货并验收" value="received" /></el-select></el-form-item><el-form-item label="说明"><el-input v-model="review.remark" type="textarea" /></el-form-item><el-form-item v-if="review.action === 'received'" label="验收后恢复可售库存"><el-switch v-model="review.restock" :disabled="!auth.can('commerce:inventory')" /></el-form-item></BusinessForm>
      <el-alert type="warning" title="退款类通过操作会提交支付渠道；需退款权限，实际完成以渠道确认结果为准。" :closable="false" />
      <template #footer><el-button @click="reviewDialog = false">取消</el-button><el-button type="primary" :loading="busy" @click="submitReview">确认处理</el-button></template>
    </BusinessModal>
  </BusinessPage>
</template>
