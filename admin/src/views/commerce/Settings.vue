<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { commerce } from '@/api/commerce';
import { useAuthStore } from '@/stores/auth';
import ImageField from '@/components/commerce/ImageField.vue';
import MarkdownEditor from '@/components/MarkdownEditor.vue';
const auth = useAuthStore();
const form = ref<any>({ provinces: [] }), caps = ref<Record<string, boolean>>({}), loading = ref(true), saving = ref(false);
const provinces = ['北京市','天津市','河北省','山西省','内蒙古自治区','辽宁省','吉林省','黑龙江省','上海市','江苏省','浙江省','安徽省','福建省','江西省','山东省','河南省','湖北省','湖南省','广东省','广西壮族自治区','海南省','重庆市','四川省','贵州省','云南省','西藏自治区','陕西省','甘肃省','青海省','宁夏回族自治区','新疆维吾尔自治区'];
async function load() {
  loading.value = true;
  try { const data = await commerce.get('/settings'); caps.value = data.capabilities; delete data.capabilities; form.value = data; }
  finally { loading.value = false; }
}
async function save() {
  saving.value = true;
  try { await commerce.post('/settings', form.value); ElMessage.success('运营配置已保存'); }
  finally { saving.value = false; }
}
onMounted(load);
</script>
<template>
  <BusinessPage title="课程商城运营配置" description="展示与售卖分别控制；关闭售卖不影响已购课程、已支付订单和售后处理。">
    <BusinessForm v-loading="loading" :model="form" class="settings-panel" :disabled="!auth.can('commerce:settings')">
      <el-alert title="支付、私有存储和快递100密钥只在服务端部署环境配置，不在运营表单中填写。未完成能力验收不能开启售卖。" :closable="false" style="margin-bottom:20px" />
      <el-descriptions :column="2" border style="margin-bottom:24px"><el-descriptions-item v-for="(label, key) in { physical_payment:'实物支付', course_payment:'数字课程支付', course_ios:'iOS 数字支付', private_media:'私有课程存储', shipping:'微信发货与收货同步', logistics:'快递100轨迹查询' }" :key="key" :label="label"><el-tag :type="caps[key] ? 'success' : 'info'">{{ caps[key] ? '已配置（仍需真实联调）' : '未配置 / 未验收' }}</el-tag></el-descriptions-item></el-descriptions>
      <el-alert title="物流轨迹在订单内展示，无需添加微信物流插件。由服务端配置快递100 CUSTOMER/KEY；同一运单至少间隔 30 分钟查询。" type="info" :closable="false" style="margin-bottom:20px" />
      <el-form-item label="展示课程入口"><el-switch v-model="form.courses_visible" /></el-form-item>
      <el-form-item label="开放收费课程购买"><el-switch v-model="form.courses_sale" /></el-form-item>
      <el-form-item label="展示商城入口"><el-switch v-model="form.shop_visible" /></el-form-item>
      <el-form-item label="开放实物购买"><el-switch v-model="form.shop_sale" /></el-form-item>
      <el-form-item label="课程主推海报"><ImageField v-model="form.course_banner" /></el-form-item>
      <el-form-item label="海报跳转课程编号（可留空）"><el-input-number :model-value="form.course_banner_course_id || undefined" :min="1" @update:model-value="form.course_banner_course_id = $event || null" /></el-form-item>
      <el-form-item label="商城主推海报"><ImageField v-model="form.shop_banner" /></el-form-item>
      <el-form-item label="海报跳转商品编号（可留空）"><el-input-number :model-value="form.shop_banner_product_id || undefined" :min="1" @update:model-value="form.shop_banner_product_id = $event || null" /></el-form-item>
      <el-form-item label="可配送省份"><el-select v-model="form.provinces" multiple filterable><el-option v-for="province in provinces" :key="province" :label="province" :value="province" /></el-select></el-form-item>
      <el-form-item label="每单固定运费（元）"><el-input-number :model-value="form.shipping_fen / 100" :min="0" :precision="2" @update:model-value="form.shipping_fen = Math.round(($event || 0) * 100)" /></el-form-item>
      <el-form-item label="满额包邮门槛（元，留空不设置）"><el-input-number :model-value="form.free_shipping_fen == null ? undefined : form.free_shipping_fen / 100" :min="0" :precision="2" @update:model-value="form.free_shipping_fen = $event == null ? null : Math.round($event * 100)" /></el-form-item>
      <el-form-item label="客服联系方式 / 服务时间"><el-input v-model="form.customer_service" /></el-form-item>
      <el-form-item label="退货地址与收件信息"><el-input v-model="form.return_address" type="textarea" /></el-form-item>
      <el-form-item label="课程购买与售后说明"><MarkdownEditor v-model="form.course_policy" style="width:100%" /></el-form-item>
      <el-form-item label="实物购买与售后说明"><MarkdownEditor v-model="form.physical_policy" style="width:100%" /></el-form-item>
      <el-button v-if="auth.can('commerce:settings')" type="primary" :loading="saving" @click="save">保存运营配置</el-button>
    </BusinessForm>
  </BusinessPage>
</template>
