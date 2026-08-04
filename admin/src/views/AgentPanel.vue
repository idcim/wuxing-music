<template>
  <el-form :model="form" label-width="150px" style="max-width: 720px" v-loading="loading">
    <el-alert type="info" :closable="false" class="intro">
      <template #title>
        代理分成默认<b>整体关闭</b>：关闭时后台不显示相关菜单、小程序/H5 不显示代理中心，
        <b>并且不会产生任何分成记录</b>——不是记了不显示。
        所以先谈好规则再开，开启前的成交不会补记。
      </template>
    </el-alert>

    <el-form-item label="启用代理分成">
      <el-switch v-model="form.enabled" />
      <span class="tip-inline">{{ form.enabled ? '已开启' : '已关闭（默认）' }}</span>
    </el-form-item>

    <template v-if="form.enabled">
      <el-form-item label="一级分成比例">
        <el-input-number v-model="ratePct" :min="0" :max="100" :step="1" :precision="1" />
        <span class="unit">%</span>
        <div class="tip">
          按<b>订单金额</b>计算，代理<b>恒定拿满这个比例</b>，与他有没有上级无关。
          单个代理可在「代理管理」里单独覆盖；不覆盖的就跟随这里。
        </div>
      </el-form-item>

      <el-form-item label="上级加成比例">
        <el-input-number v-model="bonusPct" :min="0" :max="100" :step="1" :precision="1" />
        <span class="unit">%</span>
        <div class="tip">
          下级每成一单，其上级额外拿<b>订单金额</b>的这个比例——由<b>平台额外支出</b>，
          <b>不从下级那份里扣</b>，下级实拿一分不少。
          同样可对单个代理覆盖（配在上级身上：「我发展的下级，每单我多拿多少」）。
        </div>
        <div class="calc" :class="{ 'calc--over': over100 }">
          按当前设置，一笔 ¥100 的订单：
          <div class="calc__line">直推分成 ＝ 100 × {{ ratePct }}% ＝ <b>¥{{ direct100 }}</b>（直推代理实拿）</div>
          <div class="calc__line">上级加成 ＝ 100 × {{ bonusPct }}% ＝ <b>¥{{ bonus100 }}</b>（平台额外支出）</div>
          <div class="calc__line calc__line--sum">
            <template v-if="over100">
              ⚠️ 两项合计 {{ ratePct + bonusPct }}% <b>已超过订单金额</b>，平台每单倒贴，无法保存。
            </template>
            <template v-else>
              平台总支出 <b>¥{{ total100 }}</b>；该代理若<b>没有上级</b>，则这一单只支出 ¥{{ direct100 }}。
            </template>
          </div>
        </div>
        <div class="tip">
          只有两级：上级只拿<b>直接下级</b>的加成。琴行 → 小李 → 小王 时，
          小王的客户成交只付小王与小李，<b>琴行一分没有</b>。
        </div>
      </el-form-item>

      <el-form-item label="分成冻结天数">
        <el-input-number v-model="form.freeze_days" :min="0" :max="365" />
        <span class="unit">天</span>
        <div class="tip">
          成交后先冻结这么多天才可提现。<b>这道设置就是用来挡退款的</b>：
          若钱已提走、订单事后才退款，系统追不回来，只能人工向代理追讨。
          建议设得比你的退款窗口长。
        </div>
      </el-form-item>

      <el-form-item label="最低提现金额">
        <el-input-number v-model="form.min_withdraw" :min="0" :precision="2" :step="10" />
        <span class="unit">元</span>
      </el-form-item>

      <el-form-item label="打款方式">
        <el-radio-group v-model="form.payout_mode">
          <el-radio label="manual">线下转账（推荐）</el-radio>
          <el-radio label="wxpay">微信自动转账</el-radio>
        </el-radio-group>
        <div class="tip" v-if="form.payout_mode === 'manual'">
          审核通过后系统不打款，你自行转账再回后台点「标记已打款」。无需任何商户配置，现在就能用。
        </div>
        <el-alert v-else type="warning" :closable="false" class="warn">
          <template #title>
            切到微信自动转账前，以下几条<b>必须先办妥</b>，任何一条缺失都会打款失败：
            <ul class="list">
              <li>商户号需<b>单独开通「商家转账」产品权限</b>（有商户号不等于有这个权限）</li>
              <li>代理需在「代理管理」里<b>关联用户 ID</b>，且该用户用微信登录过（要拿 openid）</li>
              <li>新版商家转账<b>需要代理在微信里点确认收款</b>，不是静默到账；超时未确认资金退回</li>
              <li>大额转账要求传收款人真实姓名加密串，本系统<b>暂未实现</b>，大额请走线下转账</li>
              <li>本项目商户号<b>尚未上线联调</b>，该通路目前未经真实验证</li>
            </ul>
            打款失败时金额会自动退回代理的可提现余额，可改走线下转账。
          </template>
        </el-alert>
      </el-form-item>
    </template>

    <el-form-item>
      <el-button type="primary" :loading="saving" @click="onSave">保存</el-button>
    </el-form-item>
  </el-form>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import * as api from '@/api';

const loading = ref(false);
const saving = ref(false);
const ratePct = ref(20);
const bonusPct = ref(5);
const form = reactive({
  enabled: false,
  default_rate: 0.2,
  default_bonus_rate: 0.05,
  freeze_days: 7,
  min_withdraw: 10,
  payout_mode: 'manual',
});

// 用一笔 ¥100 的单子说明「加成是平台额外掏的」——这个字段最容易被误解成
// 「从下级那份里扣」（v1.5 的旧规则正是如此，别让看惯旧版的人按老经验配）。
// 两条各按订单额独立算，与后端 record_commission 口径一致。
const direct100 = computed(() => (100 * ratePct.value / 100).toFixed(2));
const bonus100 = computed(() => (100 * bonusPct.value / 100).toFixed(2));
const total100 = computed(() => (Number(direct100.value) + Number(bonus100.value)).toFixed(2));
// 加法模型下两个比例是真的相加，配过头平台每单倒贴。后端 AgentSettingIn 也会拒。
const over100 = computed(() => ratePct.value + bonusPct.value > 100);

async function load() {
  loading.value = true;
  try {
    const d = await api.getAgentSetting();
    form.enabled = !!d.enabled;
    form.default_rate = Number(d.default_rate ?? 0.2);
    // 只认新键：存量库里可能还留着旧的 default_rate2（语义相反），读到就会配错
    form.default_bonus_rate = Number(d.default_bonus_rate ?? 0.05);
    form.freeze_days = Number(d.freeze_days ?? 7);
    form.min_withdraw = Number(d.min_withdraw ?? 10);
    form.payout_mode = d.payout_mode || 'manual';
    ratePct.value = Number((form.default_rate * 100).toFixed(1));
    bonusPct.value = Number((form.default_bonus_rate * 100).toFixed(1));
  } finally {
    loading.value = false;
  }
}

async function onSave() {
  if (over100.value) {
    ElMessage.error('一级分成比例 + 上级加成比例不能超过 100%');
    return;
  }
  if (form.payout_mode === 'wxpay') {
    await ElMessageBox.confirm(
      '微信自动转账会在审核通过时真实出款，且本项目商户号尚未上线联调。确定切换？',
      '确认打款方式',
      { type: 'warning' }
    );
  }
  saving.value = true;
  try {
    await api.updateAgentSetting({
      ...form,
      default_rate: Number((ratePct.value / 100).toFixed(4)),
      default_bonus_rate: Number((bonusPct.value / 100).toFixed(4)),
    });
    // 开关变了要让菜单跟着变——features 是登录时随 /me 下发的
    ElMessage.success('已保存，菜单将在刷新后生效');
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.intro {
  margin-bottom: 18px;
}
.tip {
  font-size: 12px;
  color: #909399;
  line-height: 1.7;
  margin-top: 4px;
}
.tip-inline {
  margin-left: 12px;
  font-size: 13px;
  color: #909399;
}
.unit {
  margin-left: 8px;
  color: #909399;
}
.calc {
  margin-top: 10px;
  padding: 12px 14px;
  background: #f5f7fa;
  border-radius: 6px;
  font-size: 13px;
  color: #606266;
  line-height: 1.9;
}
.calc__line {
  font-family: Consolas, Menlo, monospace;
}
.calc__line--sum {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px dashed #dcdfe6;
  font-family: inherit;
  color: #909399;
}
.calc--over {
  background: #fef0f0;
  color: #f56c6c;
}
.calc--over .calc__line--sum {
  color: #f56c6c;
  border-top-color: #fbc4c4;
}
.warn {
  margin-top: 8px;
}
.list {
  margin: 6px 0 0;
  padding-left: 18px;
  line-height: 1.8;
}
</style>
