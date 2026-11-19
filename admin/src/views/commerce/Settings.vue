<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { commerce } from '@/api/commerce';
import { useAuthStore } from '@/stores/auth';
import ImageField from '@/components/commerce/ImageField.vue';
import MarkdownEditor from '@/components/MarkdownEditor.vue';
import LogisticsSettings from '@/components/commerce/LogisticsSettings.vue';
import ConfigurationCheck from '@/components/commerce/ConfigurationCheck.vue';
import ChannelSettings from '@/components/commerce/ChannelSettings.vue';
const auth = useAuthStore();
const form = ref<any>({ provinces: [] }), loading = ref(true), saving = ref(false);
const migrated = ref(false);
const catalogSummary = ref<any>(null);
const diagnosticRevision = ref(0);
const tab = ref('display');
function channelsSaved() {
  diagnosticRevision.value++;
}
const provinces = ['北京市','天津市','河北省','山西省','内蒙古自治区','辽宁省','吉林省','黑龙江省','上海市','江苏省','浙江省','安徽省','福建省','江西省','山东省','河南省','湖北省','湖南省','广东省','广西壮族自治区','海南省','重庆市','四川省','贵州省','云南省','西藏自治区','陕西省','甘肃省','青海省','宁夏回族自治区','新疆维吾尔自治区'];
async function load() {
  loading.value = true;
  try {
    const status = await commerce.get('/status');
    migrated.value = status.migrated;
    if (!status.migrated) return;
    const [data, summary] = await Promise.all([commerce.get('/settings'), commerce.get('/catalog-summary')]);
    delete data.capabilities; form.value = data; catalogSummary.value = summary;
  }
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
  <BusinessPage title="课程商城配置" description="日常运营、配送售后与渠道参数分区维护。关闭售卖不影响已有权益、订单和售后。">
    <el-tabs v-model="tab" class="commerce-settings">
      <el-tab-pane label="展示与售卖" name="display">
        <div v-loading="loading">
          <el-alert v-if="!loading && !migrated" title="课程商城数据尚未初始化，运营配置暂未开放。渠道和物流参数可以先行配置。" type="info" :closable="false" />
          <BusinessForm v-if="migrated" :model="form" class="settings-panel" :disabled="loading || !auth.can('commerce:settings') || saving">
            <div class="commerce-settings__grid">
              <section class="commerce-settings__section">
                <h3>课程</h3>
                <p v-if="catalogSummary" class="commerce-settings__hint">已上架 {{ catalogSummary.courses.published }} / {{ catalogSummary.courses.total }} 门 · 已核验收费 {{ catalogSummary.courses.purchase_ready }} 门</p>
                <el-form-item label="课程入口"><el-switch v-model="form.courses_visible" active-text="展示" /></el-form-item>
                <el-form-item label="收费课程购买"><el-switch v-model="form.courses_sale" active-text="开放购买" /></el-form-item>
                <el-alert v-if="form.courses_visible && catalogSummary && !catalogSummary.courses.published" title="尚无上架课程，请先在「课程与商品」补齐内容并上架。" type="warning" :closable="false" />
                <el-form-item label="课程主推海报"><ImageField v-model="form.course_banner" /></el-form-item>
                <el-form-item label="海报跳转课程编号（选填）"><el-input-number :model-value="form.course_banner_course_id || undefined" :min="1" @update:model-value="form.course_banner_course_id = $event || null" /></el-form-item>
              </section>
              <section class="commerce-settings__section">
                <h3>商城</h3>
                <p v-if="catalogSummary" class="commerce-settings__hint">已上架 {{ catalogSummary.products.published }} / {{ catalogSummary.products.total }} 件 · 有库存 {{ catalogSummary.products.in_stock }} 件</p>
                <el-form-item label="商城入口"><el-switch v-model="form.shop_visible" active-text="展示" /></el-form-item>
                <el-form-item label="实物购买"><el-switch v-model="form.shop_sale" active-text="开放购买" /></el-form-item>
                <el-alert v-if="form.shop_visible && catalogSummary && !catalogSummary.products.published" title="尚无上架商品，请先在「课程与商品」补齐内容并上架。" type="warning" :closable="false" />
                <el-form-item label="商城主推海报"><ImageField v-model="form.shop_banner" /></el-form-item>
                <el-form-item label="海报跳转商品编号（选填）"><el-input-number :model-value="form.shop_banner_product_id || undefined" :min="1" @update:model-value="form.shop_banner_product_id = $event || null" /></el-form-item>
              </section>
            </div>
            <div v-if="auth.can('commerce:settings')" class="commerce-settings__actions"><el-button type="primary" :loading="saving" @click="save">保存运营配置</el-button></div>
          </BusinessForm>
        </div>
      </el-tab-pane>
      <el-tab-pane label="配送与售后" name="fulfillment" lazy>
        <el-alert v-if="!loading && !migrated" title="课程商城数据尚未初始化，配送与售后配置暂未开放。" type="info" :closable="false" />
        <BusinessForm v-if="migrated" v-loading="loading" :model="form" class="settings-panel" :disabled="loading || !auth.can('commerce:settings') || saving">
          <section class="commerce-settings__section">
            <h3>配送规则</h3>
            <el-form-item label="可配送省份"><el-select v-model="form.provinces" multiple filterable collapse-tags collapse-tags-tooltip :max-collapse-tags="4" placeholder="选择可配送省份"><el-option v-for="province in provinces" :key="province" :label="province" :value="province" /></el-select></el-form-item>
            <div class="commerce-settings__grid">
              <el-form-item label="每单固定运费（元）"><el-input-number :model-value="form.shipping_fen / 100" :min="0" :precision="2" @update:model-value="form.shipping_fen = Math.round(($event || 0) * 100)" /></el-form-item>
              <el-form-item label="包邮门槛（元，留空不设置）"><el-input-number :model-value="form.free_shipping_fen == null ? undefined : form.free_shipping_fen / 100" :min="0" :precision="2" @update:model-value="form.free_shipping_fen = $event == null ? null : Math.round($event * 100)" /></el-form-item>
            </div>
          </section>
          <section class="commerce-settings__section">
            <h3>客服与退货</h3>
            <el-form-item label="客服联系方式 / 服务时间"><el-input v-model="form.customer_service" /></el-form-item>
            <el-form-item label="退货地址与收件信息"><el-input v-model="form.return_address" type="textarea" :rows="3" /></el-form-item>
          </section>
          <section class="commerce-settings__section">
            <h3>购买与售后说明</h3>
            <el-form-item label="课程说明"><MarkdownEditor v-model="form.course_policy" style="width:100%" /></el-form-item>
            <el-form-item label="实物说明"><MarkdownEditor v-model="form.physical_policy" style="width:100%" /></el-form-item>
          </section>
          <div v-if="auth.can('commerce:settings')" class="commerce-settings__actions"><el-button type="primary" :loading="saving" @click="save">保存运营配置</el-button></div>
        </BusinessForm>
      </el-tab-pane>
      <el-tab-pane v-if="auth.can('commerce:settings')" label="支付与课件" name="channels" lazy>
        <ChannelSettings @saved="channelsSaved" />
      </el-tab-pane>
      <el-tab-pane v-if="auth.can('commerce:settings')" label="物流查询" name="logistics" lazy>
        <LogisticsSettings @saved="channelsSaved" />
      </el-tab-pane>
      <el-tab-pane v-if="auth.can('commerce:settings')" label="配置自检" name="diagnostics" lazy>
        <ConfigurationCheck :key="diagnosticRevision" />
      </el-tab-pane>
    </el-tabs>
  </BusinessPage>
</template>
<style scoped>
.commerce-settings :deep(.el-tabs__content) { padding-top: 12px; }
.commerce-settings__grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; }
.commerce-settings__section { min-width: 0; margin-bottom: 24px; }
.commerce-settings__section h3 { margin: 0 0 16px; font-size: 16px; font-weight: 600; }
.commerce-settings__section .el-alert { margin-bottom: 18px; }
.commerce-settings__hint { margin: -6px 0 20px; color: var(--el-text-color-secondary); line-height: 1.6; }
.commerce-settings__actions { padding-top: 18px; border-top: 1px solid var(--el-border-color-lighter); }
@media (max-width: 900px) {
  .commerce-settings__grid { grid-template-columns: minmax(0, 1fr); gap: 0; }
}
</style>
