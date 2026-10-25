<template>
  <BusinessPage :card="false">
      <div class="stats-grid">
        <BusinessCard v-for="card in cards" :key="card.label" class="stat">
          <div class="stat__label">{{ card.label }}</div>
          <div class="stat__value">{{ card.value }}</div>
        </BusinessCard>
      </div>

  </BusinessPage>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { getDashboard } from '@/api';

const data = ref<any>({});

const cards = computed(() => [
  { label: '注册用户', value: data.value.users ?? '-' },
  { label: '付费会员', value: data.value.premium_users ?? '-' },
  { label: '曲目总数', value: data.value.tracks ?? '-' },
  { label: '兑换码总数', value: data.value.cdkeys_total ?? '-' },
  { label: '已用兑换码', value: data.value.cdkeys_used ?? '-' },
  { label: '已支付订单', value: data.value.orders_paid ?? '-' },
  { label: '已退款订单', value: data.value.orders_refunded ?? '-' }
]);

onMounted(async () => {
  data.value = await getDashboard();
});
</script>

<style scoped>
.stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 20px; }
.stat__label { font-size: 14px; color: var(--el-text-color-secondary); }
.stat__value { font-size: 32px; font-weight: 600; margin-top: 12px; color: var(--el-text-color-primary); }
</style>
