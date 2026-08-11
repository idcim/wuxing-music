<template>
  <el-card style="max-width: 680px" v-loading="loading">
    <template #header>微信开放平台</template>
    <el-alert type="warning" :closable="false" show-icon style="margin-bottom: 16px"
      title="这里填的 AppID / AppSecret 目前不参与任何登录逻辑。"
      description="跨端认成同一个人靠的是 unionid，而 unionid 是把小程序与公众号绑到开放平台之后，微信自己在 jscode2session / 网页授权接口里下发的，用不到这份密钥。本页有两个用途：把绑定状态记进系统，以及将来做 App 端微信登录时移动应用的密钥落在这儿。绑定步骤见 docs/OPEN-PLATFORM.md。" />
    <el-alert v-if="!bothBound" type="info" :closable="false" show-icon style="margin-bottom: 16px"
      title="务必先上线账号合并逻辑（v1.9.0）再去绑定：绑定后微信才开始下发 unionid，若合并逻辑没上线，同一个人在两端的两条账号会被认到其中一条上，另一条（很可能是买过会员的小程序那条）就此搁浅。" />
    <el-form :model="form" label-width="130px">
      <el-form-item label="AppID">
        <el-input v-model="form.app_id" placeholder="开放平台移动应用/网站应用 AppID" />
      </el-form-item>
      <el-form-item label="AppSecret">
        <el-input v-model="form.app_secret" type="password" show-password
          :placeholder="secretSet ? '已设置（留空则不修改）' : '开放平台应用密钥'" />
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
