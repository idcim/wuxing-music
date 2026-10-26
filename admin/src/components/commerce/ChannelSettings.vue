<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { commerce } from '@/api/commerce';

interface ConfigField { name: string; label: string; group: string; type: string; secret: boolean; configured: boolean; inherited: boolean; value: string | boolean }
const emit = defineEmits<{ saved: [] }>();
const fields = ref<ConfigField[]>([]), status = ref<any>({});
const form = ref<Record<string, any>>({ revision: 0, clear_fields: [] });
const loading = ref(false), saving = ref(false), loaded = ref(false), error = ref('');
const expanded = ref(['实物支付与回调', '私有课程 OSS']);
const groups = computed(() => [...new Set(fields.value.map((field) => field.group))]);
function apply(data: any) {
  status.value = data;
  fields.value = data.fields;
  form.value = { revision: data.revision, clear_fields: [] };
  for (const field of fields.value) form.value[field.name] = field.value;
}
async function load() {
  loading.value = true; error.value = '';
  try { apply(await commerce.get('/channel/settings')); loaded.value = true; }
  catch { error.value = '渠道配置加载失败，请重新加载后再保存'; }
  finally { loading.value = false; }
}
async function save() {
  saving.value = true;
  try {
    apply(await commerce.post('/channel/settings', form.value));
    ElMessage.success('渠道配置已加密保存，API 与后台任务读取后立即生效');
    emit('saved');
  } finally { saving.value = false; }
}
onMounted(load);
</script>
<template>
  <section class="channel-settings">
    <div class="channel-settings__heading"><h3>支付、课件与发货配置</h3><el-button :loading="loading" :disabled="saving" @click="load">重新加载渠道配置</el-button></div>
    <p>现有音乐套餐的商户号、商户证书、APIv3 密钥和小程序身份继续复用设置中心的微信支付与小程序设置，已完成的支付验收继续保留。这里只补充课程商城所需参数。</p>
    <p>凭证加密保存，已设置的凭证不回显；留空保留原值。保存后 API 与 Worker 自动读取，无需修改本地文件或重启。保存渠道参数不会自动开放售卖。</p>
    <el-alert v-if="error || status.error" :title="error || status.error" type="error" :closable="false" />
    <BusinessForm v-loading="loading" :model="form" :disabled="!loaded || saving">
      <el-collapse v-model="expanded">
        <el-collapse-item v-for="group in groups" :key="group" :name="group" :title="group">
          <p v-if="group === '实物支付与回调'">API 地址可沿用现有音乐支付回调域名。公钥与公钥 ID 来自微信支付商户平台的微信支付平台公钥配置，商户证书私钥仍在原微信支付设置中维护。</p>
          <p v-if="group === '课程数字支付'">使用该小程序已开通的数字内容支付参数；音乐会员支付参数继续在原设置中维护。开通标记按已获准并完成验证的终端能力填写。</p>
          <p v-if="group === '私有课程 OSS'">只需填写独立的私有课程桶；Endpoint 和 AccessKey 留空即复用「设置中心 → 存储设置」的 OSS 账号。课程桶不能是公开音乐桶。若使用另一账号，可在这里单独填写 Endpoint 和一整对 AccessKey。上传时仍会核对桶 ACL 和对象版本。</p>
          <p v-if="group === '实物发货'">微信发货和收货同步复用已配置的小程序身份；快递100账号在下方单独维护。附加编码映射通常保留 {}，仅为未内置的公司填写，例如 {"CUSTOM":"shunfeng"}。</p>
          <el-form-item v-for="field in fields.filter((item) => item.group === group)" :key="field.name" :label="field.label">
            <el-switch v-if="field.type === 'boolean'" v-model="form[field.name]" />
            <div v-else class="channel-settings__input">
              <el-input v-model="form[field.name]" :type="field.type === 'textarea' ? 'textarea' : field.type === 'password' ? 'password' : 'text'" :rows="5" :show-password="field.type === 'password'" :autocomplete="field.secret ? 'new-password' : 'off'" :disabled="form.clear_fields.includes(field.name)" :placeholder="field.secret && field.configured ? '已设置；留空保留原值' : field.inherited ? '留空复用存储设置' : `填写${field.label}`" />
              <span v-if="field.inherited" class="channel-settings__hint">当前复用存储设置</span>
              <el-checkbox v-if="field.secret && field.configured" v-model="form.clear_fields" :value="field.name">清除此项已存凭证</el-checkbox>
            </div>
          </el-form-item>
        </el-collapse-item>
      </el-collapse>
      <p v-if="status.last_saved">最近保存：{{ status.last_saved.operator }} · {{ new Date(status.last_saved.time).toLocaleString() }}</p>
      <el-button type="primary" :loading="saving" :disabled="!loaded" @click="save">保存支付、课件与发货配置</el-button>
    </BusinessForm>
  </section>
</template>
<style scoped>
.channel-settings { margin: 20px 0 28px; }
.channel-settings__heading { display:flex; align-items:center; justify-content:space-between; gap:12px; }
.channel-settings__input { width:100%; }
.channel-settings__hint { color:var(--el-color-success); }
p { margin:12px 0; color:var(--el-text-color-secondary); line-height:1.7; }
</style>
