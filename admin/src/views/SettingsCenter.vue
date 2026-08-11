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
    <el-tab-pane label="开放平台" name="open">
      <OpenPanel v-if="loaded.open" />
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
  </el-tabs>
  <!-- 代理分成的设置已移到 侧边栏「代理分成 → 分成设置」（/agent-settings），
       与代理管理、分成明细、提现审核收在同一个独立菜单里，不在这儿开第二个入口 -->
</template>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import Site from './Site.vue';
import MpPanel from './MpPanel.vue';
import OaPanel from './OaPanel.vue';
import OpenPanel from './OpenPanel.vue';
import SmsPanel from './SmsPanel.vue';
import Storage from './Storage.vue';
import Settings from './Settings.vue';

const tab = ref('site');
// 懒加载各 tab：切到时才挂载，避免一次性发起全部请求
const loaded = reactive({ site: true, mp: false, oa: false, open: false, sms: false, storage: false, pay: false });

watch(tab, (t) => {
  if (t === 'mp') loaded.mp = true;
  if (t === 'oa') loaded.oa = true;
  if (t === 'open') loaded.open = true;
  if (t === 'sms') loaded.sms = true;
  if (t === 'storage') loaded.storage = true;
  if (t === 'pay') loaded.pay = true;
});
</script>

<style scoped>
.settings-tabs :deep(.el-tabs__content) {
  padding-top: 8px;
}
</style>
