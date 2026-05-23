<template>
  <div>
    <el-row :gutter="20">
      <el-col :span="8" v-for="card in cards" :key="card.label">
        <el-card class="stat" shadow="hover">
          <div class="stat__label">{{ card.label }}</div>
          <div class="stat__value">{{ card.value }}</div>
        </el-card>
      </el-col>
    </el-row>
  </div>
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
  { label: '已支付订单', value: data.value.orders_paid ?? '-' }
]);

onMounted(async () => {
  data.value = await getDashboard();
});
</script>

<style scoped>
.stat { margin-bottom: 20px; }
.stat__label { font-size: 14px; color: #999; }
.stat__value { font-size: 32px; font-weight: 600; margin-top: 12px; color: #1a1a1a; }
</style>
