<template>
  <el-tabs v-model="tab" class="settings-tabs">
    <el-tab-pane label="站点信息" name="site">
      <Site v-if="loaded.site" />
    </el-tab-pane>
    <el-tab-pane label="小程序" name="mp">
      <MpPanel v-if="loaded.mp" />
    </el-tab-pane>
    <el-tab-pane label="公众号" name="oa">
      <OaPanel v-if="loaded.oa" />
    </el-tab-pane>
    <el-tab-pane label="短信" name="sms">
      <SmsPanel v-if="loaded.sms" />
    </el-tab-pane>
    <el-tab-pane label="文件存储" name="storage">
      <Storage v-if="loaded.storage" />
    </el-tab-pane>
    <el-tab-pane label="支付设置" name="pay">
      <Settings v-if="loaded.pay" />
    </el-tab-pane>
    <!-- 代理分成：这个面板**常驻**，它是整个模块唯一的开启入口，
         跟着 feature 开关一起隐藏就没人能把模块打开了 -->
    <el-tab-pane label="代理分成" name="agent">
      <AgentPanel v-if="loaded.agent" />
    </el-tab-pane>
  </el-tabs>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import Site from './Site.vue';
import MpPanel from './MpPanel.vue';
import OaPanel from './OaPanel.vue';
import SmsPanel from './SmsPanel.vue';
import Storage from './Storage.vue';
import Settings from './Settings.vue';
import AgentPanel from './AgentPanel.vue';

const tab = ref('site');
// 懒加载各 tab：切到时才挂载，避免一次性发起全部请求
const loaded = reactive({
  site: true, mp: false, oa: false, sms: false, storage: false, pay: false, agent: false,
});

watch(tab, (t) => {
  if (t === 'mp') loaded.mp = true;
  if (t === 'oa') loaded.oa = true;
  if (t === 'sms') loaded.sms = true;
  if (t === 'storage') loaded.storage = true;
  if (t === 'pay') loaded.pay = true;
  if (t === 'agent') loaded.agent = true;
});
</script>

<style scoped>
.settings-tabs :deep(.el-tabs__content) {
  padding-top: 8px;
}
</style>
