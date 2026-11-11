// 执行真实会员支付服务，确认小程序不会退回旧的普通支付链路。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function payService({ weapp, request, virtualPay, ordinaryPay, chooseWXPay }) {
  const source = fs.readFileSync(path.join(__dirname, '../../src/services/pay.ts'), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
  } }).outputText;
  const exports = {};
  const taro = {
    canIUse: () => true,
    getDeviceInfo: () => ({ platform: 'android' }),
    login: async () => ({ code: 'fresh-code' }),
    requestPayment: ordinaryPay || (async () => { throw new Error('普通支付不应被调用'); }),
  };
  vm.runInNewContext(compiled, {
    exports,
    wx: { requestVirtualPayment: virtualPay },
    window: { location: { href: 'https://example.test/member' } },
    setTimeout: callback => callback(),
    require: name => {
      if (name === '@tarojs/taro') return { default: taro };
      if (name === '@/constants/env') return { USE_MOCK: false };
      if (name === '@/services/api') return { request, ApiError: class ApiError extends Error {} };
      if (name === '@/utils/platform') return { isWeapp: weapp, isH5: !weapp };
      if (name === '@/services/wechat') return { default: {
        configJsSdk: async () => {}, chooseWXPay: chooseWXPay || (async () => {}),
      } };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  }, { filename: 'pay.js' });
  return exports;
}

test('小程序会员购买只调虚拟支付，且以服务端订单确认后开通', async () => {
  const calls = [];
  const membership = { type: 'month', name: '月悦', expireAt: '2030-01-01' };
  const service = payService({ weapp: true,
    request: async (url, options) => {
      calls.push({ url, options });
      if (url === '/api/mp/pay/create-order') return { orderNo: 'M1', provider: 'virtual', payParams: { signData: 'signed' } };
      if (url === '/api/mp/pay/order-status?orderNo=M1') return { status: 'paid', membership };
      throw new Error(`Unexpected request: ${url}`);
    },
    virtualPay: options => {
      assert.equal(options.signData, 'signed');
      options.success();
    },
  });
  const result = await service.purchasePlan('month');
  assert.equal(result.ok, true);
  assert.equal(result.membership.type, 'month');
  assert.equal(calls[0].options.data.channel, 'weapp');
  assert.equal(calls[0].options.data.code, 'fresh-code');
});

test('旧后端未返回虚拟渠道时，小程序不会调用普通支付', async () => {
  const service = payService({ weapp: true,
    request: async () => ({ orderNo: 'OLD', payParams: { package: 'prepay_id=old' } }),
    virtualPay: () => { throw new Error('不应调用虚拟支付'); },
  });
  const result = await service.purchasePlan('month');
  assert.equal(result.ok, false);
  assert.match(result.message, /渠道未升级/);
});

test('H5 会员购买继续调原公众号支付', async () => {
  let invoked = false;
  const service = payService({ weapp: false,
    request: async url => url === '/api/mp/pay/create-order'
      ? { orderNo: 'H5', payParams: { package: 'prepay_id=h5' } }
      : { status: 'paid', membership: { type: 'year' } },
    virtualPay: () => { throw new Error('H5 不应调用虚拟支付'); },
    chooseWXPay: async params => { assert.equal(params.package, 'prepay_id=h5'); invoked = true; },
  });
  const result = await service.purchasePlan('year');
  assert.equal(result.ok, true);
  assert.equal(invoked, true);
});

test('小程序礼物卡等待服务端发码，取消支付不显示购买成功', async () => {
  let ordinaryInvoked = false;
  const service = payService({ weapp: true,
    request: async (url, options) => {
      if (url === '/api/mp/gift/create-order') {
        assert.equal(options.data.code, 'fresh-code');
        return { orderNo: 'G1', planName: '月悦', provider: 'virtual', payParams: { signData: 'gift' } };
      }
      if (url === '/api/mp/gift/code?orderNo=G1') return { status: 'paid', giftCode: 'GIFT-1', planName: '月悦' };
      throw new Error(`Unexpected request: ${url}`);
    },
    ordinaryPay: async () => { ordinaryInvoked = true; },
    virtualPay: options => options.success(),
  });
  const result = await service.purchaseGift('month');
  assert.equal(result.ok, true);
  assert.equal(result.giftCode, 'GIFT-1');
  assert.equal(ordinaryInvoked, false);

  const cancelled = payService({ weapp: true,
    request: async () => ({ orderNo: 'G2', provider: 'virtual', payParams: {} }),
    virtualPay: options => options.fail({ errMsg: 'requestVirtualPayment:fail cancel' }),
  });
  assert.equal((await cancelled.purchaseGift('month')).reason, 'cancel');
});
