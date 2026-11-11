const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { act, create } = require('react-test-renderer');

test('会员状态未确认或查询失败时不展示可购买入口', async () => {
  const toasts = [];
  let purchases = 0;
  let status = 'error';
  let onShow;
  const plan = { id: 'month', name: '月悦', en: 'Monthly', price: 18, features: [] };
  const userState = { user: null, isPremium: false, element: null, updateMembership: () => {} };
  const useUserStore = selector => selector(userState);
  useUserStore.getState = () => userState;
  const mocks = {
    react: React,
    'react/jsx-runtime': require('react/jsx-runtime'),
    '@tarojs/components': { View: 'view', Text: 'text' },
    '@tarojs/taro': {
      default: { showToast: options => toasts.push(options.title), showModal: () => {} },
      useDidShow: callback => { onShow = callback; React.useEffect(callback, []); },
      useShareAppMessage: () => {}, useShareTimeline: () => {},
    },
    '@/constants/plans': { PLANS: [plan] },
    '@/constants/wuxing': { ELEMENT_LIST: [] },
    '@/services/pay': {
      purchasePlan: async () => { purchases++; return { ok: false, reason: 'fail' }; },
      purchaseGift: async () => { purchases++; return { ok: false, reason: 'fail' }; },
      getPurchaseStatus: async () => { if (status === 'error') throw new Error('502'); return true; },
      fetchPlans: async () => [],
    },
    '@/stores/user': { useUserStore },
    '@/stores/site': { siteName: () => '律音' },
    '@/services/auth': { fetchProfile: async () => userState.user },
    '@/utils/share': { openShareMenu: () => {}, setH5Share: () => {} },
    '@/components/Icon': { default: () => null },
    '@/utils/nav': { navTopStyle: () => ({}) },
    '@/components/MiniPlayer': { default: () => null },
    '@/components/CdkeyModal': { default: () => null },
    '@/components/PosterShare': { default: () => null },
    '@/components/TabBar': { default: () => null },
    './index.scss': {},
  };
  const source = fs.readFileSync(path.join(__dirname, '../../src/pages/member/index.tsx'), 'utf8');
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, { exports, require: name => {
    if (!(name in mocks)) throw new Error(`未替换依赖 ${name}`);
    return mocks[name];
  } });
  let renderer;
  await act(async () => { renderer = create(React.createElement(exports.default)); });
  try {
    const labels = renderer.root.findAllByType('text').map(node => node.children.join(''));
    assert.ok(labels.includes('暂未开放'));
    assert.ok(!labels.includes('立即开通'));
    const button = renderer.root.findAll(node => typeof node.props.className === 'string'
      && node.props.className.includes('member__plan-btn') && typeof node.props.onClick === 'function')[0];
    assert.ok(button);
    await act(async () => { button.props.onClick(); });
    assert.equal(purchases, 0);
    assert.deepEqual(toasts, ['暂未开放']);

    status = 'ready';
    await act(async () => { onShow(); });
    assert.ok(renderer.root.findAllByType('text').some(node => node.children.join('') === '立即开通'));
    status = 'error';
    await act(async () => { onShow(); });
    assert.ok(renderer.root.findAllByType('text').some(node => node.children.join('') === '暂未开放'));
  } finally {
    act(() => renderer.unmount());
  }
});
