<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { commerce } from '@/api/commerce';
interface Check { name: string; present: boolean; source: string }
interface Group { key: string; label: string; complete: boolean; note: string; checks: Check[] }
const groups = ref<Group[]>([]), loading = ref(false), error = ref('');
const expanded = ref<string[]>([]);
const completeCount = computed(() => groups.value.filter((group) => group.complete).length);
async function load() {
  loading.value = true; error.value = '';
  try {
    groups.value = (await commerce.get('/configuration-check')).groups;
  }
  catch { error.value = '配置自检暂不可用，请稍后重试'; }
  finally { loading.value = false; }
}
onMounted(load);
</script>
<template>
  <section class="configuration-check" v-loading="loading">
    <div class="configuration-check__heading">
      <div><h3>配置加载自检</h3><p>查看各渠道参数是否加载。点击分组查看缺项和读取位置，凭证内容不会展示。</p></div>
      <el-button :loading="loading" @click="load">刷新自检</el-button>
    </div>
    <div v-if="groups.length" class="configuration-check__summary">
      <span>共 {{ groups.length }} 组</span>
      <el-tag type="success" effect="plain">已加载 {{ completeCount }} 组</el-tag>
      <el-tag v-if="completeCount < groups.length" type="warning" effect="plain">待完善 {{ groups.length - completeCount }} 组</el-tag>
    </div>
    <el-alert v-if="error" :title="error" type="warning" :closable="false" />
    <el-collapse v-if="groups.length" v-model="expanded">
      <el-collapse-item v-for="group in groups" :key="group.key" :name="group.key">
        <template #title><span>{{ group.label }}</span><el-tag :type="group.complete ? 'success' : 'warning'" size="small" class="configuration-check__tag">{{ group.complete ? '参数已加载' : `待完善 ${group.checks.filter((check) => !check.present).length} 项` }}</el-tag></template>
        <p>{{ group.note }}</p>
        <el-table :data="group.checks" size="small" border>
          <el-table-column prop="name" label="配置项" min-width="240" />
          <el-table-column prop="source" label="读取位置" min-width="150" />
          <el-table-column label="加载状态" width="150"><template #default="{ row }"><el-tag :type="row.present ? 'success' : 'warning'">{{ row.present ? '已加载 / 已启用' : '缺失 / 未启用' }}</el-tag></template></el-table-column>
        </el-table>
      </el-collapse-item>
    </el-collapse>
    <p class="configuration-check__footnote">仅反映配置加载状态，不替代支付、播放和发货的实际验收。</p>
  </section>
</template>
<style scoped>
.configuration-check { max-width: 960px; }
.configuration-check__heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.configuration-check h3 { margin: 0; font-size: 16px; font-weight: 600; }
.configuration-check p { margin: 8px 0 16px; color: var(--el-text-color-secondary); line-height: 1.7; }
.configuration-check__summary { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; margin: 0 0 20px; color: var(--el-text-color-secondary); }
.configuration-check__tag { margin-left: 12px; }
.configuration-check .configuration-check__footnote { margin-top: 16px; font-size: 12px; }
</style>
