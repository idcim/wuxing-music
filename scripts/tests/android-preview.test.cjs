const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');

function load(file, dependencies = {}, env = {}) {
  const compiled = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../../', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    setTimeout, clearTimeout, exports, process: { env }, require: name => {
      if (Object.hasOwn(dependencies, name)) return dependencies[name];
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  return exports;
}

test('安卓独立 API 地址不改变 H5 同源和小程序地址', () => {
  const env = { TARO_APP_ANDROID_API_BASE: 'https://api.example.test', TARO_APP_API_BASE: 'https://mini.example.test' };
  assert.equal(load('src/constants/env.ts', {}, { ...env, TARO_ENV: 'h5', TARO_APP_PLATFORM: 'android' }).API_BASE, env.TARO_APP_ANDROID_API_BASE);
  assert.equal(load('src/constants/env.ts', {}, { ...env, TARO_ENV: 'h5' }).API_BASE, '');
  assert.equal(load('src/constants/env.ts', {}, { ...env, TARO_ENV: 'weapp' }).API_BASE, env.TARO_APP_API_BASE);
});

test('安卓体验版不能创建会员或礼物订单，也不读取公众号购买开关', async () => {
  let requests = 0;
  const service = load('src/services/pay.ts', {
    '@tarojs/taro': { default: {} }, '@/constants/env': { USE_MOCK: false },
    '@/services/api': { request: () => { requests++; throw new Error('体验版不应调用下单接口'); }, ApiError: class extends Error {} },
    '@/utils/platform': { isWeapp: false, isH5: true, isAndroidApp: true },
    '@/services/wechat': { default: {} },
  });
  assert.equal(await service.getPurchaseStatus(), false);
  assert.equal((await service.purchasePlan('month')).reason, 'platform');
  assert.equal((await service.purchaseGift('month')).reason, 'platform');
  assert.equal(requests, 0);
});

test('安卓保留目录展示配置，但关闭售卖且阻止真实交易下单', async () => {
  const calls = [];
  const config = { courses_visible: true, shop_visible: true, courses_sale: true, shop_sale: true };
  const service = load('src/services/commerce.ts', {
    zustand: { create: init => {
      let state;
      state = init(value => { state = { ...state, ...value }; });
      return { getState: () => state };
    } },
    './api': { ApiError: class extends Error {}, request: async (url, options) => {
      calls.push({ url, options }); return config;
    } },
    '@/constants/env': { USE_MOCK: false }, '@/utils/platform': { isAndroidApp: true },
  });
  await service.useCommerce.getState().load();
  const actual = service.useCommerce.getState().config;
  assert.equal(actual.courses_visible, true);
  assert.equal(actual.shop_visible, true);
  assert.equal(actual.courses_sale, false);
  assert.equal(actual.shop_sale, false);
  assert.equal(config.courses_sale, true);
  await assert.rejects(service.commerceApi('/orders', 'POST', {}), /体验版/);
  await assert.rejects(service.commerceApi('/orders/123/pay', 'POST', {}), /体验版/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/mp/v2/config');
});

test('安卓硬件返回遵守页面栈，回到前台重新加载状态', async () => {
  const listeners = {};
  let depth = 2, backs = 0, minimized = 0, refreshed = 0;
  const service = load('src/services/android.ts', {
    '@tarojs/taro': { default: {
      getCurrentPages: () => Array(depth).fill({}), navigateBack: async () => { backs++; },
    } },
    '@/utils/platform': { isAndroidApp: true },
    '@capacitor/app': { App: {
      addListener: async (event, callback) => { listeners[event] = callback; },
      minimizeApp: async () => { minimized++; },
    } },
  });
  await service.setupAndroid(() => { refreshed++; });
  listeners.backButton();
  assert.equal(backs, 1);
  depth = 1;
  listeners.backButton();
  assert.equal(minimized, 1);
  listeners.appStateChange({ isActive: false });
  assert.equal(refreshed, 0);
  listeners.appStateChange({ isActive: true });
  assert.equal(refreshed, 1);
});

test('体验版登录入口说明能力范围，允许返回且不触发账号请求', async () => {
  const React = require('react');
  const { act, create } = require('react-test-renderer');
  let backs = 0, qrRequests = 0;
  const state = { user: null, loggingIn: false };
  const userStore = selector => selector(state);
  userStore.getState = () => state;
  const module = load('src/features/auth/AppLogin.tsx', {
    react: React, 'react/jsx-runtime': require('react/jsx-runtime'),
    '@/theme/withTheme': { withTheme: Page => Page },
    '@/theme': { THEMES: { starlight: { accent: '#84cc16' } } },
    '@tarojs/components': Object.fromEntries(['View','Text','Image','Input','Button','Checkbox','CheckboxGroup','Label'].map(name => [name, name.toLowerCase()])),
    '@tarojs/taro': { default: {}, useDidShow: () => {} },
    '@/components/Icon': { default: () => null },
    '@/stores/user': { useUserStore: userStore },
    '@/stores/site': { useSiteStore: selector => selector({ site: { site_name: '体验测试', theme_id: 'starlight' } }) },
    '@/services/appWechat': { appWechatAvailable: async () => false, cancelAppWechatLogin: () => {} },
    '@/services/auth': { isQrLoginConfigured: () => { qrRequests++; return Promise.resolve(true); } },
    '@/utils/platform': { isAndroidApp: true, isWeapp: false, isInWeChat: false },
    '@/utils/nav': { goBack: () => { backs++; }, navBarStyle: () => ({}) },
    '@/services/appAuth': { appSmsAvailable: async () => false, cancelAppSmsLogin: () => {} },
    '@/utils/url': { resolveUrl: value => value }, './app-auth.scss': {},
  });
  let renderer;
  await act(async () => { renderer = create(React.createElement(module.default)); });
  try {
    assert.equal(renderer.root.findAllByType('input').length, 0);
    assert.equal(qrRequests, 0);
    assert.ok(renderer.root.findAllByType('text').some(node => node.children.join('').includes('短信登录暂未开启')));
    await act(async () => { renderer.root.findAllByType('button').find(node => node.props.className === 'app-auth__guest').props.onClick(); });
    assert.equal(backs, 1);
  } finally { act(() => renderer.unmount()); }
});

// 用同一个真实页面验证未勾选、取消授权、游客返回；不调用外部账号。
test('安卓微信授权需自主勾选，拒绝后仍可返回游客浏览', async () => {
  const React = require('react');
  const { act, create } = require('react-test-renderer');
  let backs = 0, logins = 0, toasts = [], routes = [];
  const state = { user: null, loggingIn: false };
  const userStore = selector => selector(state);
  userStore.getState = () => state;
  const module = load('src/features/auth/AppLogin.tsx', {
    react: React, 'react/jsx-runtime': require('react/jsx-runtime'),
    '@/theme/withTheme': { withTheme: Page => Page },
    '@/theme': { THEMES: { starlight: { accent: '#84cc16' } } },
    '@tarojs/components': Object.fromEntries(['View','Text','Image','Input','Button','Checkbox','CheckboxGroup','Label'].map(name => [name, name.toLowerCase()])),
    '@tarojs/taro': { default: { showToast: ({ title }) => toasts.push(title), navigateTo: ({ url }) => routes.push(url) }, useDidShow: () => {} },
    '@/components/Icon': { default: () => null }, '@/stores/user': { useUserStore: userStore },
    '@/stores/site': { useSiteStore: selector => selector({ site: { site_name: '体验测试', theme_id: 'starlight' } }) },
    '@/services/auth': {},
    '@/services/appWechat': { appWechatAvailable: async () => true, cancelAppWechatLogin: () => {}, loginByAppWechat: async () => { logins++; throw new Error('已取消微信登录'); } },
    '@/utils/platform': { isAndroidApp: true, isWeapp: false, isInWeChat: false },
    '@/utils/nav': { goBack: () => { backs++; }, navBarStyle: () => ({}) },
    '@/services/appAuth': { appSmsAvailable: async () => false, cancelAppSmsLogin: () => {} },
    '@/utils/url': { resolveUrl: value => value }, './app-auth.scss': {},
  });
  let renderer;
  await act(async () => { renderer = create(React.createElement(module.default)); });
  try {
    assert.equal(logins, 0);
    assert.equal(renderer.root.findByType('checkbox').props.checked, false);
    const loginButton = () => renderer.root.findAllByType('button').find(node => /app-auth__wechat/.test(node.props.className || ''));
    await act(async () => { await loginButton().props.onClick(); });
    assert.equal(logins, 0);
    assert.ok(toasts[0].includes('勾选'));
    await act(async () => { renderer.root.findByType('checkboxgroup').props.onChange({ detail: { value: ['agreed'] } }); });
    await act(async () => { await loginButton().props.onClick(); });
    assert.equal(logins, 1);
    assert.ok(toasts.includes('已取消微信登录'));
    await act(async () => { renderer.root.findAllByType('text').find(node => node.children.join('') === '《隐私政策》').props.onClick(); });
    assert.deepEqual(routes, ['/pages/agreement/index?kind=app-privacy']);
    assert.equal(renderer.root.findByType('checkbox').props.checked, true);
    await act(async () => { renderer.root.findByType('checkboxgroup').props.onChange({ detail: { value: [] } }); });
    assert.equal(renderer.root.findByType('checkbox').props.checked, false);
    await act(async () => { await loginButton().props.onClick(); });
    assert.equal(logins, 1);
    await act(async () => { renderer.root.findAllByType('button').find(node => node.props.className === 'app-auth__guest').props.onClick(); });
    assert.equal(backs, 1);
  } finally { act(() => renderer.unmount()); }
});

test('安卓微信服务校验 SDK state，凭据只交服务端并保存统一登录态', async () => {
  let authorizations = 0, stored = {}, loginRequests = 0;
  let mismatch = true;
  const user = { id: 42 };
  const service = load('src/services/appWechat.ts', {
    '@capacitor/core': { registerPlugin: () => ({ authorize: async ({ state }) => { authorizations++; return { state: mismatch ? 'forged' : state, code: 'sdk-code' }; } }) },
    '@/services/api': { request: async (url, options) => {
      // 纯模拟 SDK 不要求真实 AppID 格式，使用明确的测试占位符。
      if (url.endsWith('/config')) return { enabled: true, app_id: 'unit-test-wechat-app', android_package: 'cn.azureglow.wuxing.preview', android_signature: 'a'.repeat(32) };
      if (url.endsWith('/challenge')) return { state: 'server-state', proof: 'server-proof' };
      if (url.endsWith('/login')) { loginRequests++; assert.equal(options.data.proof, 'server-proof'); return { token: 'user-token', user }; }
      throw new Error(url);
    } },
    '@/services/storage': { storage: { set: (key, value) => stored[key] = value }, STORAGE_KEYS: { USER: 'user' } },
    '@/constants/env': { TOKEN_KEY: 'token' }, '@/utils/platform': { isAndroidApp: true },
  });
  await assert.rejects(service.loginByAppWechat(), /校验失败/);
  assert.equal(loginRequests, 0);
  mismatch = false;
  const first = service.loginByAppWechat(), second = service.loginByAppWechat();
  assert.equal(first, second);
  assert.equal(await first, user);
  assert.equal(authorizations, 2);
  assert.equal(loginRequests, 1);
  assert.equal(stored.token, 'user-token');
  assert.equal(stored.user, user);
});

test('安卓登录等待服务端期间取消，迟到响应不会保存登录态', async () => {
  let finishLogin, requests = 0, saved = 0, cancelled = 0;
  const started = new Promise(resolve => { finishLogin = resolve; });
  const service = load('src/services/appWechat.ts', {
    '@capacitor/core': { registerPlugin: () => ({
      authorize: async ({ state }) => ({ state, code: 'sdk-code' }),
      cancel: async () => { cancelled++; },
    }) },
    '@/services/api': { request: async url => {
      if (url.endsWith('/config')) return { enabled: true };
      if (url.endsWith('/challenge')) return { state: 'server-state', proof: 'server-proof' };
      requests++;
      return started;
    } },
    '@/services/storage': { storage: { set: () => saved++ }, STORAGE_KEYS: { USER: 'user' } },
    '@/constants/env': { TOKEN_KEY: 'token' }, '@/utils/platform': { isAndroidApp: true },
  });
  const login = service.loginByAppWechat();
  // Promise microtasks drive config → challenge → SDK → backend, without a real timer.
  for (let i = 0; i < 20 && requests === 0; i++) await Promise.resolve();
  assert.equal(requests, 1);
  service.cancelAppWechatLogin();
  finishLogin({ token: 'late-token', user: { id: 42 } });
  await assert.rejects(login, /已取消/);
  assert.equal(cancelled, 1);
  assert.equal(saved, 0);
});
