<template>
  <div>
    <div class="toolbar">
      <el-button type="primary" :icon="Plus" @click="openEdit()">新增题目</el-button>
      <span class="hint">选项格式：每行一条「选项文本 | 木:2,火:1」</span>
    </div>
    <el-table :data="rows" v-loading="loading" border>
      <el-table-column prop="sort" label="序" width="60" />
      <el-table-column prop="q" label="题目" min-width="200" />
      <el-table-column label="选项数" width="90">
        <template #default="{ row }">{{ (row.options || []).length }}</template>
      </el-table-column>
      <el-table-column label="启用" width="80">
        <template #default="{ row }">
          <el-tag :type="row.is_active ? 'success' : 'info'" size="small">{{ row.is_active ? '启用' : '停用' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="160" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="openEdit(row)">编辑</el-button>
          <el-button size="small" type="danger" @click="onDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialog" :title="form.id ? '编辑题目' : '新增题目'" width="600px">
      <el-form :model="form" label-width="80px">
        <el-form-item label="题目"><el-input v-model="form.q" /></el-form-item>
        <el-form-item label="选项">
          <el-input v-model="optionsText" type="textarea" :rows="6"
            placeholder="难以入睡，思虑过多 | 火:2,木:1" />
        </el-form-item>
        <el-form-item label="排序"><el-input-number v-model="form.sort" :min="0" /></el-form-item>
        <el-form-item label="启用"><el-switch v-model="form.is_active" /></el-form-item>
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
import { listQuiz, createQuiz, updateQuiz, deleteQuiz } from '@/api';

const rows = ref<any[]>([]);
const loading = ref(false);
const dialog = ref(false);
const form = ref<any>({});
const optionsText = ref('');

async function load() {
  loading.value = true;
  try {
    rows.value = await listQuiz();
  } finally {
    loading.value = false;
  }
}

// 文本 ↔ 结构互转
function optionsToText(opts: any[]): string {
  return (opts || [])
    .map((o) => {
      const score = Object.entries(o.score || {}).map(([k, v]) => `${k}:${v}`).join(',');
      return `${o.text} | ${score}`;
    })
    .join('\n');
}
function textToOptions(text: string): any[] {
  return text.split('\n').map((l) => l.trim()).filter(Boolean).map((line) => {
    const [text, scorePart = ''] = line.split('|').map((s) => s.trim());
    const score: Record<string, number> = {};
    scorePart.split(',').forEach((pair) => {
      const [k, v] = pair.split(':').map((s) => s.trim());
      if (k && v) score[k] = Number(v);
    });
    return { text, score };
  });
}

function openEdit(row?: any) {
  form.value = row ? { ...row } : { q: '', sort: rows.value.length, is_active: true };
  optionsText.value = row ? optionsToText(row.options) : '';
  dialog.value = true;
}

async function onSave() {
  if (!form.value.q) { ElMessage.warning('题目必填'); return; }
  const payload = { q: form.value.q, sort: form.value.sort, is_active: form.value.is_active, options: textToOptions(optionsText.value) };
  if (form.value.id) {
    await updateQuiz(form.value.id, payload);
  } else {
    await createQuiz(payload);
  }
  ElMessage.success('已保存');
  dialog.value = false;
  load();
}

async function onDelete(row: any) {
  await ElMessageBox.confirm('确定删除该题目？', '提示', { type: 'warning' });
  await deleteQuiz(row.id);
  ElMessage.success('已删除');
  load();
}

onMounted(load);
</script>

<style scoped>
.toolbar { margin-bottom: 16px; display: flex; align-items: center; gap: 12px; }
.hint { color: #999; font-size: 12px; }
</style>
