<template>
  <div class="markdown-editor">
    <div class="markdown-editor__toolbar">
      <el-button size="small" :disabled="mode === 'preview'" @click="wrap('## ', '', '标题')">H2</el-button>
      <el-button size="small" :disabled="mode === 'preview'" @click="wrap('**', '**', '加粗文字')">加粗</el-button>
      <el-button size="small" :disabled="mode === 'preview'" @click="wrap('*', '*', '斜体文字')">斜体</el-button>
      <el-button size="small" :disabled="mode === 'preview'" @click="wrap('- ', '', '列表项')">列表</el-button>
      <el-button size="small" :disabled="mode === 'preview'" @click="wrap('1. ', '', '列表项')">编号</el-button>
      <el-button size="small" :disabled="mode === 'preview'" @click="wrap('> ', '', '引用内容')">引用</el-button>
      <el-button size="small" :disabled="mode === 'preview'" @click="wrap('`', '`', '代码')">代码</el-button>
      <el-button size="small" :disabled="mode === 'preview'" @click="insertLink">链接</el-button>
      <el-button-group class="markdown-editor__mode">
        <el-button size="small" :type="mode === 'edit' ? 'primary' : 'default'" @click="mode = 'edit'">编辑</el-button>
        <el-button size="small" :type="mode === 'preview' ? 'primary' : 'default'" @click="mode = 'preview'">预览</el-button>
      </el-button-group>
    </div>

    <el-input
      v-if="mode === 'edit'"
      ref="input"
      v-model="value"
      type="textarea"
      :rows="rows"
      resize="vertical"
      :placeholder="placeholder"
    />
    <div v-else class="markdown-editor__preview" v-html="previewHtml" />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { renderMarkdown } from '@/utils/markdown';

const props = withDefaults(defineProps<{
  modelValue: string;
  placeholder?: string;
  rows?: number;
}>(), { placeholder: '', rows: 8 });

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const input = ref<any>(null);
const mode = ref<'edit' | 'preview'>('edit');

const value = computed({
  get: () => props.modelValue,
  set: (next: string) => emit('update:modelValue', next)
});
const previewHtml = computed(() => renderMarkdown(props.modelValue || '暂无内容'));

function wrap(prefix: string, suffix: string, placeholder: string) {
  const el = input.value?.textarea as HTMLTextAreaElement | undefined;
  if (!el) return;
  const start = el.selectionStart;
  const end = el.selectionEnd;
  const selected = props.modelValue.slice(start, end) || placeholder;
  const next = `${props.modelValue.slice(0, start)}${prefix}${selected}${suffix}${props.modelValue.slice(end)}`;
  emit('update:modelValue', next);
  nextTick(() => {
    el.focus();
    el.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
  });
}

function insertLink() {
  const el = input.value?.textarea as HTMLTextAreaElement | undefined;
  const selected = el ? props.modelValue.slice(el.selectionStart, el.selectionEnd) : '';
  wrap('[', `](https://example.com)`, selected || '链接文字');
}
</script>

<style scoped>
.markdown-editor__toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}
.markdown-editor__toolbar .el-button + .el-button { margin-left: 0; }
.markdown-editor__mode { margin-left: auto; }
.markdown-editor__preview {
  min-height: 160px;
  padding: 12px;
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  line-height: 1.8;
  color: var(--el-text-color-primary);
  overflow-wrap: anywhere;
}
.markdown-editor__preview :deep(h1),
.markdown-editor__preview :deep(h2),
.markdown-editor__preview :deep(h3),
.markdown-editor__preview :deep(h4) { margin: 0.7em 0 0.35em; }
.markdown-editor__preview :deep(p) { margin: 0.5em 0; }
.markdown-editor__preview :deep(blockquote) {
  margin: 0.7em 0;
  padding-left: 12px;
  border-left: 3px solid var(--el-border-color);
  color: var(--el-text-color-regular);
}
.markdown-editor__preview :deep(code) {
  padding: 2px 5px;
  border-radius: 4px;
  background: var(--el-fill-color-light);
  color: var(--el-color-danger);
}
.markdown-editor__preview :deep(a) { color: var(--el-color-primary); }
</style>
