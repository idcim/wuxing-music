<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { QuestionFilled, Reading, Clock, InfoFilled } from '@element-plus/icons-vue';
import { useRouter } from 'vue-router';
import { getSiteInfo } from '@/api';
import { NAV_ALL } from '@/menu';
import { useAuthStore } from '@/stores/auth';
import { useSiteStore } from '@/stores/site';
import { renderMarkdown } from '@/utils/markdown';
import release from '../../../../version.json';

const emit = defineEmits<{ checkUpdates: [] }>();
const router = useRouter();
const auth = useAuthStore();
const site = useSiteStore();
const open = ref(false);
const tab = ref('guide');
const entries = [
  { tab: 'guide', label: '使用教程', icon: Reading },
  { tab: 'updates', label: '版本更新', icon: Clock },
  { tab: 'about', label: '关于我们', icon: InfoFilled },
];
function showHelp(value: string) {
  if (!entries.some(entry => entry.tab === value)) return;
  tab.value = value;
  open.value = true;
}
const about = ref('');
const aboutLoading = ref(false);
const aboutError = ref(false);
const buildId = __ADMIN_BUILD_ID__.slice(0, 8);
const guides = [
  { title: '日常工作从哪里开始', steps: [
    { text: '从仪表盘查看用户、曲目和订单概况。', path: '/dashboard' },
    { text: '在歌曲管理上传封面与音频，保存曲目后可在音频任务历史查看处理结果。', path: '/tracks' },
    { text: '在风格管理切换小程序和 App 使用的视觉风格。', path: '/theme' },
  ] },
  { title: '上架课程与商品', steps: [
    { text: '在课程与商品录入分类、封面、介绍、价格及库存；内容先保存为草稿，确认资料后再上架。', path: '/commerce-catalog' },
    { text: '在课件与任务将课程音视频原样上传 OSS，再关联到课程章节；不需要等待转码。', path: '/commerce-media' },
    { text: '运营海报、配送和交易渠道设置在课程商城配置。售卖开关与展示开关分别管理。', path: '/commerce-settings' },
  ] },
  { title: '处理订单与售后', steps: [
    { text: '在课程商城订单处理实物发货、售后与退款；发货后填写快递公司和运单号。', path: '/commerce-trades' },
    { text: '音乐会员购买记录与退款在音乐会员订单中查看。', path: '/orders' },
  ] },
  { title: '账号与配置', steps: [
    { text: '在用户管理查看账号、会员权益与历史记录。', path: '/users' },
    { text: '项目名称、关于我们、服务条款等内容在站点设置维护。', path: '/settings' },
    { text: '由管理员在角色权限中授予操作权限，内容编辑、发货与退款应分别授权。', path: '/roles' },
  ] },
  { title: 'APP 下载、更新与微信登录', steps: [
    { text: '在 APP 管理的“基础与下载”维护介绍和安装说明，复制无需登录的固定下载页地址。', path: '/apps' },
    { text: '在“版本发布”上传 APK 到 OSS，核验包名与版本后填写更新说明，保存草稿，再单独发布并开放下载。后续升级需要保持包名与签名一致，并提高版本代码。', path: '/apps' },
    { text: '在“微信登录”填写开放平台移动应用 AppID、AppSecret、包名和证书 MD5，补充隐私政策后启用。移动应用参数与小程序、网站扫码参数分别管理。', path: '/apps' },
  ] },
];
const available = (path: string) => {
  const item = NAV_ALL.find(entry => entry.path === path);
  return !!item && auth.can(item.perm) && auth.hasFeature(item.feature);
};
const visibleGuides = computed(() => guides.map(group => ({
  ...group, steps: group.steps.filter(step => available(step.path)),
})).filter(group => group.steps.length));
const aboutHtml = computed(() => renderMarkdown(about.value));

async function loadAbout() {
  if (aboutLoading.value) return;
  aboutLoading.value = true;
  aboutError.value = false;
  try {
    const info = await getSiteInfo();
    about.value = typeof info?.about_us === 'string' ? info.about_us : '';
  } catch {
    aboutError.value = true;
  } finally { aboutLoading.value = false; }
}
watch([open, tab], ([isOpen, current]) => { if (isOpen && current === 'about') void loadAbout(); });
function navigate(path: string) { open.value = false; void router.push(path); }
</script>

<template>
  <nav class="help-links" aria-label="使用教程与站点信息">
    <el-button v-for="entry in entries" :key="entry.tab" text class="help-trigger" :aria-label="entry.label" @click="showHelp(entry.tab)">
      <el-icon><component :is="entry.icon" /></el-icon><span>{{ entry.label }}</span>
    </el-button>
  </nav>
  <el-dropdown class="help-compact" trigger="click" @command="showHelp">
    <el-button text class="help-trigger" aria-label="教程与帮助"><el-icon><QuestionFilled /></el-icon><span>教程与帮助</span></el-button>
    <template #dropdown><el-dropdown-menu><el-dropdown-item v-for="entry in entries" :key="entry.tab" :command="entry.tab">{{ entry.label }}</el-dropdown-item></el-dropdown-menu></template>
  </el-dropdown>
  <BusinessDrawer v-model="open" title="帮助中心" size="640px">
    <el-tabs v-model="tab">
      <el-tab-pane label="使用教程" name="guide">
        <p class="help-intro">按下面的顺序完成常见工作；只显示你有权限访问的页面。</p>
        <section v-for="group in visibleGuides" :key="group.title" class="help-section">
          <h3>{{ group.title }}</h3>
          <ol><li v-for="step in group.steps" :key="step.text"><span>{{ step.text }}</span><el-button link type="primary" @click="navigate(step.path)">前往页面</el-button></li></ol>
        </section>
        <el-empty v-if="!visibleGuides.length" description="当前账号暂无可用教程页面" />
      </el-tab-pane>
      <el-tab-pane label="版本更新" name="updates">
        <div class="help-version"><div><strong>当前源码版本 {{ release.current.app }}</strong><p>后台构建标识 {{ buildId }}</p></div><el-button @click="emit('checkUpdates')">检查后台更新</el-button></div>
        <p class="help-intro">自动检测更新可在页头“偏好设置”中开启；这里列出版本发布记录。</p>
        <el-timeline>
          <el-timeline-item v-for="item in release.changelog.slice(0, 8)" :key="item.version" :timestamp="item.date" placement="top">
            <strong>{{ item.version }}</strong><ul><li v-for="note in item.notes" :key="note">{{ note }}</li></ul>
          </el-timeline-item>
        </el-timeline>
      </el-tab-pane>
      <el-tab-pane label="关于我们" name="about">
        <h3>{{ site.name }}</h3>
        <div v-loading="aboutLoading" class="help-about">
          <el-alert v-if="aboutError" type="warning" :closable="false" title="关于我们暂时加载失败"><el-button link type="primary" @click="loadAbout">重新加载</el-button></el-alert>
          <div v-else-if="about" class="help-markdown" v-html="aboutHtml" />
          <p v-else-if="!aboutLoading" class="help-intro">关于我们尚未填写，可在站点设置的“站点信息”中维护。</p>
        </div>
        <el-button v-if="available('/settings')" @click="navigate('/settings')">编辑站点信息</el-button>
      </el-tab-pane>
    </el-tabs>
  </BusinessDrawer>
</template>

<style scoped>
.help-links { display: flex; align-items: center; white-space: nowrap; }
.help-links .el-button + .el-button { margin-left: 0; }
.help-trigger { gap: 5px; padding: 8px; }
.help-compact { display: none; }
.help-intro, .help-version p { color: var(--el-text-color-secondary); line-height: 1.7; }
.help-section { margin: 20px 0; }
.help-section h3 { margin: 0 0 10px; font-size: 15px; }
.help-section ol { padding-left: 22px; }
.help-section li { margin: 10px 0; line-height: 1.7; }
.help-section li .el-button { margin-left: 8px; }
.help-version { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 0; }
.help-version p { margin: 4px 0 0; font-size: 12px; }
.help-about { min-height: 80px; margin-bottom: 16px; }
.help-markdown { line-height: 1.8; overflow-wrap: anywhere; }
.help-markdown :deep(h1), .help-markdown :deep(h2), .help-markdown :deep(h3) { margin: 14px 0 8px; }
.help-markdown :deep(a) { color: var(--el-color-primary); }
@media (max-width: 1100px) {
  .help-links { display: none; }
  .help-compact { display: inline-flex; }
}
</style>
