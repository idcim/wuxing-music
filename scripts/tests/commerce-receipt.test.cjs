const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { act, create } = require('react-test-renderer');

async function receiptScenario(confirmReceipt, receive = async () => {}) {
  const calls = [];
  let onShow;
  const order = { id: 42, kind: 'physical', status: 'paid', fulfillment: 'shipped',
    transaction_id: 'wx-transaction', order_no: 'C42', amount_fen: 1000, shipping_fen: 0,
    refund_fen: 0, items: [], aftersales: [], address: {} };
  const mocks = {
    react: React,
    'react/jsx-runtime': require('react/jsx-runtime'),
    '@tarojs/components': Object.fromEntries(['View', 'Text', 'Button', 'Input', 'Textarea', 'Image'].map(name => [name, name.toLowerCase()])),
    '@tarojs/taro': { default: { showModal: async () => ({ confirm: true }) }, useRouter: () => ({ params: { id: '42' } }),
      useDidShow: callback => { onShow = callback; } },
    '@/services/commerce': { commerceApi: async url => { calls.push(url); await receive(); }, shopPath: '/packages/shop', coursePath: '/packages/courses',
      money: amount => `¥${(amount / 100).toFixed(2)}`, useCommerce: selector => selector({ config: {} }) },
    '@/services/commerce-payment': { confirmCommerceReceipt: confirmReceipt,
      openCommerceLogistics: async () => {}, payCommerceOrder: async () => {}, refundWechatCode: async () => '' },
    '@/services/commerce-upload': { uploadCommerceImage: async () => '' },
    '@/features/commerce/common': { CommercePage: ({ children }) => React.createElement('page', null, children),
      CustomerService: () => React.createElement('service'), Feedback: () => React.createElement('feedback'),
      useData: () => ({ data: order, loading: false, error: '', load: async () => {} }),
      action: async work => { try { await work(); } catch { /* 用户取消 */ } } },
  };
  const source = fs.readFileSync(path.join(__dirname, '../../src/packages/shop/order/index.tsx'), 'utf8');
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
    const receipt = renderer.root.findAllByType('button').find(button => button.children.join('') === '确认收货');
    await act(async () => { await receipt.props.onClick(); });
    await act(async () => { onShow(); });
    return calls;
  } finally {
    act(() => renderer.unmount());
  }
}

test('取消微信确认收货后返回订单页不触发收货核验', async () => {
  const calls = await receiptScenario(async () => { throw new Error('用户取消'); });
  assert.deepEqual(calls, []);
});

test('微信确认收货成功后才核验订单', async () => {
  const calls = await receiptScenario(async () => {});
  assert.deepEqual(calls, ['/orders/42/receive']);
});

test('微信确认成功但首次核验失败时返回订单页重试', async () => {
  let attempts = 0;
  const calls = await receiptScenario(async () => {}, async () => {
    if (++attempts === 1) throw new Error('网络中断');
  });
  assert.deepEqual(calls, ['/orders/42/receive', '/orders/42/receive']);
});
