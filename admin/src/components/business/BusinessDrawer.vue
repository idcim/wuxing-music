<script setup lang="ts">
import { computed, useSlots, watch } from 'vue';
import { useVbenDrawer } from '@vben-core/popup-ui';
import { popupWidths } from './popup';
defineOptions({ inheritAttrs: false });
const props = withDefaults(defineProps<{ modelValue: boolean; title?: string; size?: string }>(), { title: '', size: '640px' });
const emit = defineEmits<{ 'update:modelValue': [boolean] }>();
const slots = useSlots();
const [Drawer, api] = useVbenDrawer({
  showCancelButton: false, showConfirmButton: false, openAutoFocus: false,
  destroyOnClose: false, zIndex: 1000,
  onOpenChange: value => { if (value !== props.modelValue) emit('update:modelValue', value); },
});
const drawerClass = computed(() => `business-drawer ${popupWidths[props.size] || 'w-[640px]'}`);
watch(() => props.modelValue, value => { if (value) api.open(); else api.close(); }, { immediate: true });
</script>
<template>
  <Drawer :title="title" :class="drawerClass" :footer="!!slots.footer" content-class="business-popup__content" footer-class="business-popup__footer">
    <slot /><template v-if="slots.footer" #footer><slot name="footer" /></template>
  </Drawer>
</template>
