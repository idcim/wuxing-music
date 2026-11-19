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
    exports, process: { env }, require: name => {
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
  const module = load('src/pages/login/index.tsx', {
    react: React, 'react/jsx-runtime': require('react/jsx-runtime'),
    '@/theme/withTheme': { withTheme: Page => Page },
    '@/theme': { THEMES: { starlight: { accent: '#84cc16' } } },
    '@tarojs/components': Object.fromEntries(['View','Text','Input','Checkbox','CheckboxGroup'].map(name => [name, name.toLowerCase()])),
    '@tarojs/taro': { default: {}, useDidShow: () => {} },
    '@/components/Icon': { default: () => null },
    '@/stores/user': { useUserStore: userStore },
    '@/stores/site': { useSiteStore: selector => selector({ site: { site_name: '体验测试', theme_id: 'starlight' } }) },
    '@/services/auth': { isQrLoginConfigured: () => { qrRequests++; return Promise.resolve(true); } },
    '@/utils/platform': { isAndroidApp: true, isWeapp: false, isInWeChat: false },
    '@/utils/nav': { goBack: () => { backs++; }, navBarStyle: () => ({}) },
    '@/services/privacy': {}, './index.scss': {},
  });
  let renderer;
  await act(async () => { renderer = create(React.createElement(module.default)); });
  try {
    assert.equal(renderer.root.findAllByType('input').length, 0);
    assert.equal(qrRequests, 0);
    assert.ok(renderer.root.findAllByType('text').some(node => node.children.join('').includes('账号登录将在后续版本开放')));
    await act(async () => { renderer.root.findAllByType('view').find(node => node.props.className === 'login__guest').props.onClick(); });
    assert.equal(backs, 1);
  } finally { act(() => renderer.unmount()); }
});
