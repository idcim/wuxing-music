<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { commerce } from '@/api/commerce';
interface Check { name: string; present: boolean; source: string }
interface Group { key: string; label: string; complete: boolean; note: string; checks: Check[] }
const groups = ref<Group[]>([]), loading = ref(false), error = ref('');
const expanded = ref<string[]>([]);
async function load() {
  loading.value = true; error.value = '';
  try {
    groups.value = (await commerce.get('/configuration-check')).groups;
    expanded.value = groups.value.filter((group) => !group.complete).map((group) => group.key);
  }
  catch { error.value = '配置自检暂不可用，请稍后重试'; }
  finally { loading.value = false; }
}
onMounted(load);
</script>
<template>
  <section class="configuration-check" v-loading="loading">
    <div class="configuration-check__heading"><h3>服务器配置加载自检</h3><el-button :loading="loading" @click="load">刷新配置自检</el-button></div>
    <p>仅检查当前进程是否已加载参数和确认标记，不显示参数内容，不代表渠道已联调。服务器修改配置后需重新部署 API 与 Worker。已有真单验收结论继续保留。</p>
    <el-alert v-if="error" :title="error" type="warning" :closable="false" />
    <el-collapse v-if="groups.length" v-model="expanded">
      <el-collapse-item v-for="group in groups" :key="group.key" :name="group.key">
        <template #title><span>{{ group.label }}</span><el-tag :type="group.complete ? 'success' : 'warning'" size="small" class="configuration-check__tag">{{ group.complete ? '参数已加载' : '有缺项 / 标记未启用' }}</el-tag></template>
        <p>{{ group.note }}</p>
        <el-table :data="group.checks" size="small" border>
          <el-table-column prop="name" label="配置项" min-width="240" />
          <el-table-column prop="source" label="读取位置" min-width="150" />
          <el-table-column label="加载状态" width="150"><template #default="{ row }"><el-tag :type="row.present ? 'success' : 'warning'">{{ row.present ? '已加载 / 已启用' : '缺失 / 未启用' }}</el-tag></template></el-table-column>
        </el-table>
      </el-collapse-item>
    </el-collapse>
  </section>
</template>
<style scoped>
.configuration-check { margin: 20px 0; }
.configuration-check__heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.configuration-check p { margin: 12px 0; color: var(--el-text-color-secondary); line-height: 1.7; }
.configuration-check__tag { margin-left: 12px; }
</style>
