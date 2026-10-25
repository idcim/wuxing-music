// 执行真实支付适配器，模拟平台回调与 API；不连接微信或产生资金交易。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function paymentAdapter(api, requestPayment = async () => {}, navigateTo = async () => {}) {
  const source = fs.readFileSync(path.join(__dirname, '../../src/services/commerce-payment.weapp.ts'), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
  } }).outputText;
  const exports = {};
  const taro = { getDeviceInfo: () => ({ platform: 'android' }), requestPayment, navigateTo };
  vm.runInNewContext(compiled, {
    exports,
    require: name => {
      if (name === '@tarojs/taro') return { default: taro };
      if (name === './commerce') return { commerceApi: api, shopPath: '/packages/shop' };
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

test('物流查询进入站内轨迹页，不调用微信插件或查询 API', async () => {
  const calls = [];
  const adapter = paymentAdapter(async () => { throw new Error('不应提前请求'); }, undefined, async options => { calls.push(options.url); });
  await adapter.openCommerceLogistics(42);
  assert.deepEqual(calls, ['/packages/shop/logistics/index?id=42']);
});

test('无效订单不打开物流页面', async () => {
  const adapter = paymentAdapter(async () => {}, undefined, async () => { throw new Error('不应导航'); });
  for (const id of [0, -1, NaN, 1.5]) await assert.rejects(adapter.openCommerceLogistics(id), /订单编号无效/);
});

test('物流页面导航失败返回调用者', async () => {
  const adapter = paymentAdapter(async () => {}, undefined, async () => { throw new Error('navigate failed'); });
  await assert.rejects(adapter.openCommerceLogistics(42), /navigate failed/);
});

test('小程序物流页位于商城分包，构建不再依赖物流插件', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../src/app.config.ts'), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
  } }).outputText;
  for (const env of ['weapp', 'h5']) {
    const exports = {};
    vm.runInNewContext(compiled, { exports, process: { env: { TARO_ENV: env } }, defineAppConfig: value => value });
    assert.equal(exports.default.plugins?.logisticsPlugin, undefined);
    if (env === 'weapp') {
      const shop = exports.default.subPackages.find(item => item.root === 'packages/shop');
      assert.ok(shop.pages.includes('logistics/index'));
    } else assert.equal(exports.default.subPackages.length, 0);
  }
});
