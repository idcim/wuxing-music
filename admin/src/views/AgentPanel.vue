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
      <el-form-item label="默认分成比例">
        <el-input-number v-model="ratePct" :min="0" :max="100" :step="1" :precision="1" />
        <span class="unit">%</span>
        <div class="tip">单个代理可在「代理管理」里单独覆盖；不覆盖的就跟随这里。</div>
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
import { onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import * as api from '@/api';

const loading = ref(false);
const saving = ref(false);
const ratePct = ref(20);
const form = reactive({
  enabled: false,
  default_rate: 0.2,
  freeze_days: 7,
  min_withdraw: 10,
  payout_mode: 'manual',
});

async function load() {
  loading.value = true;
  try {
    const d = await api.getAgentSetting();
    form.enabled = !!d.enabled;
    form.default_rate = Number(d.default_rate ?? 0.2);
    form.freeze_days = Number(d.freeze_days ?? 7);
    form.min_withdraw = Number(d.min_withdraw ?? 10);
    form.payout_mode = d.payout_mode || 'manual';
    ratePct.value = Number((form.default_rate * 100).toFixed(1));
  } finally {
    loading.value = false;
  }
}

async function onSave() {
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
.warn {
  margin-top: 8px;
}
.list {
  margin: 6px 0 0;
  padding-left: 18px;
  line-height: 1.8;
}
</style>
