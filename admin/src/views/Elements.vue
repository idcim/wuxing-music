<template>
  <div>
    <div class="toolbar">
      <el-button type="primary" :icon="Plus" @click="openEdit()">新增五行</el-button>
    </div>
    <el-table :data="rows" v-loading="loading" border>
      <el-table-column prop="id" label="元素" width="70" />
      <el-table-column prop="en" label="英文" width="90" />
      <el-table-column prop="note" label="五音" width="70" />
      <el-table-column prop="organ" label="脏腑" width="90" />
      <el-table-column prop="season" label="季节" width="80" />
      <el-table-column prop="quality" label="特性" width="90" />
      <el-table-column prop="desc" label="一句话描述" min-width="160" />
      <el-table-column label="文化维度" width="100">
        <template #default="{ row }">
          <el-tag :type="metaCount(row.meta) ? 'success' : 'info'" size="small">
            {{ metaCount(row.meta) ? `${metaCount(row.meta)} 项` : '未填' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="主色" width="90">
        <template #default="{ row }">
          <span class="swatch" :style="{ background: row.primary }" />{{ row.primary }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="160" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="openEdit(row)">编辑</el-button>
          <el-button size="small" type="danger" @click="onDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialog" :title="isEdit ? '编辑五行' : '新增五行'" width="560px">
      <el-form :model="form" label-width="90px">
        <el-form-item label="元素"><el-input v-model="form.id" :disabled="isEdit" placeholder="木/火/土/金/水" /></el-form-item>
        <el-form-item label="英文"><el-input v-model="form.en" /></el-form-item>
        <el-form-item label="图标名"><el-input v-model="form.icon" placeholder="sprout/flame..." /></el-form-item>
        <el-form-item label="五音"><el-input v-model="form.note" /></el-form-item>
        <el-form-item label="拼音"><el-input v-model="form.note_pinyin" /></el-form-item>
        <el-form-item label="脏腑"><el-input v-model="form.organ" /></el-form-item>
        <el-form-item label="季节"><el-input v-model="form.season" /></el-form-item>
        <el-form-item label="特性"><el-input v-model="form.quality" /></el-form-item>
        <el-form-item label="主色"><el-color-picker v-model="form.primary" /></el-form-item>
        <el-form-item label="高亮色"><el-color-picker v-model="form.accent" /></el-form-item>
        <el-form-item label="光晕"><el-input v-model="form.glow" /></el-form-item>
        <el-form-item label="背景"><el-input v-model="form.bg" type="textarea" :rows="2" /></el-form-item>
        <el-form-item label="一句话描述"><el-input v-model="form.desc" placeholder="清新生发 · 舒展流动" /></el-form-item>
        <el-form-item label="引导文案"><el-input v-model="form.sleep_tip" type="textarea" :rows="2" placeholder="角音像春天的风，让人慢慢舒展开。" /></el-form-item>
        <el-form-item label="文化维度">
          <el-input v-model="metaText" type="textarea" :rows="10" placeholder="{}" />
          <div class="meta-hint">
            五志/五神/简谱/调式/时间感等对照维度，JSON 对象。
            内容基准见仓库 <code>docs/WUXING-REFERENCE.md</code>，键名见该文档 5.2 节。
          </div>
        </el-form-item>
        <el-form-item label="排序"><el-input-number v-model="form.sort" :min="0" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">取消</el-button>
        <el-button type="primary" @click="onSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { Plus } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { listElements, upsertElement, deleteElement } from '@/api';

const rows = ref<any[]>([]);
const loading = ref(false);
const dialog = ref(false);
const isEdit = ref(false);
const form = ref<any>({});
// meta 是 JSON 字符串，编辑时展开成带缩进的文本，保存前再校验回压
const metaText = ref('{}');

function metaCount(raw: string) {
  try {
    const o = JSON.parse(raw || '{}');
    return o && typeof o === 'object' ? Object.keys(o).length : 0;
  } catch {
    return 0;
  }
}

async function load() {
  loading.value = true;
  try {
    rows.value = await listElements();
  } finally {
    loading.value = false;
  }
}

function openEdit(row?: any) {
  isEdit.value = !!row;
  form.value = row
    ? { ...row }
    : { id: '', en: '', icon: '', primary: '#84cc16', accent: '#bef264', glow: '', bg: '', note: '', note_pinyin: '', organ: '', season: '', quality: '', desc: '', sleep_tip: '', meta: '{}', sort: 0 };
  try {
    metaText.value = JSON.stringify(JSON.parse(form.value.meta || '{}'), null, 2);
  } catch {
    // 库里存了非法 JSON 就原样给出来，让人看见问题在哪，别静默变成 {}
    metaText.value = form.value.meta || '{}';
  }
  dialog.value = true;
}

async function onSave() {
  if (!form.value.id) {
    ElMessage.warning('元素必填');
    return;
  }
  let meta: unknown;
  try {
    meta = JSON.parse(metaText.value.trim() || '{}');
  } catch {
    ElMessage.error('文化维度不是合法 JSON');
    return;
  }
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
    ElMessage.error('文化维度必须是 JSON 对象');
    return;
  }
  await upsertElement({ ...form.value, meta: JSON.stringify(meta) });
  ElMessage.success('已保存');
  dialog.value = false;
  load();
}

async function onDelete(row: any) {
  await ElMessageBox.confirm(`确定删除「${row.id}」？该元素下曲目需先处理。`, '提示', { type: 'warning' });
  await deleteElement(row.id);
  ElMessage.success('已删除');
  load();
}

onMounted(load);
</script>

<style scoped>
.toolbar { margin-bottom: 16px; }
.swatch { display: inline-block; width: 14px; height: 14px; border-radius: 3px; margin-right: 6px; vertical-align: middle; }
.meta-hint { color: #999; font-size: 12px; line-height: 1.6; margin-top: 4px; }
.meta-hint code { background: #f4f4f5; padding: 0 4px; border-radius: 3px; }
</style>
