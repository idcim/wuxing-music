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
      <el-table-column label="一级比例" width="120">
        <template #default="{ row }">
          <span v-if="row.rate === null || row.rate === undefined" class="muted">
            {{ pct(row.effectiveRate) }}（默认）
          </span>
          <span v-else>{{ pct(row.rate) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="上级加成" width="120">
        <template #default="{ row }">
          <span v-if="row.rate2 === null || row.rate2 === undefined" class="muted">
            {{ pct(row.effectiveRate2) }}（默认）
          </span>
          <span v-else>{{ pct(row.rate2) }}</span>
        </template>
      </el-table-column>
      <!-- 「直属 / 下级」说的是这个代理在组织里挂在谁下面，
           与分成明细里的 level 1/2 不是一回事，别标成「一级/二级」自找混淆 -->
      <el-table-column label="层级" width="150">
        <template #default="{ row }">
          <template v-if="row.parentName">
            <el-tag type="warning" effect="plain" size="small">下级代理</el-tag>
            <div class="muted sub">上级：{{ row.parentName }}</div>
          </template>
          <el-tag v-else type="info" effect="plain" size="small">直属代理</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="下属" width="120">
        <template #default="{ row }">
          <el-link type="primary" :underline="false" @click="openDownline(row)">
            {{ row.subAgentCount || 0 }} 代理 / {{ row.userCount || 0 }} 用户
          </el-link>
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
        <el-form-item label="一级比例">
          <el-input-number v-model="ratePct" :min="0" :max="100" :step="1" :precision="1" />
          <span class="unit">%</span>
          <el-checkbox v-model="useDefaultRate" style="margin-left: 12px">跟随默认</el-checkbox>
          <div class="tip">
            他作为<b>直推人</b>时按订单金额提的比例，<b>恒定拿满</b>，有没有上级都一样。
            勾「跟随默认」即随全局设置变动；填 0 表示不分成，两者不同。
            改比例<b>只影响之后的新订单</b>，历史按成交时点快照，不回溯。
          </div>
        </el-form-item>
        <el-form-item label="上级加成">
          <el-input-number v-model="rate2Pct" :min="0" :max="100" :step="1" :precision="1" />
          <span class="unit">%</span>
          <el-checkbox v-model="useDefaultRate2" style="margin-left: 12px">跟随默认</el-checkbox>
          <div class="tip">
            他作为<b>上级</b>时，其下级每成一单他额外拿<b>订单额</b>的这个比例——
            由<b>平台额外支出，不影响下级实拿</b>。勾「跟随默认」即随全局；
            填 0 表示不给加成，两者不同。
          </div>
        </el-form-item>
        <el-form-item label="上级代理">
          <template v-if="form.parentName">
            <el-tag type="warning" effect="plain">{{ form.parentName }}</el-tag>
            <div class="tip">上下级关系一旦确定<b>不可更改</b>，改指向等于把别人的下级抢走，历史分成也会讲不清。</div>
          </template>
          <template v-else>
            <el-select v-model="parentIdSel" clearable filterable placeholder="无上级（独立代理）" style="width: 240px">
              <el-option v-for="a in parentOptions" :key="a.id" :label="`${a.name}（${a.code}）`" :value="a.id" />
            </el-select>
            <div class="tip">
              通常不用手填——用「用户」页的「设为代理」创建时会按推广来源自动落定。
              此处仅用于补录，<b>选定后不可更改</b>。
            </div>
          </template>
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

    <!-- 下属 -->
    <el-drawer v-model="downlineDrawer" :title="`${downlineOf.name || ''} 的下属`" size="640px">
      <el-alert type="info" :closable="false" class="dl-note">
        <template #title>
          只显示<b>直接</b>下级。下级的下级与他无关——计酬封顶两级，第三层拿不到钱。
          下级的分成不受影响，他的加成是平台额外出的。
        </template>
      </el-alert>

      <div class="dl-title">下级代理（{{ downline.subAgentCount || 0 }}）</div>
      <el-table v-if="downline.subAgents && downline.subAgents.length" :data="downline.subAgents" size="small" border>
        <el-table-column prop="name" label="代理" min-width="120" />
        <el-table-column prop="code" label="推广码" width="100" />
        <el-table-column label="类型" width="90">
          <template #default="{ row }">{{ row.type === 'store' ? '实体店' : '网络推手' }}</template>
        </el-table-column>
        <el-table-column label="名下用户" width="90">
          <template #default="{ row }">{{ row.userCount }}</template>
        </el-table-column>
        <el-table-column label="为我带来" width="110">
          <template #default="{ row }"><b>¥{{ money(row.contributed) }}</b></template>
        </el-table-column>
      </el-table>
      <el-empty v-else description="暂无下级代理" :image-size="60" />

      <div class="dl-title">名下用户（{{ downline.userCount || 0 }}）</div>
      <el-table v-if="downline.users && downline.users.length" :data="downline.users" size="small" border max-height="320">
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column prop="nickname" label="昵称" min-width="120" />
        <el-table-column label="手机号" width="130">
          <template #default="{ row }">{{ row.phone || '-' }}</template>
        </el-table-column>
        <el-table-column prop="membershipName" label="会员" width="90" />
        <el-table-column label="绑定时间" width="160">
          <template #default="{ row }">{{ fmtTime(row.boundAt) }}</template>
        </el-table-column>
      </el-table>
      <el-empty v-else description="暂无名下用户" :image-size="60" />
    </el-drawer>
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
  parentName: '',
});

// 比例在界面上用百分数，存的是小数；「跟随默认」= commission_rate 为 null
const ratePct = ref(20);
const useDefaultRate = ref(true);
const rate2Pct = ref(5);
const useDefaultRate2 = ref(true);
// el-input-number 不接受 null，用 0 表示未关联
const userIdNum = ref(0);
// 上级只在为空时可选，选项里排除自己
const parentIdSel = ref<number | ''>('');
const parentOptions = computed(() => rows.value.filter((a) => a.id !== form.id && a.status === 'active'));

const downlineDrawer = ref(false);
const downlineOf = ref<any>({});
const downline = ref<any>({});

const money = (v: any) => Number(v || 0).toFixed(2);
const pct = (v: any) => `${(Number(v || 0) * 100).toFixed(1)}%`;
const fmtTime = (s: string) => (s ? s.replace('T', ' ').slice(0, 16) : '-');

async function openDownline(row: any) {
  downlineOf.value = row;
  downline.value = {};
  downlineDrawer.value = true;
  downline.value = await api.agentDownline(row.id);
}

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
    parentName: '',
  });
  useDefaultRate.value = true;
  ratePct.value = 20;
  useDefaultRate2.value = true;
  rate2Pct.value = 5;
  userIdNum.value = 0;
  parentIdSel.value = '';
  dialog.value = true;
}

function openEdit(row: any) {
  Object.assign(form, {
    id: row.id, name: row.name, type: row.type, phone: row.phone || '',
    real_name: row.realName || '', contact: row.contact || '', remark: row.remark || '',
    commission_rate: row.rate, status: row.status, user_id: row.userId,
    parentName: row.parentName || '',
  });
  useDefaultRate.value = row.rate === null || row.rate === undefined;
  ratePct.value = Number(((row.rate ?? row.effectiveRate ?? 0.2) * 100).toFixed(1));
  useDefaultRate2.value = row.rate2 === null || row.rate2 === undefined;
  rate2Pct.value = Number(((row.rate2 ?? row.effectiveRate2 ?? 0.05) * 100).toFixed(1));
  userIdNum.value = row.userId || 0;
  parentIdSel.value = '';
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
  commission_rate2: useDefaultRate2.value ? null : Number((rate2Pct.value / 100).toFixed(4)),
  status: form.status,
  user_id: userIdNum.value > 0 ? userIdNum.value : null,
  // 后端只在当前为空时接受它，已有上级一律忽略
  parent_id: parentIdSel.value || null,
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
.sub {
  margin-top: 2px;
  font-size: 12px;
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
.dl-note {
  margin-bottom: 16px;
}
.dl-title {
  font-size: 14px;
  font-weight: 500;
  margin: 18px 0 10px;
}
</style>
