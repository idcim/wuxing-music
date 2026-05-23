<template>
  <div>
    <div class="toolbar">
      <el-input v-model="keyword" placeholder="按昵称搜索" clearable style="width: 200px" @keyup.enter="reload" />
      <el-button :icon="Search" @click="reload">搜索</el-button>
    </div>
    <el-table :data="rows" v-loading="loading" border>
      <el-table-column prop="id" label="ID" width="70" />
      <el-table-column label="头像" width="72">
        <template #default="{ row }">
          <el-avatar :size="40" :src="row.avatar || undefined">
            {{ (row.nickname || '律').slice(0, 1) }}
          </el-avatar>
        </template>
      </el-table-column>
      <el-table-column prop="nickname" label="昵称" min-width="110" />
      <el-table-column prop="phone" label="手机号" width="130">
        <template #default="{ row }">{{ row.phone || '-' }}</template>
      </el-table-column>
      <el-table-column prop="element" label="五行" width="70" />
      <el-table-column label="会员" width="140">
        <template #default="{ row }">
          <el-tag :type="row.membership_type === 'free' ? 'info' : 'warning'" size="small">
            {{ row.membership_name }}
          </el-tag>
          <el-tag v-if="row.membership_source === 'gift'" type="success" size="small" class="src">赠送</el-tag>
          <el-tag v-else-if="row.membership_source === 'cdkey'" size="small" class="src">兑换</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="到期" width="170">
        <template #default="{ row }">{{ fmt(row.membership_expire_at) }}</template>
      </el-table-column>
      <el-table-column label="注册时间" width="170">
        <template #default="{ row }">{{ fmt(row.created_at) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="180" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="openDetail(row)">详情</el-button>
          <el-button size="small" type="primary" @click="openGrant(row)">开通会员</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-pagination class="pager" layout="total, prev, pager, next" :total="total"
      :page-size="size" :current-page="page" @current-change="onPage" />

    <!-- 用户详情 -->
    <el-dialog v-model="detailDialog" title="用户详情" width="560px">
      <div class="detail-head">
        <el-avatar :size="64" :src="detail.avatar || undefined">
          {{ (detail.nickname || '律').slice(0, 1) }}
        </el-avatar>
        <div class="detail-head-info">
          <div class="detail-head-name">{{ detail.nickname }}</div>
          <div class="detail-head-sub">ID {{ detail.id }}</div>
        </div>
      </div>
      <el-descriptions :column="2" border>
        <el-descriptions-item label="昵称">{{ detail.nickname }}</el-descriptions-item>
        <el-descriptions-item label="ID">{{ detail.id }}</el-descriptions-item>
        <el-descriptions-item label="手机号">{{ detail.phone || '-' }}</el-descriptions-item>
        <el-descriptions-item label="体质">{{ detail.element || '未测评' }}</el-descriptions-item>
        <el-descriptions-item label="会员">{{ detail.membership_name }}</el-descriptions-item>
        <el-descriptions-item label="来源">{{ srcText(detail.membership_source) }}</el-descriptions-item>
        <el-descriptions-item label="到期">{{ fmt(detail.membership_expire_at) }}</el-descriptions-item>
        <el-descriptions-item label="注册">{{ fmt(detail.created_at) }}</el-descriptions-item>
        <el-descriptions-item label="openid" :span="2">{{ detail.openid }}</el-descriptions-item>
        <el-descriptions-item v-if="detail.unionid" label="unionid" :span="2">{{ detail.unionid }}</el-descriptions-item>
      </el-descriptions>

      <div v-if="scoreList.length" class="detail-block">
        <div class="detail-title">五行测评分布</div>
        <el-tag v-for="s in scoreList" :key="s.k" class="score-tag">{{ s.k }} {{ s.v }}</el-tag>
      </div>

      <div class="detail-block">
        <div class="detail-title">订单（{{ (detail.orders || []).length }}）</div>
        <el-table v-if="detail.orders && detail.orders.length" :data="detail.orders" size="small" border>
          <el-table-column prop="order_no" label="订单号" min-width="160" />
          <el-table-column prop="plan_name" label="套餐" width="80" />
          <el-table-column label="金额" width="80">
            <template #default="{ row }">¥{{ row.amount }}</template>
          </el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="{ row }">{{ statusText(row.status) }}</template>
          </el-table-column>
        </el-table>
        <el-empty v-else description="暂无订单" :image-size="60" />
      </div>
      <template #footer>
        <el-button type="primary" @click="detailDialog = false">关闭</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="grantDialog" title="开通 / 赠送会员" width="440px">
      <el-form label-width="90px">
        <el-form-item label="用户">{{ current.nickname }}（ID {{ current.id }}）</el-form-item>
        <el-form-item label="当前会员">{{ current.membership_name }}</el-form-item>
        <el-form-item label="套餐">
          <el-select v-model="grantForm.plan_id" @change="onPlanChange">
            <el-option label="听闻（取消会员）" value="free" />
            <el-option v-for="p in payPlans" :key="p.id" :label="`${p.name}（${p.duration_days}天）`" :value="p.id" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="grantForm.plan_id !== 'free'" label="开通天数">
          <el-input-number v-model="grantForm.days" :min="1" />
          <span class="hint">默认按套餐时长，可自定义</span>
        </el-form-item>
      </el-form>
      <el-alert type="info" :closable="false" show-icon
        title="后台开通不走支付，记为赠送(gift)。若会员仍有效，将在剩余期上叠加。" />
      <template #footer>
        <el-button @click="grantDialog = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="onGrant">确认开通</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { Search } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { listUsers, grantMembership, listPlans, getUser } from '@/api';

const rows = ref<any[]>([]);
const total = ref(0);
const page = ref(1);
const size = ref(20);
const loading = ref(false);
const keyword = ref('');
const plans = ref<any[]>([]);

const detailDialog = ref(false);
const detail = ref<any>({});
const scoreList = computed(() =>
  Object.entries(detail.value.element_scores || {}).map(([k, v]) => ({ k, v }))
);

async function openDetail(row: any) {
  detail.value = await getUser(row.id);
  detailDialog.value = true;
}

function srcText(s?: string) {
  return { purchase: '购买', cdkey: '兑换', gift: '赠送', '': '免费' }[s || ''] || s;
}
function statusText(s: string) {
  return { pending: '待支付', paid: '已支付', refunding: '退款中', refunded: '已退款', failed: '失败', closed: '已关闭' }[s] || s;
}

const grantDialog = ref(false);
const submitting = ref(false);
const current = ref<any>({});
const grantForm = reactive({ plan_id: '', days: 30 });

const payPlans = computed(() => plans.value.filter((p) => p.id !== 'free'));

function fmt(s?: string) {
  return s ? new Date(s).toLocaleString('zh-CN') : '-';
}

async function load() {
  loading.value = true;
  try {
    const data = await listUsers({ page: page.value, size: size.value, keyword: keyword.value || undefined });
    rows.value = data.items;
    total.value = data.total;
  } finally {
    loading.value = false;
  }
}
function reload() { page.value = 1; load(); }
function onPage(p: number) { page.value = p; load(); }

function openGrant(row: any) {
  current.value = row;
  const first = payPlans.value[0];
  grantForm.plan_id = first?.id || 'month';
  grantForm.days = first?.duration_days || 30;
  grantDialog.value = true;
}

function onPlanChange(id: string) {
  const p = plans.value.find((x) => x.id === id);
  if (p) grantForm.days = p.duration_days;
}

async function onGrant() {
  submitting.value = true;
  try {
    const payload: any = { plan_id: grantForm.plan_id };
    if (grantForm.plan_id !== 'free') payload.days = grantForm.days;
    await grantMembership(current.value.id, payload);
    ElMessage.success('已开通');
    grantDialog.value = false;
    load();
  } finally {
    submitting.value = false;
  }
}

onMounted(async () => {
  plans.value = await listPlans();
  load();
});
</script>

<style scoped>
.toolbar { margin-bottom: 16px; display: flex; gap: 12px; }
.pager { margin-top: 16px; justify-content: flex-end; }
.src { margin-left: 4px; }
.hint { margin-left: 10px; color: #999; font-size: 12px; }
.detail-head { display: flex; align-items: center; gap: 14px; margin-bottom: 16px; }
.detail-head-name { font-size: 16px; font-weight: 600; }
.detail-head-sub { font-size: 12px; color: #999; margin-top: 2px; }
.detail-block { margin-top: 16px; }
.detail-title { font-size: 14px; font-weight: 500; margin-bottom: 10px; }
.score-tag { margin: 0 8px 8px 0; }
</style>
