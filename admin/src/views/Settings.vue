<template>
  <div>
    <el-card style="max-width: 680px">
      <template #header>微信支付参数</template>
      <el-form :model="form" label-width="130px" v-loading="loading">
        <el-divider content-position="left">商户（两端共用）</el-divider>
        <el-form-item label="启用支付">
          <el-switch v-model="form.enabled" />
          <div class="hint">总开关。关闭后小程序与 H5 都无法下单。</div>
        </el-form-item>
        <el-form-item label="商户号">
          <el-input v-model="form.wx_mch_id" placeholder="微信支付商户号" />
        </el-form-item>
        <el-form-item label="API 密钥">
          <el-input v-model="form.wx_api_key" type="password" show-password
            :placeholder="set.wx_api_key ? '已设置（留空则不修改）' : '请输入 APIv3 密钥'" />
        </el-form-item>
        <el-form-item label="回调地址">
          <el-input v-model="form.notify_url" placeholder="https://your-domain/api/mp/pay/callback" />
        </el-form-item>

        <el-divider content-position="left">小程序支付</el-divider>
        <el-form-item label="小程序 AppID">
          <el-input v-model="form.wx_app_id" placeholder="wx 开头的小程序 AppID" />
        </el-form-item>

        <el-divider content-position="left">H5 支付（微信内 · 公众号 JSAPI）</el-divider>
        <el-alert type="info" :closable="false" show-icon style="margin-bottom: 16px"
          title="H5 端用公众号 AppID + 用户的公众号 openid 发起 JSAPI 支付，与小程序共用同一个商户号。两个 AppID 都要在商户平台「APPID 授权管理」里与该商户号绑定，否则统一下单会报 appid 与 mchid 不匹配。微信外的浏览器（Safari/Chrome）暂不支持支付。" />
        <el-form-item label="启用 H5 支付">
          <el-switch v-model="form.h5_enabled" />
          <div class="hint">单独关停 H5 售卖用；关闭后 H5 下单直接返回「H5 支付未开启」，不影响小程序。</div>
        </el-form-item>
        <el-form-item label="H5 支付 AppID">
          <el-input v-model="form.h5_app_id" :placeholder="oaAppIdHint" />
          <div class="hint">留空则自动使用「设置中心 → 公众号」里配的 AppID，一般无需另填。</div>
        </el-form-item>

        <el-divider content-position="left">API 证书</el-divider>
        <el-form-item label="证书序列号">
          <el-input v-model="form.wx_cert_serial" placeholder="apiclient_cert 的序列号" />
        </el-form-item>
        <el-form-item label="证书 PEM">
          <el-input v-model="form.wx_cert_pem" type="textarea" :rows="5"
            :placeholder="set.wx_cert_pem ? '已设置（留空则不修改）' : '粘贴 apiclient_cert.pem 全文'" />
        </el-form-item>
        <el-form-item label="私钥 PEM">
          <el-input v-model="form.wx_key_pem" type="textarea" :rows="5"
            :placeholder="set.wx_key_pem ? '已设置（留空则不修改）' : '粘贴 apiclient_key.pem 全文'" />
        </el-form-item>

        <el-form-item>
          <el-button type="primary" :loading="saving" @click="onSave">保存</el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { getPaySetting, updatePaySetting, getOaSetting } from '@/api';

const loading = ref(false);
const saving = ref(false);
// 各敏感字段是否已配置（后端返回 {field}_set）
const set = reactive({ wx_api_key: false, wx_cert_pem: false, wx_key_pem: false });
const oaAppId = ref('');
const form = reactive({
  enabled: false, wx_app_id: '', wx_mch_id: '', wx_api_key: '', notify_url: '',
  h5_enabled: true, h5_app_id: '',
  wx_cert_serial: '', wx_cert_pem: '', wx_key_pem: ''
});

// 把公众号那边配的 AppID 显示在 placeholder 里，省得为了确认"到底用哪个 appid"来回切 tab
const oaAppIdHint = computed(() =>
  oaAppId.value ? `留空则用公众号配置：${oaAppId.value}` : '留空则用「公众号」tab 里的 AppID'
);

async function load() {
  loading.value = true;
  try {
    const data = await getPaySetting();
    form.enabled = data.enabled ?? false;
    form.wx_app_id = data.wx_app_id ?? '';
    form.wx_mch_id = data.wx_mch_id ?? '';
    form.notify_url = data.notify_url ?? '';
    // 存量配置里没有这个键，缺省视为开启（与后端 _resolve_pay_payer 的默认一致）
    form.h5_enabled = data.h5_enabled ?? true;
    form.h5_app_id = data.h5_app_id ?? '';
    form.wx_cert_serial = data.wx_cert_serial ?? '';
    set.wx_api_key = data.wx_api_key_set ?? false;
    set.wx_cert_pem = data.wx_cert_pem_set ?? false;
    set.wx_key_pem = data.wx_key_pem_set ?? false;
    form.wx_api_key = '';
    form.wx_cert_pem = '';
    form.wx_key_pem = '';
  } finally {
    loading.value = false;
  }
  // 公众号 AppID 只用于提示，拉不到就算了，不该挡住支付设置本身
  try {
    oaAppId.value = (await getOaSetting())?.app_id ?? '';
  } catch {
    oaAppId.value = '';
  }
}

async function onSave() {
  saving.value = true;
  try {
    await updatePaySetting({ ...form });
    ElMessage.success('已保存');
    load();
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.hint { margin-top: 4px; color: #999; font-size: 12px; line-height: 1.6; }
</style>
