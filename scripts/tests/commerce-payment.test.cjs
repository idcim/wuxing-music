// 执行真实支付适配器，模拟平台回调与 API；不连接微信或产生资金交易。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function paymentAdapter(api, requestPayment = async () => {}) {
  const source = fs.readFileSync(path.join(__dirname, '../../src/services/commerce-payment.weapp.ts'), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
  } }).outputText;
  const exports = {};
  const taro = { getDeviceInfo: () => ({ platform: 'android' }), requestPayment };
  vm.runInNewContext(compiled, {
    exports,
    require: name => {
      if (name === '@tarojs/taro') return { default: taro };
      if (name === './commerce') return { commerceApi: api };
      throw new Error(`Unexpected dependency: ${name}`);
    },
    setTimeout: fn => { fn(); },
  }, { filename: 'commerce-payment.weapp.js' });
  return exports;
}

test('实物支付后通过 POST 补查，只有服务端确认才成功', async () => {
  let paymentInvoked = false;
  let checks = 0;
  const adapter = paymentAdapter(async (url, method) => {
    assert.equal(method, 'POST');
    if (url === '/orders/42/pay') return { provider: 'wxpay', payParams: { package: 'test-prepay' } };
    assert.equal(url, '/orders/42/sync');
    assert.equal(paymentInvoked, true);
    return { status: ++checks === 3 ? 'paid' : 'pending' };
  }, async params => {
    assert.equal(params.package, 'test-prepay');
    paymentInvoked = true;
  });
  await adapter.payCommerceOrder(42, 'physical');
  assert.equal(checks, 3);
});

test('平台支付回调成功但服务端未确认时保持待核对提示', async () => {
  let checks = 0;
  const adapter = paymentAdapter(async (url, method) => {
    assert.equal(method, 'POST');
    if (url.endsWith('/pay')) return { provider: 'wxpay', payParams: {} };
    checks++;
    return { status: 'pending' };
  });
  await assert.rejects(adapter.payCommerceOrder(42, 'physical'), /支付结果确认中/);
  assert.equal(checks, 6);
});

test('用户取消平台支付后不返回支付成功', async () => {
  const adapter = paymentAdapter(async url => {
    assert.equal(url, '/orders/42/pay');
    return { provider: 'wxpay', payParams: {} };
  }, async () => { throw new Error('requestPayment:fail cancel'); });
  await assert.rejects(adapter.payCommerceOrder(42, 'physical'), /cancel/);
});
