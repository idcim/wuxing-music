<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { commerce, stateLabel, yuan } from '@/api/commerce';
import { useAuthStore } from '@/stores/auth';
import ImageField from '@/components/commerce/ImageField.vue';
import MarkdownEditor from '@/components/MarkdownEditor.vue';
import { resources, type Field } from './catalog-fields';
const auth = useAuthStore();
const tab = ref('courses'), rows = ref<any[]>([]), page = ref(1), total = ref(0), loading = ref(false);
const definition = computed(() => resources[tab.value]!);
const dialog = ref(false), saving = ref(false), currentId = ref(0), form = ref<Record<string, any>>({});
const options = ref<Record<string, any[]>>({});
const stockDialog = ref(false), stockRow = ref<any>({}), stockDelta = ref(0), stockReason = ref('');
const priceDialog = ref(false), priceRow = ref<any>({}), verifiedYuan = ref(0), evidence = ref('');
async function load() {
  loading.value = true;
  try { const data = await commerce.get(`/catalog/${tab.value}?page=${page.value}`); rows.value = data.items; total.value = data.total; }
  finally { loading.value = false; }
}
async function loadOptions() {
  const names = ['categories', 'teachers', 'courses', 'products'];
  const all = await Promise.all(names.map(name => commerce.get(`/catalog/${name}?size=100`)));
  names.forEach((name, index) => options.value[name] = all[index].items);
  options.value.media = await commerce.get('/media');
}
function choices(field: Field) {
  if (field.options) return field.options;
  let values = options.value[field.source || ''] || [];
  if (field.source === 'categories') values = values.filter(v => v.kind === (tab.value === 'products' ? 'physical' : 'course'));
  if (field.source === 'media') values = values.filter(v => v.state === 'ready');
  return values.map(v => ({ label: `${v.title || v.name}（#${v.id}）`, value: v.id }));
}
async function edit(row?: any) {
  await loadOptions();
  currentId.value = row?.id || 0;
  form.value = structuredClone(definition.value.initial);
  if (row) for (const field of definition.value.fields) form.value[field.key] = row[field.key];
  dialog.value = true;
}
async function save() {
  saving.value = true;
  try { await commerce.post(`/catalog/${tab.value}/${currentId.value}`, form.value); dialog.value = false; ElMessage.success('已保存'); await load(); }
  finally { saving.value = false; }
}
async function adjustStock() {
  await commerce.post(`/skus/${stockRow.value.id}/stock`, { delta: stockDelta.value, reason: stockReason.value });
  stockDialog.value = false; await load();
}
async function verifyPrice() {
  await commerce.post(`/courses/${priceRow.value.id}/verify-price`, { price_fen: Math.round(verifiedYuan.value * 100), revision: priceRow.value.revision, evidence: evidence.value });
  priceDialog.value = false; await load();
}
watch(tab, () => { page.value = 1; load(); });
onMounted(load);
</script>
<template>
  <BusinessPage title="课程与商品管理" description="课程与音乐会员独立；新内容先保存草稿，资料和媒体就绪后再上架。">
    <el-tabs v-model="tab"><el-tab-pane v-for="(entry, key) in resources" :key="key" :label="entry.label" :name="key" /></el-tabs>
    <div class="toolbar"><el-button v-if="auth.can(tab === 'skus' ? 'commerce:inventory' : 'commerce:content')" type="primary" @click="edit()">新增{{ definition.label }}</el-button><el-button @click="load">刷新</el-button></div>
    <el-alert v-if="tab === 'lessons'" title="编辑章节前请先下架课程；课件在「课件与任务」上传，处理完成后可在这里选用。" :closable="false" style="margin-bottom:16px" />
    <BusinessTable :data="rows" v-loading="loading">
      <el-table-column prop="id" label="编号" width="80" />
      <el-table-column label="名称" min-width="180"><template #default="{ row }">{{ row.title || row.name }}</template></el-table-column>
      <el-table-column v-if="['courses','skus'].includes(tab)" label="售价" width="110"><template #default="{ row }">{{ yuan(row.price_fen) }}</template></el-table-column>
      <el-table-column v-if="tab === 'skus'" label="库存 / 预占" width="140"><template #default="{ row }">{{ row.stock }} / {{ row.reserved }}</template></el-table-column>
      <el-table-column v-if="['courses','products'].includes(tab)" label="状态" width="110"><template #default="{ row }"><el-tag>{{ stateLabel(row.status) }}</el-tag></template></el-table-column>
      <el-table-column v-if="tab === 'courses'" label="支付价格核验" min-width="140"><template #default="{ row }">{{ row.price_fen === 0 ? '免费课程' : row.payment_synced_revision === row.revision ? '已核验' : '待核验' }}</template></el-table-column>
      <el-table-column label="操作" width="250" fixed="right"><template #default="{ row }">
        <el-button v-if="auth.can(tab === 'skus' ? 'commerce:inventory' : 'commerce:content')" size="small" @click="edit(row)">编辑</el-button>
        <el-button v-if="tab === 'skus' && auth.can('commerce:inventory')" size="small" @click="stockRow = row; stockDelta = 0; stockReason = ''; stockDialog = true">调整库存</el-button>
        <el-button v-if="tab === 'courses' && row.price_fen && auth.can('commerce:payments')" size="small" @click="priceRow = row; verifiedYuan = 0; evidence = ''; priceDialog = true">核验平台价格</el-button>
      </template></el-table-column>
    </BusinessTable>
    <BusinessPagination :total="total" :page-size="30" v-model:current-page="page" layout="total, prev, pager, next" @current-change="load" />
    <BusinessModal v-model="dialog" :title="`${currentId ? '编辑' : '新增'}${definition.label}`" width="720px">
      <BusinessForm :model="form">
        <el-form-item v-for="field in definition.fields" :key="field.key" :label="field.label">
          <ImageField v-if="field.type === 'image'" v-model="form[field.key]" />
          <div v-else-if="field.type === 'images'" style="width:100%"><div v-for="(_, i) in form.images" :key="i" style="margin-bottom:12px"><ImageField v-model="form.images[i]" /><el-button text type="danger" @click="form.images.splice(i, 1)">移除</el-button></div><el-button v-if="form.images.length < 12" @click="form.images.push('')">添加轮播图片</el-button></div>
          <MarkdownEditor v-else-if="field.type === 'markdown'" v-model="form[field.key]" style="width:100%" />
          <el-select v-else-if="field.type === 'select'" v-model="form[field.key]" clearable><el-option v-for="choice in choices(field)" :key="choice.value" :label="choice.label" :value="choice.value" /></el-select>
          <el-switch v-else-if="field.type === 'switch'" v-model="form[field.key]" />
          <el-input-number v-else-if="field.type === 'price'" :model-value="form[field.key] / 100" :min="0" :max="1000000" :precision="2" @update:model-value="form[field.key] = Math.round(($event || 0) * 100)" />
          <el-input-number v-else-if="field.type === 'days'" :model-value="form[field.key] ?? undefined" :min="1" :max="36500" @update:model-value="form[field.key] = $event || null" />
          <el-input-number v-else-if="field.type === 'number'" v-model="form[field.key]" />
          <el-input v-else v-model="form[field.key]" />
        </el-form-item>
      </BusinessForm>
      <template #footer><el-button @click="dialog = false">取消</el-button><el-button type="primary" :loading="saving" @click="save">保存</el-button></template>
    </BusinessModal>
    <BusinessModal v-model="stockDialog" title="调整可售库存"><BusinessForm><el-form-item label="库存变化（增加为正数，减少为负数）"><el-input-number v-model="stockDelta" /></el-form-item><el-form-item label="调整原因"><el-input v-model="stockReason" /></el-form-item></BusinessForm><template #footer><el-button @click="stockDialog = false">取消</el-button><el-button type="primary" @click="adjustStock">确认调整</el-button></template></BusinessModal>
    <BusinessModal v-model="priceDialog" title="核验已发布的微信课程道具价格">
      <el-alert :closable="false" title="请先在微信平台发布对应道具并核对售价。此操作记录人工核验，不会代替平台发布。" />
      <p>课程：{{ priceRow.title }} · 当前版本 {{ priceRow.revision }} · {{ yuan(priceRow.price_fen) }}</p>
      <BusinessForm><el-form-item label="平台实际售价（元）"><el-input-number v-model="verifiedYuan" :precision="2" /></el-form-item><el-form-item label="发布记录或核验说明"><el-input v-model="evidence" type="textarea" /></el-form-item></BusinessForm>
      <template #footer><el-button @click="priceDialog = false">取消</el-button><el-button type="primary" @click="verifyPrice">确认核验并记录</el-button></template>
    </BusinessModal>
  </BusinessPage>
</template>
