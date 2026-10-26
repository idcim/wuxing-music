<script setup lang="ts">
// 对接官方 CheckUpdates 的偏好、轮询和可见性行为；使用后台构建标识避免 ETag 基线漏报。
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { preferences } from '@vben/preferences';
import { ElMessage } from 'element-plus';
import { createVersionChecker, readAdminBuild } from '@/utils/version-check';

const open = ref(false), checking = ref(false), dismissed = ref('');
const reload = () => window.location.reload();
let timer: ReturnType<typeof setInterval> | undefined;
let controller: AbortController | undefined;
let disposed = false;
const inspect = createVersionChecker(__ADMIN_BUILD_ID__, async () => {
  controller = new AbortController();
  const timeout = setTimeout(() => controller?.abort(), 10000);
  try { return await readAdminBuild(fetch, `${import.meta.env.BASE_URL}admin-version.json`, controller.signal); }
  finally { clearTimeout(timeout); }
});
async function check(manual = false) {
  if (!import.meta.env.PROD) { if (manual) ElMessage.info('开发环境不检查线上更新'); return; }
  checking.value = true;
  try {
    const result = await inspect();
    if (disposed || (!manual && !preferences.app.enableCheckUpdates)) return;
    if (result.state === 'available' && (manual || dismissed.value !== result.buildId)) open.value = true;
    if (result.state === 'available') dismissed.value = result.buildId || '';
    else if (manual) (result.state === 'current' ? ElMessage.success : ElMessage.warning)(result.state === 'current' ? '当前已是最新后台版本' : '暂时无法检查更新，请稍后重试');
  } finally { checking.value = false; }
}
function schedule() {
  clearInterval(timer);
  if (!document.hidden && preferences.app.enableCheckUpdates && preferences.app.checkUpdatesInterval > 0) {
    timer = setInterval(() => void check(), Math.min(60, Math.max(1, preferences.app.checkUpdatesInterval)) * 60000);
  }
}
function visible() {
  schedule();
  if (!document.hidden && preferences.app.enableCheckUpdates) void check();
}
watch(() => [preferences.app.enableCheckUpdates, preferences.app.checkUpdatesInterval], visible);
onMounted(() => { visible(); document.addEventListener('visibilitychange', visible); });
onUnmounted(() => { disposed = true; clearInterval(timer); controller?.abort(); document.removeEventListener('visibilitychange', visible); });
defineExpose({ check, checking });
</script>
<template>
  <BusinessModal v-model="open" title="后台有新版本" width="480px">
    <p>检测到后台已更新。请先保存正在编辑的内容，再刷新到新版；刷新会重新载入整个后台。</p>
    <template #footer><el-button @click="open = false">稍后处理</el-button><el-button type="primary" @click="reload">刷新到新版</el-button></template>
  </BusinessModal>
</template>
