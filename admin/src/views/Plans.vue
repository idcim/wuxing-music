<template>
  <div>
    <div class="toolbar">
      <el-button type="primary" :icon="Plus" @click="openEdit()">新增套餐</el-button>
    </div>
    <el-table :data="rows" v-loading="loading" border>
      <el-table-column prop="id" label="ID" width="90" />
      <el-table-column prop="name" label="名称" width="100" />
      <el-table-column prop="price" label="价格" width="90">
        <template #default="{ row }">¥{{ row.price }}</template>
      </el-table-column>
      <el-table-column prop="duration_days" label="时长(天)" width="100" />
      <el-table-column label="特性">
        <template #default="{ row }">
          <el-tag v-for="f in row.features" :key="f" size="small" class="tag">{{ f }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="featured" label="推荐" width="80">
        <template #default="{ row }">
          <el-tag v-if="row.featured" type="warning" size="small">推荐</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="160" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="openEdit(row)">编辑</el-button>
          <el-button size="small" type="danger" @click="onDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialog" :title="form.id ? '编辑套餐' : '新增套餐'" width="520px">
      <el-form :model="form" label-width="90px">
        <el-form-item label="ID"><el-input v-model="form.id" :disabled="isEdit" placeholder="free/month/year/trial" /></el-form-item>
        <el-form-item label="名称"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="英文名"><el-input v-model="form.en" /></el-form-item>
        <el-form-item label="价格"><el-input-number v-model="form.price" :min="0" /></el-form-item>
        <el-form-item label="原价"><el-input v-model="form.original" /></el-form-item>
        <el-form-item label="单位"><el-input v-model="form.unit" placeholder="/ 月" /></el-form-item>
        <el-form-item label="角标"><el-input v-model="form.badge" placeholder="热门" /></el-form-item>
        <el-form-item label="时长(天)"><el-input-number v-model="form.duration_days" :min="0" /></el-form-item>
        <el-form-item label="特性">
          <el-input v-model="featuresText" type="textarea" :rows="4" placeholder="每行一条特性" />
        </el-form-item>
        <el-form-item label="推荐"><el-switch v-model="form.featured" /></el-form-item>
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
import { computed, onMounted, ref } from 'vue';
import { Plus } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { listPlans, upsertPlan, deletePlan } from '@/api';

const rows = ref<any[]>([]);
const loading = ref(false);
const dialog = ref(false);
const isEdit = ref(false);
const form = ref<any>({});
const featuresText = ref('');

const featuresArr = computed(() =>
  featuresText.value.split('\n').map((s) => s.trim()).filter(Boolean)
);

async function load() {
  loading.value = true;
  try {
    rows.value = await listPlans();
  } finally {
    loading.value = false;
  }
}

function openEdit(row?: any) {
  isEdit.value = !!row;
  form.value = row
    ? { ...row }
    : { id: '', name: '', en: '', price: 0, original: '', unit: '', badge: '', duration_days: 0, featured: false, is_active: true, sort: 0 };
  featuresText.value = row ? (row.features || []).join('\n') : '';
  dialog.value = true;
}

async function onSave() {
  if (!form.value.id || !form.value.name) {
    ElMessage.warning('ID 和名称必填');
    return;
  }
  await upsertPlan({ ...form.value, features: featuresArr.value });
  ElMessage.success('已保存');
  dialog.value = false;
  load();
}

async function onDelete(row: any) {
  await ElMessageBox.confirm(`确定删除套餐「${row.name}」？`, '提示', { type: 'warning' });
  await deletePlan(row.id);
  ElMessage.success('已删除');
  load();
}

onMounted(load);
</script>

<style scoped>
.toolbar { margin-bottom: 16px; }
.tag { margin: 2px 4px 2px 0; }
</style>
