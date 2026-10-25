<script setup lang="ts">
import { computed, useSlots, watch } from 'vue';
import { useVbenModal } from '@vben-core/popup-ui';
import { popupWidths } from './popup';
defineOptions({ inheritAttrs: false });
const props = withDefaults(defineProps<{ modelValue: boolean; title?: string; width?: string; closeOnClickModal?: boolean }>(), {
  title: '', width: '560px', closeOnClickModal: false,
});
const emit = defineEmits<{ 'update:modelValue': [boolean] }>();
const slots = useSlots();
const [Modal, api] = useVbenModal({
  fullscreenButton: false, bordered: true, destroyOnClose: false,
  showCancelButton: false, showConfirmButton: false, openAutoFocus: false,
  zIndex: 1000,
  onOpenChange: value => { if (value !== props.modelValue) emit('update:modelValue', value); },
});
const modalClass = computed(() => `business-modal ${popupWidths[props.width] || 'w-[560px]'}`);
watch(() => props.modelValue, value => { if (value) api.open(); else api.close(); }, { immediate: true });
</script>

<template>
  <Modal :title="title" :class="modalClass" :footer="!!slots.footer" :close-on-click-modal="closeOnClickModal" content-class="business-popup__content" footer-class="business-popup__footer">
    <slot /><template v-if="slots.footer" #footer><slot name="footer" /></template>
  </Modal>
</template>
