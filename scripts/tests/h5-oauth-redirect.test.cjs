const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');
const { webcrypto } = require('node:crypto');

test('公众号授权回跳地址不携带 hash 路由，确保微信 code 落在查询参数', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../../src/services/auth.ts'), 'utf8');
  const exports = {};
  const calls = [];
  const values = new Map();
  const session = new Map();
  const location = {
    href: 'https://app.example.cn/?campaign=music#/pages/member/index',
    search: '?campaign=music',
    replace: url => calls.push(['replace', url]),
  };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
  } }).outputText, {
    exports, URL, URLSearchParams, Uint8Array, window: { location, crypto: webcrypto, sessionStorage: {
      getItem: key => session.get(key) ?? null,
      setItem: (key, value) => session.set(key, value),
      removeItem: key => session.delete(key),
    } }, console,
    require: name => {
      if (name === '@tarojs/taro') return { default: {} };
      if (name === '@/constants/env') return { USE_MOCK: false, TOKEN_KEY: 'token' };
      if (name === '@/services/storage') return { storage: {
        get: key => values.get(key) ?? null,
        set: (key, value) => values.set(key, value),
        remove: key => values.delete(key),
      }, STORAGE_KEYS: { USER: 'user' } };
      if (name === '@/services/api') return { request: async url => {
        calls.push(['request', url]);
        return { configured: true, url: 'https://open.weixin.qq.com/oauth' };
      } };
      throw new Error(`未替换依赖 ${name}`);
    },
  });

  await exports.wechatLoginH5();
  const request = calls.find(([kind]) => kind === 'request')[1];
  const query = new URLSearchParams(request.split('?')[1]);
  const redirect = query.get('redirect');
  assert.equal(redirect, 'https://app.example.cn/?campaign=music');
  assert.match(query.get('state') || '', /^wx[0-9a-f]{32}$/);
  assert.equal(session.get('wx_oa_oauth_state'), query.get('state'));
  assert.deepEqual(calls.at(-1), ['replace', 'https://open.weixin.qq.com/oauth']);
});

test('公众号回跳 state 不匹配时不能换取账号', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../../src/services/auth.ts'), 'utf8');
  const exports = {};
  let exchanges = 0;
  const session = new Map([['wx_oa_oauth_state', 'wx' + 'a'.repeat(32)]]);
  const location = {
    href: 'https://app.example.cn/?code=forged&state=wx' + 'b'.repeat(32),
    search: '?code=forged&state=wx' + 'b'.repeat(32),
  };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
  } }).outputText, {
    exports, URL, URLSearchParams, window: { location, sessionStorage: {
      getItem: key => session.get(key) ?? null,
      setItem: (key, value) => session.set(key, value),
      removeItem: key => session.delete(key),
    } },
    require: name => {
      if (name === '@tarojs/taro') return { default: {} };
      if (name === '@/constants/env') return { USE_MOCK: false, TOKEN_KEY: 'token' };
      if (name === '@/services/storage') return { storage: {
        get: () => 'guest', set: () => {}, remove: () => {},
      }, STORAGE_KEYS: { USER: 'user' } };
      if (name === '@/services/api') return { request: async () => {
        exchanges++;
        return { token: 'issued-token', user: { id: 'wechat-user' } };
      } };
      throw new Error(`未替换依赖 ${name}`);
    },
  });
  await assert.rejects(exports.wechatLoginH5(), /微信登录校验失败/);
  assert.equal(exchanges, 0);
  assert.equal(session.has('wx_oa_oauth_state'), false);
  session.set('wx_oa_oauth_state', 'wx' + 'a'.repeat(32));
  location.search = '?code=valid&state=wx' + 'a'.repeat(32);
  const result = await exports.wechatLoginH5();
  assert.equal(exchanges, 1);
  assert.equal(result.user.id, 'wechat-user');
});

test('扫码回跳必须匹配一次性随机 state 才能换取账号', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../../src/services/auth.ts'), 'utf8');
  const exports = {};
  const session = new Map();
  const calls = [];
  const location = { origin: 'https://app.example.cn', pathname: '/', search: '',
    replace: url => calls.push(['replace', url]) };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
  } }).outputText, {
    exports, URL, URLSearchParams, Uint8Array, window: { location, crypto: webcrypto,
      sessionStorage: { getItem: key => session.get(key) ?? null,
        setItem: (key, value) => session.set(key, value),
        removeItem: key => session.delete(key) } }, console,
    require: name => {
      if (name === '@tarojs/taro') return { default: {} };
      if (name === '@/constants/env') return { USE_MOCK: false, TOKEN_KEY: 'token' };
      if (name === '@/services/storage') return { storage: {
        get: () => 'guest', set: () => {}, remove: () => {},
      }, STORAGE_KEYS: { USER: 'user' } };
      if (name === '@/services/api') return { request: async url => {
        calls.push(['request', url]);
        return url.includes('qrlogin-url')
          ? { configured: true, url: 'https://open.weixin.qq.com/qrconnect' }
          : { token: 'issued-token', user: { id: 'qr-user' } };
      } };
      throw new Error(`未替换依赖 ${name}`);
    },
  });
  await exports.wechatQrLoginH5();
  const query = new URLSearchParams(calls[0][1].split('?')[1]);
  const nonce = query.get('nonce');
  assert.match(nonce || '', /^[0-9a-f]{32}$/);
  assert.equal(session.get('wx_qr_nonce'), nonce);
  location.search = '?code=forged&state=wxqr' + 'b'.repeat(32);
  await assert.rejects(exports.wechatQrLoginH5(), /微信登录校验失败/);
  assert.equal(calls.filter(([kind, url]) => kind === 'request' && url === '/api/mp/h5/qrlogin').length, 0);
  assert.equal(session.has('wx_qr_nonce'), false);
  session.set('wx_qr_nonce', nonce);
  location.search = '?code=valid&state=wxqr' + nonce;
  assert.equal(exports.hasQrLoginCallback(), true);
  const result = await exports.wechatQrLoginH5();
  assert.equal(result.user.id, 'qr-user');
  assert.equal(session.has('wx_qr_nonce'), false);
  assert.equal(exports.hasQrLoginCallback(), true);
});
