const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');
const React = require('react');
const { act, create } = require('react-test-renderer');

function load(file, mocks, globals = {}) {
  const compiled = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../../', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { exports, ...globals, require: name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    throw new Error(`Unexpected dependency ${name}`);
  } });
  return exports;
}
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

async function loginPage(overrides = {}) {
  const calls = { sends: [], logins: [], wechat: 0, toasts: [], users: [], routes: [], backs: 0, cancellations: 0 };
  const state = { user: null, setUser: user => { calls.users.push(user); state.user = user; } };
  const useUserStore = selector => selector(state);
  useUserStore.getState = () => state;
  const timers = new Map(); let timerId = 0;
  const module = load('src/features/auth/AppLogin.tsx', {
    react: React, 'react/jsx-runtime': require('react/jsx-runtime'),
    '@tarojs/components': Object.fromEntries(['View', 'Text', 'Image', 'Input', 'Button', 'Checkbox', 'CheckboxGroup', 'Label'].map(name => [name, name.toLowerCase()])),
    '@tarojs/taro': { default: { showToast: ({ title }) => calls.toasts.push(title), reLaunch: ({ url }) => calls.routes.push(url), navigateTo: () => {} }, useDidShow: () => {} },
    '@/stores/site': { useSiteStore: selector => selector({ site: { site_name: '测试品牌', site_slogan: '测试副标题', theme_id: 'starlight' } }) },
    '@/stores/user': { useUserStore }, '@/theme': { THEMES: { starlight: { accent: '#84cc16' } } },
    '@/services/auth': { sendSmsCode: (...args) => { calls.sends.push(args); return overrides.send?.(...args) ?? Promise.resolve({ sent: true }); } },
    '@/services/appAuth': {
      appSmsAvailable: overrides.smsAvailable || (async () => true), cancelAppSmsLogin: () => calls.cancellations++,
      loginAppBySms: (...args) => { calls.logins.push(args); return overrides.login?.(...args) ?? Promise.resolve({ id: 42 }); },
    },
    '@/services/appWechat': { appWechatAvailable: overrides.wechatAvailable || (async () => true), cancelAppWechatLogin: () => calls.cancellations++, loginByAppWechat: async () => { calls.wechat++; return { id: 42 }; } },
    '@/utils/nav': { navBarStyle: () => ({}), goBack: () => calls.backs++ }, '@/utils/url': { resolveUrl: value => value }, './app-auth.scss': {},
  }, { setTimeout: callback => { const id = ++timerId; timers.set(id, callback); return id; }, clearTimeout: id => timers.delete(id) });
  let renderer;
  await act(async () => { renderer = create(React.createElement(module.default)); });
  const button = name => renderer.root.findAllByType('button').find(node => node.props.className.includes(name));
  return { calls, renderer, button, state,
    agree: () => act(async () => { renderer.root.findByType('checkboxgroup').props.onChange({ detail: { value: ['agreed'] } }); }),
    input: (index, value) => act(async () => { renderer.root.findAllByType('input')[index].props.onInput({ detail: { value } }); }),
    click: name => act(async () => { button(name).props.onClick(); }),
    tick: () => act(async () => { const [id, callback] = timers.entries().next().value; timers.delete(id); callback(); }),
    close: () => act(() => renderer.unmount()),
  };
}

test('APP 短信与微信登录默认不勾选协议，点击发码和登录均不触发账号请求', async () => {
  const page = await loginPage();
  try {
    assert.equal(page.renderer.root.findByType('checkbox').props.checked, false);
    await page.input(0, '13800138000'); await page.input(1, '123456');
    await page.click('__send'); await page.click('__primary'); await page.click('__wechat');
    assert.equal(page.calls.sends.length, 0); assert.equal(page.calls.logins.length, 0); assert.equal(page.calls.wechat, 0);
    assert.equal(page.calls.toasts.length, 3); assert.ok(page.calls.toasts.every(message => message.includes('勾选')));
    await page.click('__guest'); assert.equal(page.calls.backs, 1);
  } finally { page.close(); }
});

test('APP 短信输入校验阻止错误手机号或非六位验证码，并清除非数字字符', async () => {
  const page = await loginPage();
  try {
    await page.agree(); await page.input(0, '123'); await page.click('__send'); await page.click('__primary');
    await page.input(0, '138-0013-8000'); await page.input(1, '12a345'); await page.click('__primary');
    assert.equal(page.calls.sends.length, 0); assert.equal(page.calls.logins.length, 0);
    assert.equal(page.renderer.root.findAllByType('input')[0].props.value, '13800138000');
    assert.equal(page.renderer.root.findAllByType('input')[1].props.value, '12345');
    assert.ok(page.calls.toasts.some(message => message.includes('六位')));
    await page.input(1, '123456'); await page.click('__primary');
    assert.deepEqual(page.calls.logins, [['13800138000', '123456']]); assert.deepEqual(page.calls.users, [{ id: 42 }]);
    assert.deepEqual(page.calls.routes, ['/pages/home/index']);
  } finally { page.close(); }
});

test('APP 快速重复发送只请求一次，成功后倒计时期间不能重发', async () => {
  const sending = deferred(); const page = await loginPage({ send: () => sending.promise });
  try {
    await page.agree(); await page.input(0, '13800138000');
    const send = page.button('__send').props.onClick;
    await act(async () => { send(); send(); });
    assert.equal(page.calls.sends.length, 1); assert.equal(page.button('__send').props.disabled, true);
    await page.click('__primary'); assert.equal(page.calls.logins.length, 0);
    await act(async () => { sending.resolve({ sent: true }); });
    assert.equal(page.button('__send').children.join(''), '60s 后重发');
    await page.click('__send'); assert.equal(page.calls.sends.length, 1);
    await page.tick(); assert.equal(page.button('__send').children.join(''), '59s 后重发');
  } finally { page.close(); }
});

test('APP 发码与登录失败后可以重试，登录请求进行中重复点击只提交一次', async () => {
  let sends = 0, logins = 0; const pending = deferred();
  const page = await loginPage({ send: async () => { if (++sends === 1) throw new Error('短信发送受限'); return { sent: true }; }, login: () => ++logins === 1 ? Promise.reject(new Error('验证码错误')) : pending.promise });
  try {
    await page.agree(); await page.input(0, '13800138000'); await page.input(1, '123456');
    await page.click('__send'); assert.equal(page.button('__send').props.disabled, false);
    await page.click('__primary'); assert.equal(page.button('__primary').props.disabled, false);
    assert.ok(page.calls.toasts.includes('短信发送受限')); assert.ok(page.calls.toasts.includes('验证码错误'));
    const submit = page.button('__primary').props.onClick;
    await act(async () => { submit(); submit(); }); assert.equal(logins, 2);
    await act(async () => { pending.resolve({ id: 43 }); }); assert.deepEqual(page.calls.users, [{ id: 43 }]);
  } finally { page.close(); }
});

test('APP 离开登录页后忽略迟到登录响应且取消两个登录通道', async () => {
  const login = deferred(); const page = await loginPage({ login: () => login.promise });
  try {
    await page.agree(); await page.input(0, '13800138000'); await page.input(1, '123456'); await page.click('__primary');
    await page.click('__back'); assert.equal(page.calls.cancellations, 2);
    await act(async () => { login.resolve({ id: 42 }); });
    assert.deepEqual(page.calls.users, []); assert.deepEqual(page.calls.routes, []);
  } finally { page.close(); }
});

test('APP 后端未就绪时展示重试并禁用短信请求，重查成功后恢复登录入口', async () => {
  let ready = false; const page = await loginPage({ smsAvailable: async () => { if (!ready) throw new Error('503'); return true; }, wechatAvailable: async () => false });
  try {
    assert.equal(page.renderer.root.findAllByType('input').length, 0);
    assert.equal(page.calls.sends.length, 0); assert.equal(page.calls.logins.length, 0);
    ready = true; await page.click('__retry'); assert.equal(page.renderer.root.findAllByType('input').length, 2);
  } finally { page.close(); }
});

function smsService(request) {
  const stored = [];
  const service = load('src/services/appAuth.ts', {
    '@/services/api': { request }, '@/services/storage': { storage: { set: (...args) => stored.push(args) }, STORAGE_KEYS: { USER: 'user' } }, '@/constants/env': { TOKEN_KEY: 'token' },
  });
  return { service, stored };
}

test('APP 短信服务复用进行中的登录请求，以无认证接口取得并保存统一登录态', async () => {
  const answer = deferred(); const calls = []; const { service, stored } = smsService((...args) => { calls.push(args); return answer.promise; });
  const first = service.loginAppBySms('13800138000', '123456'), second = service.loginAppBySms('13800138000', '123456');
  assert.equal(first, second); assert.equal(calls.length, 1);
  assert.equal(calls[0][0], '/api/mp/login/phone'); assert.equal(calls[0][1].auth, false);
  assert.equal(calls[0][1].data.phone, '13800138000'); assert.equal(calls[0][1].data.code, '123456');
  const user = { id: 42 }; answer.resolve({ token: 'fixture-token', user }); assert.equal(await first, user);
  assert.deepEqual(stored, [['token', 'fixture-token'], ['user', user]]);
});

test('APP 取消短信登录后迟到响应不能写缓存，旧请求结束也不释放新请求锁', async () => {
  const old = deferred(), next = deferred(); let requests = 0;
  const { service, stored } = smsService(() => ++requests === 1 ? old.promise : next.promise);
  const original = service.loginAppBySms('13800138000', '123456'); service.cancelAppSmsLogin();
  const replacement = service.loginAppBySms('13900139000', '654321');
  old.resolve({ token: 'stale', user: { id: 1 } }); await assert.rejects(original, /已取消/); assert.equal(stored.length, 0);
  assert.equal(service.loginAppBySms('13900139000', '654321'), replacement); assert.equal(requests, 2);
  next.resolve({ token: 'next', user: { id: 2 } }); await replacement; assert.equal(stored[0][1], 'next');
});

function wechatService(overrides = {}) {
  const calls = [], writes = []; let token = 'existing-token';
  const user = { id: 42 };
  const service = load('src/services/appWechat.ts', {
    '@capacitor/core': { registerPlugin: () => ({ cancel: async () => {}, authorize: overrides.authorize || (async ({ state }) => ({ state, code: 'sdk-fixture' })) }) },
    '@/services/api': { request: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith('/config')) return { enabled: true, app_id: 'wx-fixture', android_package: 'fixture.package', android_signature: 'a'.repeat(32) };
      if (url.endsWith('/challenge')) return { state: 'fixture-state', proof: 'fixture-proof' };
      return overrides.exchange ? overrides.exchange(url, options) : { user };
    } },
    '@/services/storage': { storage: { get: () => token, set: (...args) => writes.push(args) }, STORAGE_KEYS: { USER: 'user' } }, '@/constants/env': { TOKEN_KEY: 'token' }, '@/utils/platform': { isAndroidApp: true },
  });
  return { service, calls, writes, user, changeToken: value => token = value };
}

test('APP 绑定微信使用认证 challenge 和绑定接口，保留当前令牌且更新用户缓存', async () => {
  let sdk;
  const fixture = wechatService({ authorize: async options => { sdk = options; return { state: options.state, code: 'sdk-fixture' }; } });
  const pending = fixture.service.bindAppWechat(); assert.equal(fixture.service.bindAppWechat(), pending);
  assert.equal(await pending, fixture.user);
  assert.equal(sdk.state, 'fixture-state'); assert.equal(sdk.appId, 'wx-fixture');
  assert.deepEqual(fixture.calls.map(call => call.url), ['/api/app/wechat/config', '/api/app/wechat/bind/challenge', '/api/app/wechat/bind']);
  for (const call of fixture.calls.slice(1)) { assert.equal(call.options.auth, true); assert.equal(call.options.method, 'POST'); }
  assert.equal(fixture.calls[2].options.data.proof, 'fixture-proof'); assert.equal(fixture.calls[2].options.data.code, 'sdk-fixture');
  assert.deepEqual(fixture.writes, [['user', fixture.user]]);
});

test('APP 绑定微信拒绝不匹配 state，且不调用绑定交换接口', async () => {
  const fixture = wechatService({ authorize: async () => ({ state: 'forged', code: 'sdk-fixture' }) });
  await assert.rejects(fixture.service.bindAppWechat(), /校验失败/);
  assert.equal(fixture.calls.length, 2); assert.deepEqual(fixture.writes, []);
});

test('APP 绑定返回前账号令牌变化或用户取消时不保存迟到响应', async () => {
  for (const mode of ['account-change', 'cancel']) {
    const response = deferred(); const fixture = wechatService({ exchange: () => response.promise });
    const bind = fixture.service.bindAppWechat(); await flush(); assert.equal(fixture.calls.length, 3);
    if (mode === 'account-change') fixture.changeToken('other-account'); else fixture.service.cancelAppWechatLogin();
    response.resolve({ user: { id: 42 } }); await assert.rejects(bind, mode === 'account-change' ? /账号已变化/ : /已取消微信绑定/);
    assert.deepEqual(fixture.writes, []);
  }
});

async function bindingPanel(overrides = {}) {
  const calls = { users: [], modals: [], binds: 0 }; const state = { user: { id: 42 }, setUser: user => calls.users.push(user) };
  const useUserStore = selector => selector(state); useUserStore.getState = () => state;
  const module = load('src/features/auth/AppWechatBinding.tsx', {
    react: React, 'react/jsx-runtime': require('react/jsx-runtime'), '@tarojs/components': { View: 'view', Text: 'text', Button: 'button' },
    '@tarojs/taro': { default: { showModal: async options => { calls.modals.push(options); return { confirm: true }; }, showToast: () => {} }, useDidShow: () => {} },
    '@/stores/user': { useUserStore }, '@/utils/platform': { isAndroidApp: true },
    '@/services/appWechat': { appWechatAvailable: async () => true, appWechatBinding: overrides.status || (async () => false), cancelAppWechatLogin: () => {}, bindAppWechat: () => { calls.binds++; return overrides.bind?.() ?? Promise.resolve({ id: 42 }); } }, './binding.scss': {},
  });
  let renderer; await act(async () => { renderer = create(React.createElement(module.default)); });
  return { renderer, calls, state, close: () => act(() => renderer.unmount()), click: () => act(async () => { renderer.root.findByType('button').props.onClick(); }) };
}

test('APP 个人中心绑定面板显示已绑定状态，已有绑定不提供重复操作', async () => {
  const panel = await bindingPanel({ status: async () => true });
  try {
    assert.equal(panel.renderer.root.findAllByType('button').length, 0);
    assert.ok(panel.renderer.root.findAllByType('text').some(node => node.children.join('').includes('短信与微信可登录同一账号')));
    assert.equal(panel.calls.binds, 0);
  } finally { panel.close(); }
});

test('APP 个人中心绑定冲突保持原账号，并展示服务端冲突信息供重试', async () => {
  const panel = await bindingPanel({ bind: async () => { throw new Error('此微信已绑定其他账号，请先使用原账号登录'); } });
  try {
    await panel.click(); assert.deepEqual(panel.calls.users, []);
    assert.ok(panel.calls.modals.some(modal => modal.content.includes('此微信已绑定其他账号')));
    assert.equal(panel.renderer.root.findByType('button').props.disabled, false);
  } finally { panel.close(); }
});

test('APP 个人中心绑定中切换用户或退出页面，不把旧账号结果写回用户状态', async () => {
  for (const mode of ['account-change', 'unmount']) {
    const response = deferred(); const panel = await bindingPanel({ bind: () => response.promise });
    await panel.click(); assert.equal(panel.calls.binds, 1);
    if (mode === 'account-change') panel.state.user = { id: 99 }; else panel.close();
    await act(async () => { response.resolve({ id: 42 }); }); assert.deepEqual(panel.calls.users, []);
    if (mode === 'account-change') panel.close();
  }
});
