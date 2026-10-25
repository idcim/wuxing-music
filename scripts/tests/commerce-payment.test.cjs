// 执行真实支付适配器，模拟平台回调与 API；不连接微信或产生资金交易。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function paymentAdapter(api, requestPayment = async () => {}, requirePlugin = () => undefined) {
  const source = fs.readFileSync(path.join(__dirname, '../../src/services/commerce-payment.weapp.ts'), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
  } }).outputText;
  const exports = {};
  const taro = { getDeviceInfo: () => ({ platform: 'android' }), requestPayment, requirePlugin };
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

test('物流查询使用官方插件并将服务端令牌传为 waybillToken', async () => {
  const calls = [];
  const adapter = paymentAdapter(async (url, method) => {
    assert.equal(url, '/orders/42/logistics');
    assert.equal(method, undefined);
    return { trace: { waybill_token: 'test-waybill-token' } };
  }, undefined, name => {
    assert.equal(name, 'logisticsPlugin');
    return { openWaybillTracking: options => { calls.push(options.waybillToken); } };
  });
  await adapter.openCommerceLogistics(42);
  assert.deepEqual(calls, ['test-waybill-token']);
});

test('物流令牌缺失时不拉起插件，插件缺失时提供明确错误', async () => {
  const missingToken = paymentAdapter(async () => ({ trace: {} }), undefined, () => { throw new Error('不应调用'); });
  await assert.rejects(missingToken.openCommerceLogistics(42), /物流信息暂未就绪/);
  const missingPlugin = paymentAdapter(async () => ({ trace: { waybill_token: 'test-token' } }));
  await assert.rejects(missingPlugin.openCommerceLogistics(42), /物流查询暂不可用/);
});

test('物流插件的失败返回给调用者，不冒充查询成功', async () => {
  const adapter = paymentAdapter(async () => ({ trace: { waybill_token: 'test-token' } }), undefined,
    () => ({ openWaybillTracking: async () => { throw new Error('plugin unavailable'); } }));
  await assert.rejects(adapter.openCommerceLogistics(42), /plugin unavailable/);
});

test('小程序声明官方物流插件，H5 不加载插件', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../src/app.config.ts'), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
  } }).outputText;
  for (const env of ['weapp', 'h5']) {
    const exports = {};
    vm.runInNewContext(compiled, { exports, process: { env: { TARO_ENV: env } }, defineAppConfig: value => value });
    const plugin = exports.default.plugins.logisticsPlugin;
    if (env === 'weapp') {
      assert.equal(plugin.provider, 'wx9ad912bf20548d92');
      assert.equal(plugin.version, '2.1.5');
    } else assert.equal(plugin, undefined);
  }
});
