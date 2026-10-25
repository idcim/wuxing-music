<script setup lang="ts">
import { ElPagination } from 'element-plus';
defineOptions({ inheritAttrs: false });
</script>
<template><ElPagination v-bind="$attrs" class="business-pagination" background /></template>
