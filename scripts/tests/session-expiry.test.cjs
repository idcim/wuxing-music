const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');
const { create } = require('zustand');

test('过期登录只提醒一次，用户拒绝重新登录后仍可作为游客浏览', () => {
  const values = new Map([['token', 'old-token']]);
  const storage = {
    get: key => values.get(key) ?? null,
    set: (key, value) => values.set(key, value),
    remove: key => values.delete(key),
  };
  const modals = [];
  const navigations = [];
  const sessionExports = {};
  const sessionSource = fs.readFileSync(path.join(__dirname, '../../src/services/session.ts'), 'utf8');
  vm.runInNewContext(ts.transpileModule(sessionSource, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
  } }).outputText, { exports: sessionExports, require: name => {
    if (name === '@/constants/env') return { TOKEN_KEY: 'token' };
    if (name === '@/services/storage') return { storage };
    throw new Error(`未替换依赖 ${name}`);
  } });
  const mocks = {
    zustand: { create },
    '@tarojs/taro': { default: {
      showModal: options => { modals.push(options); return Promise.resolve({ cancel: true }); },
      navigateTo: options => navigations.push(options.url),
    } },
    '@/services/storage': { storage, STORAGE_KEYS: {
      SESSION_EXPIRED: 'expired', USER: 'user', ELEMENT: 'element', SCORES: 'scores',
      QUIZ_PROGRESS: 'quiz', PENDING_AGENT: 'agent',
    } },
    '@/services/auth': {
      clearAuth: () => { storage.remove('token'); storage.remove('user'); },
      getToken: () => storage.get('token'),
    },
    '@/services/agent': { bindPendingAgent: async () => {} },
    '@/services/session': sessionExports,
  };
  const source = fs.readFileSync(path.join(__dirname, '../../src/stores/user.ts'), 'utf8');
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
  } }).outputText, { exports, require: name => {
    if (!(name in mocks)) throw new Error(`未替换依赖 ${name}`);
    return mocks[name];
  } });
  const store = exports.useUserStore;
  store.getState().setUser({ id: '1', membership: { type: 'free' } });
  sessionExports.expireSession('old-token');
  sessionExports.expireSession('old-token');
  assert.equal(store.getState().user, null);
  assert.equal(store.getState().sessionExpired, true);
  assert.equal(values.has('token'), false);
  assert.equal(modals.length, 1);
  assert.equal(modals[0].showCancel, true);
  modals[0].success({ cancel: true, confirm: false });
  assert.deepEqual(navigations, []);
});
