import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import '@vben-core/design';
import 'element-plus/dist/index.css';
import 'element-plus/theme-chalk/dark/css-vars.css';
import './styles/global.css';
import './styles/business.css';
import * as ElementPlusIconsVue from '@element-plus/icons-vue';

import App from './App.vue';
import router from './router';
import { useSiteStore } from './stores/site';
import { initPreferences, updatePreferences } from '@vben/preferences';
import { addCollection } from '@iconify/vue';
import { icons as lucideIcons } from '@iconify-json/lucide';
import { installBusinessComponents } from './components/business';

async function bootstrap() {
  await initPreferences({
    namespace: 'wuxing-admin-vben-v1',
    overrides: {
      app: { defaultHomePath: '/dashboard', locale: 'zh-CN', enableCheckUpdates: true },
      theme: { mode: 'light', semiDarkSidebar: true },
      copyright: { enable: false },
    },
  });
  // 旧迁移强制关闭过更新检查；一次性修复该值，保留其余个人偏好。
  try {
    if (!localStorage.getItem('wuxing-admin-shell-tools-v1')) {
      updatePreferences({ app: { enableCheckUpdates: true } });
      localStorage.setItem('wuxing-admin-shell-tools-v1', '1');
    }
  } catch { /* 浏览器禁用存储时仍使用本次会话的默认设置。 */ }
  addCollection(lucideIcons);
  const app = createApp(App);

  for (const [key, comp] of Object.entries(ElementPlusIconsVue)) {
    app.component(key, comp as any);
  }

  app.use(createPinia());
  app.use(router);
  app.use(ElementPlus, { locale: zhCn });
  installBusinessComponents(app);
  app.mount('#app');

  // 站点品牌名（侧边栏 / 登录页 / 页签）：挂载后拉一次，公开接口，无需登录态
  useSiteStore().load();
}

bootstrap();
