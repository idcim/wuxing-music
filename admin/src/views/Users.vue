<template>
  <div>
    <div class="toolbar">
      <el-input v-model="keyword" placeholder="按昵称搜索" clearable style="width: 200px" @keyup.enter="reload" />
      <el-button :icon="Search" @click="reload">搜索</el-button>
    </div>
    <el-table :data="rows" v-loading="loading" border>
      <el-table-column prop="id" label="ID" width="70" />
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
      <el-table-column label="操作" width="120" fixed="right">
        <template #default="{ row }">
          <el-button size="small" type="primary" @click="openGrant(row)">开通会员</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-pagination class="pager" layout="total, prev, pager, next" :total="total"
      :page-size="size" :current-page="page" @current-change="onPage" />

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
import { listUsers, grantMembership, listPlans } from '@/api';

const rows = ref<any[]>([]);
const total = ref(0);
const page = ref(1);
const size = ref(20);
const loading = ref(false);
const keyword = ref('');
const plans = ref<any[]>([]);

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
</style>
