<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { commerce } from '@/api/commerce';

const emit = defineEmits<{ saved: [boolean] }>();
const form = ref({ enabled: true, customer: '', key: '', revision: 0 });
const status = ref<any>({}), loading = ref(false), saving = ref(false), loaded = ref(false), error = ref('');
function apply(data: any) {
  status.value = data;
  form.value = { enabled: data.enabled, customer: '', key: '', revision: data.revision };
}
async function load() {
  loading.value = true; error.value = '';
  try { apply(await commerce.get('/logistics/settings')); loaded.value = true; }
  catch (e: any) { error.value = e.message || '物流账号加载失败'; }
  finally { loading.value = false; }
}
async function save() {
  saving.value = true;
  try {
    const data = await commerce.post('/logistics/settings', form.value);
    apply(data); emit('saved', data.configured);
    ElMessage.success(data.configured ? '快递100账号已保存，物流查询已开启' : '物流配置已保存，查询已关闭');
  } finally { saving.value = false; }
}
onMounted(load);
</script>
<template>
  <div class="logistics-settings">
    <h3>快递100物流查询</h3>
    <p>填写 <a href="https://api.kuaidi100.com/" target="_blank" rel="noopener noreferrer">快递100开放平台</a> 的 Customer 和 Key，开启订单物流轨迹查询。</p>
    <el-alert v-if="error || status.error" :title="error || status.error" type="error" :closable="false" />
    <BusinessForm v-loading="loading" :model="form" :disabled="saving || !loaded">
      <el-form-item label="物流查询"><el-switch v-model="form.enabled" /><el-tag :type="status.configured ? 'success' : 'info'" style="margin-left:12px">{{ status.configured ? '已配置' : '未开启 / 未配置' }}</el-tag></el-form-item>
      <el-form-item label="Customer 授权码"><el-input v-model="form.customer" autocomplete="off" :maxlength="256" :placeholder="status.customer_set ? '已设置；留空保留原值' : '粘贴快递100提供的 Customer'" /></el-form-item>
      <el-form-item label="Key 密钥"><el-input v-model="form.key" type="password" show-password autocomplete="new-password" :maxlength="256" :placeholder="status.key_set ? '已设置；留空保留原密钥' : '粘贴快递100提供的 Key'" /></el-form-item>
      <p>已保存的授权码与密钥不会回显。更换快递100账号时，请同时填写两项。</p>
      <p v-if="status.last_saved">最近保存：{{ status.last_saved.operator }} · {{ new Date(status.last_saved.time).toLocaleString() }}</p>
      <el-button type="primary" :loading="saving" :disabled="!loaded" @click="save">保存物流账号</el-button>
    </BusinessForm>
    <el-button v-if="error" @click="load">重新加载物流配置</el-button>
    <p class="logistics-settings__footnote">同一运单至少间隔 30 分钟向服务商查询。</p>
  </div>
</template>
<style scoped>
.logistics-settings { max-width:960px; }
h3 { margin:0; font-size:16px; font-weight:600; }
p { margin:8px 0 20px; line-height:1.7; color:var(--el-text-color-secondary); }
.logistics-settings__footnote { margin-top:16px; font-size:12px; }
</style>
