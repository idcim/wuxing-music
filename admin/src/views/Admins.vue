<template>
  <div>
    <div class="toolbar">
      <el-input v-model="keyword" placeholder="按账号搜索" clearable style="width: 200px" @keyup.enter="reload" />
      <el-button :icon="Search" @click="reload">搜索</el-button>
      <el-button type="primary" :icon="Plus" @click="openCreate">新建管理员</el-button>
    </div>

    <el-table :data="rows" v-loading="loading" border>
      <el-table-column prop="id" label="ID" width="70" />
      <el-table-column prop="username" label="账号" min-width="120">
        <template #default="{ row }">
          {{ row.username }}
          <el-tag v-if="isSelf(row)" size="small" type="info" class="tag">我</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="nickname" label="昵称" min-width="110" />
      <el-table-column label="角色" min-width="130">
        <template #default="{ row }">
          <el-tag v-if="row.is_super" type="danger" size="small">超级管理员</el-tag>
          <el-tag v-else-if="row.role_name" size="small">{{ row.role_name }}</el-tag>
          <span v-else class="muted">未分配</span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag :type="row.is_active ? 'success' : 'info'" size="small">
            {{ row.is_active ? '启用' : '停用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="创建时间" width="170">
        <template #default="{ row }">{{ fmt(row.created_at) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="290" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="openEdit(row)">编辑</el-button>
          <el-button size="small" @click="openPassword(row)">改密</el-button>
          <el-button size="small" :disabled="isSelf(row)" @click="toggleActive(row)">
            {{ row.is_active ? '停用' : '启用' }}
          </el-button>
          <el-button size="small" type="danger" :disabled="isSelf(row)" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination class="pager" layout="total, prev, pager, next" :total="total"
      :page-size="size" :current-page="page" @current-change="onPage" />

    <!-- 新建 / 编辑 -->
    <el-dialog v-model="dialog" :title="form.id ? '编辑管理员' : '新建管理员'" width="460px">
      <el-form :model="form" label-width="90px">
        <el-form-item label="账号">
          <el-input v-model="form.username" :disabled="!!form.id" placeholder="登录用账号，创建后不可改" />
        </el-form-item>
        <el-form-item v-if="!form.id" label="密码">
          <el-input v-model="form.password" type="password" show-password placeholder="至少 6 位" />
        </el-form-item>
        <el-form-item label="昵称">
          <el-input v-model="form.nickname" placeholder="显示名" />
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="form.role_id" clearable placeholder="选择角色" style="width: 100%"
            :disabled="form.is_super">
            <el-option v-for="r in roles" :key="r.id" :label="r.name" :value="r.id" />
          </el-select>
          <div class="hint">超级管理员拥有全部权限，无需再选角色。</div>
        </el-form-item>
        <el-form-item label="超级管理员">
          <el-switch v-model="form.is_super" :disabled="form.id && isSelfId(form.id)" />
          <div class="hint">开启后绕过一切权限校验，并可管理管理员与角色。</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <!-- 重置密码 -->
    <el-dialog v-model="pwdDialog" title="重置密码" width="400px">
      <el-form label-width="80px">
        <el-form-item label="账号">
          <span>{{ pwdTarget.username }}</span>
        </el-form-item>
        <el-form-item label="新密码">
          <el-input v-model="newPassword" type="password" show-password placeholder="至少 6 位" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="pwdDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="savePassword">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Search } from '@element-plus/icons-vue';
import * as api from '@/api';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();

const rows = ref<any[]>([]);
const roles = ref<any[]>([]);
const total = ref(0);
const page = ref(1);
const size = 20;
const keyword = ref('');
const loading = ref(false);
const saving = ref(false);

const dialog = ref(false);
const form = reactive<any>({ id: null, username: '', password: '', nickname: '', role_id: null, is_super: false });

const pwdDialog = ref(false);
const pwdTarget = reactive<any>({ id: null, username: '' });
const newPassword = ref('');

const isSelf = (row: any) => row.username === auth.username;
const isSelfId = (id: number) => rows.value.some((r) => r.id === id && r.username === auth.username);

function fmt(s?: string) {
  return s ? new Date(s).toLocaleString('zh-CN') : '-';
}

async function reload() {
  loading.value = true;
  try {
    const data = await api.listAdmins({ keyword: keyword.value || undefined, page: page.value, size });
    rows.value = data.items;
    total.value = data.total;
  } finally {
    loading.value = false;
  }
}

async function loadRoles() {
  roles.value = await api.listRoles();
}

function onPage(p: number) {
  page.value = p;
  reload();
}

function openCreate() {
  Object.assign(form, { id: null, username: '', password: '', nickname: '管理员', role_id: null, is_super: false });
  dialog.value = true;
}

function openEdit(row: any) {
  Object.assign(form, {
    id: row.id,
    username: row.username,
    password: '',
    nickname: row.nickname,
    role_id: row.role_id,
    is_super: row.is_super
  });
  dialog.value = true;
}

async function save() {
  saving.value = true;
  try {
    if (form.id) {
      await api.updateAdmin(form.id, {
        nickname: form.nickname,
        role_id: form.role_id ?? null,
        is_super: form.is_super
      });
    } else {
      await api.createAdmin({
        username: form.username.trim(),
        password: form.password,
        nickname: form.nickname,
        role_id: form.role_id ?? null,
        is_super: form.is_super
      });
    }
    ElMessage.success('已保存');
    dialog.value = false;
    reload();
  } finally {
    saving.value = false;
  }
}

function openPassword(row: any) {
  Object.assign(pwdTarget, { id: row.id, username: row.username });
  newPassword.value = '';
  pwdDialog.value = true;
}

async function savePassword() {
  saving.value = true;
  try {
    await api.resetAdminPassword(pwdTarget.id, newPassword.value);
    ElMessage.success('密码已重置');
    pwdDialog.value = false;
  } finally {
    saving.value = false;
  }
}

async function toggleActive(row: any) {
  await api.updateAdmin(row.id, { is_active: !row.is_active });
  ElMessage.success(row.is_active ? '已停用' : '已启用');
  reload();
}

async function remove(row: any) {
  await ElMessageBox.confirm(`确定删除管理员「${row.username}」？`, '删除确认', { type: 'warning' });
  await api.deleteAdmin(row.id);
  ElMessage.success('已删除');
  reload();
}

onMounted(() => {
  reload();
  loadRoles();
});
</script>

<style scoped>
.toolbar { display: flex; gap: 8px; margin-bottom: 12px; }
.pager { margin-top: 12px; justify-content: flex-end; }
.tag { margin-left: 6px; }
.muted { color: #999; }
.hint { color: #999; font-size: 12px; line-height: 1.5; }
</style>
