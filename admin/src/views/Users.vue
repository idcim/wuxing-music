<template>
  <div>
    <div class="toolbar">
      <el-input v-model="keyword" placeholder="按昵称搜索" clearable style="width: 200px" @keyup.enter="reload" />
      <el-button :icon="Search" @click="reload">搜索</el-button>
    </div>
    <el-table :data="rows" v-loading="loading" border>
      <el-table-column prop="id" label="ID" width="70" />
      <el-table-column prop="nickname" label="昵称" min-width="120" />
      <el-table-column prop="element" label="五行" width="80" />
      <el-table-column label="会员" width="120">
        <template #default="{ row }">
          <el-tag :type="row.membership_type === 'free' ? 'info' : 'warning'" size="small">
            {{ row.membership_name }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="membership_expire_at" label="到期" width="180">
        <template #default="{ row }">{{ fmt(row.membership_expire_at) }}</template>
      </el-table-column>
      <el-table-column prop="created_at" label="注册时间" width="180">
        <template #default="{ row }">{{ fmt(row.created_at) }}</template>
      </el-table-column>
    </el-table>
    <el-pagination class="pager" layout="total, prev, pager, next" :total="total"
      :page-size="size" :current-page="page" @current-change="onPage" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { Search } from '@element-plus/icons-vue';
import { listUsers } from '@/api';

const rows = ref<any[]>([]);
const total = ref(0);
const page = ref(1);
const size = ref(20);
const loading = ref(false);
const keyword = ref('');

function fmt(s?: string) {
  return s ? new Date(s).toLocaleString('zh-CN') : '-';
}

async function load() {
  loading.value = true;
  try {
    const data = await listUsers({ page: page.value, size: size.value, keyword: keyword.value || undefined });
    rows.value = data.items;
    total.value = data.total;
  } finally {
    loading.value = false;
  }
}
function reload() { page.value = 1; load(); }
function onPage(p: number) { page.value = p; load(); }

onMounted(load);
</script>

<style scoped>
.toolbar { margin-bottom: 16px; display: flex; gap: 12px; }
.pager { margin-top: 16px; justify-content: flex-end; }
</style>
