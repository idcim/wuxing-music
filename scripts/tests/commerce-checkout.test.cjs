// 挂载真实 React 结算页面；仅替换 Taro 平台组件与服务端，不发起资金交易。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');
const React = require('react');
const { create, act } = require('react-test-renderer');
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const quote = shipping => ({ amount_fen: 1000 + shipping, shipping_fen: shipping,
  items: [{ entity_id: 1, title: '测试茶', quantity: 1, price_fen: 1000 }] });

async function page(api, params = { kind: 'physical', sku: '1', quantity: '1' }) {
  let show, hide; const orders = [], payments = [], redirects = [], errors = [];
  const mocks = {
    react: React, 'react/jsx-runtime': require('react/jsx-runtime'),
    '@tarojs/components': { View: 'view', Text: 'text', Button: 'button' },
    '@tarojs/taro': { default: { navigateTo: async () => {}, redirectTo: options => { redirects.push(options.url); } },
      useRouter: () => ({ params }), useDidShow: callback => { show = callback; }, useDidHide: callback => { hide = callback; } },
    '@/services/commerce': { shopPath: '/packages/shop', money: n => `¥${(n / 100).toFixed(2)}`,
      commerceApi: async (url, method, body) => {
        if (url === '/orders') orders.push(body);
        return api(url, method, body);
      } },
    '@/services/commerce-payment': { payCommerceOrder: async (...args) => { payments.push(args); } },
    '@/features/commerce/common': { CommercePage: ({ children }) => React.createElement('page', null, children),
      Feedback: props => React.createElement('feedback', props), action: async work => { try { await work(); } catch (e) { errors.push(e.message); } } },
  };
  const source = fs.readFileSync(path.join(__dirname, '../../src/packages/shop/checkout/index.tsx'), 'utf8');
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, { exports, require: name => { if (!(name in mocks)) throw new Error(name); return mocks[name]; } });
  let renderer;
  await act(async () => { renderer = create(React.createElement(exports.default)); });
  const flush = () => act(async () => { await tick(); await tick(); });
  const invoke = async callback => { act(() => { callback(); }); await flush(); };
  const buttons = () => renderer.root.findAllByType('button');
  const pay = () => buttons().find(button => button.children.join('').startsWith('确认并支付'));
  return { renderer, orders, payments, redirects, errors, flush, invoke, pay,
    show: () => invoke(show), hide: () => invoke(hide),
    retry: () => invoke(() => renderer.root.findByType('feedback').props.retry()),
    agree: () => invoke(() => renderer.root.findAllByType('text').find(n => n.children.join('').includes('我已阅读')).props.onClick()),
    close: () => act(() => renderer.unmount()),
  };
}

test('同一地址修改省份后重新报价并重新确认，旧按钮回调不能提交', async () => {
  let shipping = 100, held;
  const ui = await page(async url => {
    if (url === '/addresses') return [{ id: 1, name: '测试', province: shipping === 100 ? '湖北省' : '广东省' }];
    if (url === '/checkout') return held ? held.promise : quote(shipping);
    if (url === '/orders') return { id: 42 };
    throw new Error(url);
  });
  try {
    await ui.show(); await ui.agree(); assert.ok(ui.pay().children.join('').includes('11.00'));
    const oldSubmit = ui.pay().props.onClick;
    await ui.hide(); shipping = 500; held = deferred(); await ui.show();
    assert.equal(ui.pay(), undefined); await ui.invoke(oldSubmit); assert.equal(ui.orders.length, 0);
    held.resolve(quote(shipping)); await ui.flush();
    assert.ok(ui.pay().children.join('').includes('15.00')); assert.equal(ui.pay().props.disabled, true);
    await ui.agree();
    const submit = ui.pay().props.onClick;
    await act(async () => { await Promise.all([submit(), submit()]); });
    assert.equal(ui.orders.length, 1); assert.equal(ui.orders[0].quoted_fen, 1500);
    assert.equal(ui.payments.length, 1); assert.equal(ui.redirects.length, 1);
  } finally { ui.close(); }
});

test('地址加载失败时不沿用旧报价，重试重新加载地址后恢复', async () => {
  let fail = false, quotes = 0;
  const ui = await page(async url => {
    if (url === '/addresses') { if (fail) throw new Error('地址网络异常'); return [{ id: 1 }]; }
    if (url === '/checkout') { quotes++; return quote(0); }
    throw new Error(url);
  });
  try {
    await ui.show(); assert.ok(ui.pay()); fail = true; await ui.retry();
    assert.equal(ui.pay(), undefined); assert.equal(quotes, 1);
    assert.match(ui.renderer.root.findByType('feedback').props.error, /地址网络异常/);
    fail = false; await ui.retry(); assert.ok(ui.pay()); assert.equal(quotes, 2);
  } finally { ui.close(); }
});

test('购物车勾选项已移除时阻止静默部分结算', async () => {
  const ui = await page(async url => {
    if (url === '/addresses') return [{ id: 1 }];
    if (url === '/cart') return [{ id: 1, sku_id: 1, quantity: 1 }];
    throw new Error('不应提交报价或订单');
  }, { kind: 'physical', cart: '1,2' });
  try { await ui.show(); assert.equal(ui.pay(), undefined); assert.match(ui.renderer.root.findByType('feedback').props.error, /重新选择/); }
  finally { ui.close(); }
});

test('隐藏前迟到的报价不能覆盖返回后的新价格，课程也可正常报价', async () => {
  const first = deferred(); let calls = 0;
  const ui = await page(async url => {
    assert.equal(url, '/checkout'); return ++calls === 1 ? first.promise : quote(500);
  }, { kind: 'course', course: '3' });
  try {
    await ui.show(); await ui.hide(); await ui.show();
    assert.ok(ui.pay().children.join('').includes('15.00'));
    first.resolve(quote(100)); await ui.flush();
    assert.ok(ui.pay().children.join('').includes('15.00'));
  } finally { ui.close(); }
});

test('旧地址请求晚于重新进入返回时，不能覆盖新地址或产生旧地址报价', async () => {
  const first = deferred(); let addressCalls = 0; const quotedAddresses = [];
  const ui = await page(async (url, method, body) => {
    if (url === '/addresses') return ++addressCalls === 1 ? first.promise : [{ id: 2 }];
    if (url === '/checkout') { quotedAddresses.push(body.address_id); return quote(0); }
    throw new Error(url);
  });
  try {
    await ui.show(); await ui.hide(); await ui.show();
    assert.deepEqual(quotedAddresses, [2]);
    first.resolve([{ id: 1 }]); await ui.flush();
    assert.deepEqual(quotedAddresses, [2]); assert.ok(ui.pay());
  } finally { ui.close(); }
});

test('报价失败可重新获取价格，恢复后仍需重新确认', async () => {
  let fail = true;
  const ui = await page(async url => {
    if (url === '/addresses') return [{ id: 1 }];
    if (url === '/checkout') { if (fail) throw new Error('运费服务暂不可用'); return quote(200); }
    throw new Error(url);
  });
  try {
    await ui.show(); assert.equal(ui.pay(), undefined);
    assert.match(ui.renderer.root.findByType('feedback').props.error, /运费服务/);
    fail = false; await ui.retry(); assert.ok(ui.pay()); assert.equal(ui.pay().props.disabled, true);
    assert.equal(ui.renderer.root.findByType('feedback').props.error, '');
  } finally { ui.close(); }
});
