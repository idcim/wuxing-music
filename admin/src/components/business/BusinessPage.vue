<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import Page from '../../../vendor/vben-page/page.vue';
import BusinessCard from './BusinessCard.vue';

const props = withDefaults(defineProps<{ title?: string; description?: string; card?: boolean }>(), { card: true });
const route = useRoute();
const descriptions: Record<string, string> = {
  '/dashboard': '查看用户、会员、内容与订单的运营概况。',
  '/tracks': '管理音乐内容、音频版本与发布状态，处理任务在后台继续执行。',
  '/audio-history': '追踪每次音频处理的结果、失败原因与重试记录。',
  '/users': '查看用户资料、会员权益与跨端账号信息。',
  '/orders': '查询购买与支付记录，按权限处理退款和订单维护。',
  '/elements': '维护五音文化内容、展示文案与主题配色。',
  '/plans': '维护会员套餐、售价及有效期。',
  '/cdkeys': '生成、查询与管理会员兑换码。',
  '/quiz': '维护测评题目、选项及五行评分。',
  '/admins': '管理后台账号、角色分配及访问状态。',
  '/roles': '按职责配置权限，业务操作仍由服务端校验。',
  '/settings': '统一维护站点、微信平台、短信、存储与支付配置。',
  '/agents': '查看代理业绩、推广关系与结算余额。',
  '/commissions': '查询订单分成、结算状态与退款冲正。',
  '/withdrawals': '审核提现申请并查看打款进度。',
  '/agent-settings': '设置代理模块开关、计酬规则与结算方式。',
};
const title = computed(() => props.title || String(route.meta.title || ''));
const description = computed(() => props.description ?? descriptions[route.path] ?? '');
</script>

<template>
  <Page :title="title" :description="description" class="business-page" header-class="business-page__header" content-class="business-page__content">
    <template v-if="$slots.extra" #extra><slot name="extra" /></template>
    <BusinessCard v-if="card"><slot /></BusinessCard>
    <slot v-else />
    <template v-if="$slots.footer" #footer><slot name="footer" /></template>
  </Page>
</template>
