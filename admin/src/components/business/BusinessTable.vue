<script setup lang="ts">
import { ref } from 'vue';
import { ElTable } from 'element-plus';
defineOptions({ inheritAttrs: false });
const table = ref<InstanceType<typeof ElTable>>();
defineExpose({
  doLayout: () => table.value?.doLayout(),
  clearSelection: () => table.value?.clearSelection(),
  toggleRowSelection: (...args: Parameters<InstanceType<typeof ElTable>['toggleRowSelection']>) => table.value?.toggleRowSelection(...args),
});
</script>

<template>
  <ElTable ref="table" v-bind="$attrs" class="business-table" :border="false" size="default" native-scrollbar>
    <slot />
    <template v-if="$slots.empty" #empty><slot name="empty" /></template>
    <template v-if="$slots.append" #append><slot name="append" /></template>
  </ElTable>
</template>
