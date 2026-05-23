<template>
  <el-tabs v-model="tab" class="settings-tabs">
    <el-tab-pane label="站点信息" name="site">
      <Site v-if="loaded.site" />
    </el-tab-pane>
    <el-tab-pane label="文件存储" name="storage">
      <Storage v-if="loaded.storage" />
    </el-tab-pane>
    <el-tab-pane label="支付设置" name="pay">
      <Settings v-if="loaded.pay" />
    </el-tab-pane>
  </el-tabs>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import Site from './Site.vue';
import Storage from './Storage.vue';
import Settings from './Settings.vue';

const tab = ref('site');
// 懒加载各 tab：切到时才挂载，避免一次性发起全部请求
const loaded = reactive({ site: true, storage: false, pay: false });

watch(tab, (t) => {
  if (t === 'storage') loaded.storage = true;
  if (t === 'pay') loaded.pay = true;
});
</script>

<style scoped>
.settings-tabs :deep(.el-tabs__content) {
  padding-top: 8px;
}
</style>
