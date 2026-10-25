<script setup lang="ts">
import { ref } from 'vue';
import { ElMessage } from 'element-plus';
import req from '@/api/request';
defineProps<{ modelValue?: string }>();
const emit = defineEmits<{ 'update:modelValue': [string] }>();
const uploading = ref(false);
async function upload(options: any) {
  if (!options.file.type.startsWith('image/') || options.file.size > 8 * 1024 * 1024) {
    ElMessage.warning('请选择 8MB 以内的图片'); return;
  }
  uploading.value = true;
  try {
    const form = new FormData(); form.append('file', options.file);
    const result = await req.post('/api/admin/upload', form, { timeout: 120000 });
    emit('update:modelValue', result.full_url || result.url);
  } finally { uploading.value = false; }
}
</script>
<template>
  <div class="image-field">
    <el-image v-if="modelValue" :src="modelValue" style="width:120px;height:80px" fit="cover" :preview-src-list="[modelValue]" />
    <el-upload :show-file-list="false" accept="image/*" :http-request="upload"><el-button :loading="uploading">上传图片</el-button></el-upload>
    <el-input :model-value="modelValue || ''" placeholder="或填写已上传图片的地址" @update:model-value="emit('update:modelValue', $event)" />
  </div>
</template>
<style scoped>.image-field{display:flex;align-items:center;flex-wrap:wrap;gap:12px;width:100%}</style>
