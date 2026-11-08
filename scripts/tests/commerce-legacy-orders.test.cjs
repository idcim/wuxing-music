const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { create, act } = require('react-test-renderer');

function page(file, mocks) {
  const source = fs.readFileSync(path.join(__dirname, '../../src/packages/shop', file), 'utf8');
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, { exports, require: name => {
    if (!(name in mocks)) throw new Error(`未替换依赖 ${name}`);
    return mocks[name];
  } });
  return exports.default;
}

test('聚合列表中的历史会员订单进入对应详情', () => {
  const navigations = [];
  const mocks = {
    react: React, 'react/jsx-runtime': require('react/jsx-runtime'),
    '@tarojs/components': { View: 'view', Text: 'text', Button: 'button', Input: 'input', Textarea: 'textarea', Image: 'image' },
    '@tarojs/taro': { default: { navigateTo: options => navigations.push(options.url) }, useDidShow: () => {}, useRouter: () => ({ params: {} }) },
    '@/services/commerce': { shopPath: '/packages/shop', money: value => `¥${value / 100}` },
    '@/services/commerce-payment': {}, '@/services/commerce-upload': {},
    '@/features/commerce/common': {
      CommercePage: ({ children }) => React.createElement('page', null, children),
      Feedback: () => null, useData: () => ({ data: { items: [{ id: 1, legacy: true, kind: 'music',
        status: 'paid', amount_fen: 19900, order_no: 'legacy-001', items: [{ title: '音乐会员', quantity: 1 }] }], total: 101 },
        loading: false, error: '', load: async () => {} }),
    },
  };
  let renderer;
  act(() => { renderer = create(React.createElement(page('orders/index.tsx', mocks))); });
  try {
    const card = renderer.root.findAllByType('view').find(node => node.props.className === 'commerce__card commerce__card-body');
    act(() => { card.props.onClick(); });
    assert.deepEqual(navigations, ['/packages/shop/order/index?id=1&kind=music']);
  } finally { act(() => renderer.unmount()); }
});

test('历史会员礼物订单按归属接口加载详情并可复制兑换码', () => {
  const paths = [], copied = [];
  const mocks = {
    react: React, 'react/jsx-runtime': require('react/jsx-runtime'),
    '@tarojs/components': { View: 'view', Text: 'text', Button: 'button', Input: 'input', Textarea: 'textarea', Image: 'image' },
    '@tarojs/taro': { default: { setClipboardData: options => copied.push(options.data) }, useDidShow: () => {},
      useRouter: () => ({ params: { id: '1', kind: 'music' } }) },
    '@/services/commerce': { money: value => `¥${value / 100}`, useCommerce: select => select({ config: {} }) },
    '@/services/commerce-payment': {}, '@/services/commerce-upload': {},
    '@/features/commerce/common': {
      CommercePage: ({ children }) => React.createElement('page', null, children),
      Feedback: () => null, CustomerService: () => null,
      useData: path => { paths.push(path); return { data: { id: 1, kind: 'music', status: 'paid',
        order_no: 'legacy-001', amount_fen: 19900, refund_fen: 0, is_gift: true, gift_code: 'GIFT0001',
        items: [{ title: '音乐会员礼物卡' }] }, loading: false, error: '', load: async () => {} }; },
    },
  };
  let renderer;
  act(() => { renderer = create(React.createElement(page('order/index.tsx', mocks))); });
  try {
    assert.deepEqual(paths, ['/orders/music/1']);
    const copy = renderer.root.findAllByType('button').find(node => node.children.join('') === '复制兑换码');
    act(() => { copy.props.onClick(); });
    assert.deepEqual(copied, ['GIFT0001']);
  } finally { act(() => renderer.unmount()); }
});
