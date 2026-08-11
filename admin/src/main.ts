import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import './styles/global.css';
import * as ElementPlusIconsVue from '@element-plus/icons-vue';

import App from './App.vue';
import router from './router';
import { useSiteStore } from './stores/site';

const app = createApp(App);

for (const [key, comp] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, comp as any);
}

app.use(createPinia());
app.use(router);
app.use(ElementPlus);
app.mount('#app');

// 站点品牌名（侧边栏 / 登录页 / 页签）：挂载后拉一次，公开接口，无需登录态
useSiteStore().load();
