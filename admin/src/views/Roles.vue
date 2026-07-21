<template>
  <div>
    <div class="toolbar">
      <el-button type="primary" :icon="Plus" @click="openCreate">新建角色</el-button>
      <span class="hint">权限只控制后台功能；内置「超级管理员」拥有全部权限且不可修改。</span>
    </div>

    <el-table :data="rows" v-loading="loading" border>
      <el-table-column prop="id" label="ID" width="70" />
      <el-table-column prop="name" label="角色名" min-width="140">
        <template #default="{ row }">
          {{ row.name }}
          <el-tag v-if="row.is_builtin" size="small" type="danger" class="tag">内置</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="remark" label="说明" min-width="180">
        <template #default="{ row }">{{ row.remark || '-' }}</template>
      </el-table-column>
      <el-table-column label="权限" min-width="90">
        <template #default="{ row }">{{ row.permissions.length }} 项</template>
      </el-table-column>
      <el-table-column label="使用中" width="90">
        <template #default="{ row }">{{ row.admin_count }} 人</template>
      </el-table-column>
      <el-table-column label="操作" width="180" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="openEdit(row)">{{ row.is_builtin ? '查看' : '编辑' }}</el-button>
          <el-button size="small" type="danger" :disabled="row.is_builtin || row.admin_count > 0"
            @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialog" :title="dialogTitle" width="640px">
      <el-form :model="form" label-width="80px">
        <el-form-item label="角色名">
          <el-input v-model="form.name" :disabled="form.is_builtin" placeholder="如：运营、客服" />
        </el-form-item>
        <el-form-item label="说明">
          <el-input v-model="form.remark" :disabled="form.is_builtin" placeholder="可选" />
        </el-form-item>
        <el-form-item label="权限">
          <div class="perms">
            <div v-for="g in groups" :key="g.module" class="perm-group">
              <div class="perm-group-head">
                <el-checkbox :model-value="allChecked(g)" :indeterminate="someChecked(g)"
                  :disabled="form.is_builtin" @change="(v: any) => toggleGroup(g, v)">
                  {{ g.label }}
                </el-checkbox>
              </div>
              <div class="perm-items">
                <el-checkbox v-for="it in g.items" :key="it.key" v-model="checked[it.key]"
                  :disabled="form.is_builtin" @change="onItemChange(g, it)">
                  {{ it.label }}
                </el-checkbox>
              </div>
            </div>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">{{ form.is_builtin ? '关闭' : '取消' }}</el-button>
        <el-button v-if="!form.is_builtin" type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import * as api from '@/api';

interface PermItem { key: string; label: string }
interface PermGroup { module: string; label: string; items: PermItem[] }

const rows = ref<any[]>([]);
const groups = ref<PermGroup[]>([]);
const loading = ref(false);
const saving = ref(false);
const dialog = ref(false);

const form = reactive<any>({ id: null, name: '', remark: '', is_builtin: false });
const checked = reactive<Record<string, boolean>>({});

const dialogTitle = computed(() =>
  form.is_builtin ? '查看角色（内置不可改）' : form.id ? '编辑角色' : '新建角色'
);

const allChecked = (g: PermGroup) => g.items.every((i) => checked[i.key]);
const someChecked = (g: PermGroup) => !allChecked(g) && g.items.some((i) => checked[i.key]);

/** 勾整组：全选/全不选 */
function toggleGroup(g: PermGroup, v: boolean) {
  g.items.forEach((i) => (checked[i.key] = v));
}

/** 勾了任一「写」权限时自动带上同模块的 view，避免出现能改不能看的组合 */
function onItemChange(g: PermGroup, it: PermItem) {
  if (!checked[it.key]) return;
  const view = g.items.find((i) => i.key.endsWith(':view'));
  if (view && view.key !== it.key) checked[view.key] = true;
}

async function reload() {
  loading.value = true;
  try {
    rows.value = await api.listRoles();
  } finally {
    loading.value = false;
  }
}

async function loadPermissions() {
  const data = await api.listPermissions();
  groups.value = data.groups;
}

function resetChecked(perms: string[] = []) {
  groups.value.forEach((g) => g.items.forEach((i) => (checked[i.key] = perms.includes(i.key))));
}

function openCreate() {
  Object.assign(form, { id: null, name: '', remark: '', is_builtin: false });
  resetChecked([]);
  dialog.value = true;
}

function openEdit(row: any) {
  Object.assign(form, { id: row.id, name: row.name, remark: row.remark, is_builtin: row.is_builtin });
  resetChecked(row.permissions);
  dialog.value = true;
}

async function save() {
  const permissions = Object.keys(checked).filter((k) => checked[k]);
  if (!form.name.trim()) {
    ElMessage.error('请填写角色名');
    return;
  }
  if (!permissions.length) {
    ElMessage.error('至少勾选一项权限');
    return;
  }
  saving.value = true;
  try {
    await api.upsertRole({ id: form.id, name: form.name.trim(), remark: form.remark, permissions });
    ElMessage.success('已保存');
    dialog.value = false;
    reload();
  } finally {
    saving.value = false;
  }
}

async function remove(row: any) {
  await ElMessageBox.confirm(`确定删除角色「${row.name}」？`, '删除确认', { type: 'warning' });
  await api.deleteRole(row.id);
  ElMessage.success('已删除');
  reload();
}

onMounted(async () => {
  await loadPermissions();
  reload();
});
</script>

<style scoped>
.toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.tag { margin-left: 6px; }
.hint { color: #999; font-size: 12px; }
.perms { width: 100%; }
.perm-group { border: 1px solid #ebeef5; border-radius: 4px; padding: 8px 12px; margin-bottom: 8px; }
.perm-group-head { border-bottom: 1px dashed #ebeef5; padding-bottom: 4px; margin-bottom: 4px; }
.perm-items { display: flex; flex-wrap: wrap; gap: 16px; padding-left: 22px; }
</style>
