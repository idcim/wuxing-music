<script setup lang="ts">
import { Card, CardContent, CardHeader } from '@vben-core/shadcn-ui';
defineProps<{ shadow?: string }>();
</script>

<template>
  <Card class="business-card">
    <CardHeader v-if="$slots.header" class="business-card__header"><slot name="header" /></CardHeader>
    <CardContent class="business-card__body"><slot /></CardContent>
  </Card>
</template>
