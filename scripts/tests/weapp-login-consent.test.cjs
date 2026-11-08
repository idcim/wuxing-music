const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { act, create } = require('react-test-renderer');

test('小程序微信登录由用户选择协议，拒绝后仍可作为游客返回', async () => {
  const calls = { login: 0, privacy: 0, back: 0, routes: [], toasts: [] };
  const userState = { user: null, loggingIn: false, login: async () => { calls.login++; } };
  const useUserStore = selector => selector(userState);
  useUserStore.getState = () => userState;
  const mocks = {
    react: React,
    'react/jsx-runtime': require('react/jsx-runtime'),
    '@tarojs/components': Object.fromEntries(['View', 'Text', 'Input', 'Checkbox', 'CheckboxGroup'].map(name => [name, name.toLowerCase()])),
    '@tarojs/taro': { default: { showToast: options => { calls.toasts.push(options.title); },
      reLaunch: options => { calls.routes.push(options.url); }, navigateTo: () => {} }, useDidShow: () => {} },
    '@/components/Icon': { default: () => React.createElement('icon') },
    '@/stores/user': { useUserStore },
    '@/stores/site': { useSiteStore: selector => selector({ site: { site_name: '测试品牌' } }) },
    '@/services/auth': { sendSmsCode: async () => {}, isQrLoginConfigured: async () => false },
    '@/utils/platform': { isWeapp: true, isInWeChat: true },
    '@/utils/nav': { goBack: () => { calls.back++; }, navBarStyle: () => ({}) },
    '@/services/privacy': { openWeappPrivacyPolicy: () => { calls.privacy++; } },
    './index.scss': {},
  };
  const source = fs.readFileSync(path.join(__dirname, '../../src/pages/login/index.tsx'), 'utf8');
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, { exports, require: name => {
    if (!(name in mocks)) throw new Error(name);
    return mocks[name];
  } });
  let renderer;
  await act(async () => { renderer = create(React.createElement(exports.default)); });
  try {
    const loginButton = () => renderer.root.findAllByType('view').find(node =>
      node.props.className?.includes('login__btn') && node.props.onClick);
    const checkbox = () => renderer.root.findByType('checkbox');
    assert.equal(checkbox().props.checked, false);
    await act(async () => { await loginButton().props.onClick(); });
    assert.equal(calls.login, 0);
    assert.match(calls.toasts[0], /勾选/);
    await act(async () => { renderer.root.findAllByType('view').find(node => node.props.className === 'login__guest').props.onClick(); });
    assert.equal(calls.back, 1);
    await act(async () => { renderer.root.findByType('checkboxgroup').props.onChange({ detail: { value: ['agreed'] } }); });
    assert.equal(checkbox().props.checked, true);
    await act(async () => { await loginButton().props.onClick(); });
    assert.equal(calls.login, 1);
    assert.deepEqual(calls.routes, ['/pages/home/index']);
    await act(async () => { renderer.root.findAllByType('text').find(node => node.children.join('') === '《隐私政策》').props.onClick(); });
    assert.equal(calls.privacy, 1);
  } finally {
    act(() => renderer.unmount());
  }
});
