<template>
  <el-popover placement="bottom-end" :width="400" trigger="click" @show="markRead">
    <template #reference>
      <span class="notify" title="任务通知">
        <el-badge :value="unread" :hidden="!unread" :max="99">
          <el-icon :size="18"><Bell /></el-icon>
        </el-badge>
      </span>
    </template>
    <div class="notify__head">
      <b>任务通知</b>
      <el-button text size="small" type="primary" :disabled="!unread" @click="markRead">
        全部已读
      </el-button>
    </div>
    <div v-if="!items.length" class="notify__empty">暂无任务通知</div>
    <div class="notify__list"><div v-for="r in items" :key="r.seq" class="notify__item">
      <el-icon :color="iconColor(r.result)" class="notify__icon">
        <CircleCheck v-if="r.result.startsWith('done:')" />
        <CircleClose v-else-if="r.result.startsWith('error:')" />
        <Remove v-else />
      </el-icon>
      <div class="notify__body">
        <div class="notify__title">{{ r.title || `曲目 #${r.trackId}` }}</div>
        <div class="notify__result" :class="{ 'is-err': r.result.startsWith('error:') }">
          {{ label(r.result) }}
        </div>
      </div>
      <span class="notify__time">{{ fmtTime(r.at) }}</span>
    </div></div>
    <router-link to="/audio-history" class="notify__all">查看全部历史与失败详情</router-link>
  </el-popover>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { Bell, CircleCheck, CircleClose, Remove } from '@element-plus/icons-vue';
import { normalizeAudioStatus } from '@/api';
import { useAuthStore } from '@/stores/auth';

// 任务通知中心：音频归一管线（副本生成/母版上 OSS）的每条结果都会进来。
// 已读游标存 localStorage：打开面板或点「全部已读」即消角标。
const READ_KEY = `admin_notify_read_seq_${useAuthStore().username}`;

const results = ref<any[]>([]);
const lastRead = ref(Number(localStorage.getItem(READ_KEY) || 0));

const items = computed(() => results.value.slice(0, 20));
const unread = computed(() => results.value.filter((r) => r.seq > lastRead.value).length);

function label(result: string): string {
  if (result.startsWith('done:')) return `完成（${result.slice(5)}）`;
  if (result.startsWith('error:')) return `失败：${result.slice(6)}`;
  if (result.startsWith('skip:')) return `无需处理（${result.slice(5)}）`;
  if (result.startsWith('retry:')) return `自动重试：${result.slice(6)}`;
  return result;
}

function iconColor(result: string): string {
  if (result.startsWith('done:')) return '#67c23a';
  if (result.startsWith('error:')) return '#f56c6c';
  return '#909399';
}

function fmtTime(iso: string): string {
  if (!iso) return '';
  // 后端是 UTC 的 ISO；转成本地 HH:MM（今天）或 MM-DD
  const d = new Date(iso.endsWith('Z') ? iso : iso + 'Z');
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const p = (n: number) => String(n).padStart(2, '0');
  return sameDay
    ? `${p(d.getHours())}:${p(d.getMinutes())}`
    : `${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function markRead() {
  const maxSeq = results.value.reduce((m, r) => Math.max(m, r.seq || 0), lastRead.value);
  lastRead.value = maxSeq;
  localStorage.setItem(READ_KEY, String(maxSeq));
}

let timer: ReturnType<typeof setInterval> | null = null;
async function poll() {
  try {
    const s = await normalizeAudioStatus();
    results.value = s.results || [];
  } catch { /* 轮询失败下轮再试 */ }
}

onMounted(() => {
  poll();
  timer = setInterval(poll, 30 * 1000);
});
onUnmounted(() => { if (timer) clearInterval(timer); });
</script>

<style scoped>
.notify { cursor: pointer; display: inline-flex; align-items: center; padding: 4px; color: #555; }
.notify:hover { color: #000; }
.notify__head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.notify__list { max-height: 420px; overflow-y: auto; }
.notify__all { display:block; text-align:center; padding:12px 0 2px; color:var(--el-color-primary); }
.notify__empty { color: #999; text-align: center; padding: 16px 0; }
.notify__item { display: flex; align-items: flex-start; gap: 8px; padding: 8px 0; border-top: 1px solid #f0f0f0; }
.notify__icon { margin-top: 2px; }
.notify__body { flex: 1; min-width: 0; }
.notify__title { font-size: 13px; color: #333; }
.notify__result { font-size: 12px; color: #909399; word-break: break-all; }
.notify__result.is-err { color: #f56c6c; }
.notify__time { font-size: 12px; color: #c0c4cc; flex-shrink: 0; }
</style>
