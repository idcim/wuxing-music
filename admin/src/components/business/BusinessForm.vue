<script setup lang="ts">
import { ElForm } from 'element-plus';
import { ref } from 'vue';
defineOptions({ inheritAttrs: false });
const form = ref<InstanceType<typeof ElForm>>();
defineExpose({
  validate: (...args: Parameters<InstanceType<typeof ElForm>['validate']>) => form.value?.validate(...args),
  clearValidate: (...args: Parameters<InstanceType<typeof ElForm>['clearValidate']>) => form.value?.clearValidate(...args),
  resetFields: (...args: Parameters<InstanceType<typeof ElForm>['resetFields']>) => form.value?.resetFields(...args),
});
</script>

<template>
  <ElForm ref="form" v-bind="$attrs" class="business-form" label-position="top"><slot /></ElForm>
</template>
