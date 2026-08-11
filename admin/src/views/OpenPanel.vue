<template>
  <el-card style="max-width: 680px" v-loading="loading">
    <template #header>微信开放平台</template>
    <el-alert type="info" :closable="false" show-icon style="margin-bottom: 16px"
      title="这里填的是开放平台下「网站应用」的 AppID / AppSecret，用于微信外浏览器（Safari / Chrome）的扫码登录。"
      description="不是开放平台账号本身的凭据——账号没有 AppID，只有它下面的应用才有。将来做 App 时的「移动应用」是另一套 AppID，届时再单独加字段。注意：网站应用需单独创建并通过审核，还要在该应用里配置「授权回调域」（只填域名，不带 https:// 和路径）。" />
    <el-alert type="warning" :closable="false" show-icon style="margin-bottom: 16px"
      title="unionid 不依赖这份配置。"
      description="跨端认成同一个人靠的是 unionid，那是把小程序与公众号绑到开放平台之后微信自动下发的，与这里填不填无关。所以就算不做扫码登录，绑定该做还是要做。绑定步骤与验收清单见 docs/OPEN-PLATFORM.md。" />
    <el-alert v-if="!bothBound" type="info" :closable="false" show-icon style="margin-bottom: 16px"
      title="务必先上线账号合并逻辑（v1.9.0）再去绑定：绑定后微信才开始下发 unionid，若合并逻辑没上线，同一个人在两端的两条账号会被认到其中一条上，另一条（很可能是买过会员的小程序那条）就此搁浅。" />
    <el-form :model="form" label-width="130px">
      <el-form-item label="网站应用 AppID">
        <el-input v-model="form.app_id" placeholder="开放平台「网站应用」的 AppID" />
        <div class="hint">
          填了才有扫码登录；留空时浏览器端的「微信扫码登录」按钮不显示。
          还需在开放平台「网站应用 → 开发信息 → 授权回调域」填 <b>H5 站点域名</b>
          （就是公众号那边配的「网页授权域名」，不是本后台的域名），只填域名、不带 https:// 与路径；
          两边不一致扫码后会报 redirect_uri 参数错误。
        </div>
      </el-form-item>
      <el-form-item label="网站应用 AppSecret">
        <el-input v-model="form.app_secret" type="password" show-password
          :placeholder="secretSet ? '已设置（留空则不修改）' : '网站应用密钥'" />
      </el-form-item>
      <el-form-item label="认证主体">
        <el-input v-model="form.principal" placeholder="与小程序、公众号必须为同一主体" />
      </el-form-item>
      <el-form-item label="已绑定小程序">
        <el-switch v-model="form.bound_weapp" />
      </el-form-item>
      <el-form-item label="已绑定公众号">
        <el-switch v-model="form.bound_oa" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" :loading="saving" @click="onSave">保存</el-button>
      </el-form-item>
    </el-form>
  </el-card>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { getOpenSetting, updateOpenSetting } from '@/api';

const loading = ref(false);
const saving = ref(false);
const secretSet = ref(false);
const form = reactive({
  app_id: '', app_secret: '', principal: '', bound_weapp: false, bound_oa: false
});

const bothBound = computed(() => form.bound_weapp && form.bound_oa);

async function load() {
  loading.value = true;
  try {
    const d = await getOpenSetting();
    form.app_id = d.app_id ?? '';
    form.principal = d.principal ?? '';
    form.bound_weapp = d.bound_weapp ?? false;
    form.bound_oa = d.bound_oa ?? false;
    secretSet.value = d.app_secret_set ?? false;
    form.app_secret = '';
  } finally {
    loading.value = false;
  }
}

async function onSave() {
  saving.value = true;
  try {
    await updateOpenSetting({ ...form });
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
