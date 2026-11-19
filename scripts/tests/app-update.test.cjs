const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');

function setup({ android = true, payload, native = {}, channel = 'preview' } = {}) {
  let now = 1000000;
  const calls = [], opened = [];
  let exits = 0;
  const create = init => {
    let state;
    const store = selector => selector(state);
    store.getState = () => state;
    store.setState = value => { state = { ...state, ...value }; };
    state = init(store.setState, store.getState);
    return store;
  };
  const deps = {
    zustand: { create },
    '@/utils/platform': { isAndroidApp: android },
    '@/constants/env': { API_BASE: 'https://api.example.test' },
    '@/services/api': { request: async url => { calls.push(url); return payload; } },
    '@capacitor/app': { App: {
      getInfo: async () => ({ id: 'cn.test.preview', version: '1.2-preview', build: '123', ...native }),
      exitApp: async () => { exits++; },
    } },
    '@capacitor/core': { registerPlugin: () => ({ openDownload: async options => opened.push(options) }) },
  };
  const file = path.join(__dirname, '../../src/services/appUpdate.ts');
  const source = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : 'export {};';
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { exports, process: { env: { TARO_APP_ANDROID_CHANNEL: channel } }, URL, Set, Number, Date: { now: () => now }, require: key => {
    if (key in deps) return deps[key];
    throw new Error(`Unexpected dependency ${key}`);
  } });
  return { ...exports, calls, opened, get exits() { return exits; }, tick: ms => { now += ms; } };
}

const releaseId = 'b'.repeat(32);
const latest = overrides => ({ id: releaseId, version_name: '1.3', version_code: 124, package_name: 'cn.test.preview', channel: 'preview', size: 1024, sha256: 'a'.repeat(64), notes: '修复播放器', download_url: `/api/app/download/${releaseId}`, ...overrides });
const info = overrides => ({ enabled: true, app_name: '测试', title: '安卓应用', install_guide: '下载后安装', latest: latest(), update_available: true, force_update: false, ...overrides });

test('正式包只查询正式渠道并拒绝体验渠道更新', async () => {
  const payload = info({ latest: latest({ channel: 'stable', package_name: 'cn.azureglow.wuxing' }) });
  const service = setup({ channel: 'stable', native: { id: 'cn.azureglow.wuxing' }, payload });
  assert.equal(await service.checkAppUpdate(), 'update');
  assert.match(service.calls[0], /channel=stable&version_code=123&package_name=cn.azureglow.wuxing/);
  const wrong = setup({ channel: 'stable', payload: info() });
  assert.equal(await wrong.checkAppUpdate(), 'current');
});

test('实际原生版本用于检查，自动更新节流，普通更新在本会话忽略', async () => {
  const service = setup({ payload: info() });
  assert.equal(typeof service.checkAppUpdate, 'function');
  assert.equal(await service.checkAppUpdate(), 'update');
  assert.match(service.calls[0], /channel=preview&version_code=123&package_name=cn.test.preview/);
  assert.equal(service.useAppUpdate.getState().nativeInfo.version, '1.2-preview');
  assert.equal(service.useAppUpdate.getState().visible, true);
  service.dismissAppUpdate();
  assert.equal(service.useAppUpdate.getState().visible, false);
  service.tick(5 * 60 * 1000 + 1);
  await service.checkAppUpdate();
  assert.equal(service.useAppUpdate.getState().visible, false);
  await service.checkAppUpdate(true);
  assert.equal(service.useAppUpdate.getState().visible, true);
  await service.checkAppUpdate();
  assert.equal(service.calls.length, 3);
});

test('后台强更标记必须有有效的同包名新版本才生效', async () => {
  for (const candidate of [null, latest({ version_code: 123 }), latest({ package_name: 'cn.other' }), latest({ channel: 'production' }), latest({ download_url: 'https://evil.test/app.apk' }), latest({ download_url: '//evil.test/api/app/download/8' }), latest({ download_url: '/api/app/download/8?next=evil' }), latest({ sha256: '' })]) {
    const service = setup({ payload: info({ latest: candidate, force_update: true }) });
    assert.equal(await service.checkAppUpdate(), 'current');
    assert.equal(service.useAppUpdate.getState().visible, false);
    assert.equal(service.useAppUpdate.getState().force, false);
  }
  const disabled = setup({ payload: info({ enabled: false, force_update: true }) });
  assert.equal(await disabled.checkAppUpdate(), 'unavailable');
});

test('强更不可忽略，可退出；下载仅通过原生浏览器打开已校验地址', async () => {
  const service = setup({ payload: info({ force_update: true }) });
  await service.checkAppUpdate();
  service.dismissAppUpdate();
  assert.equal(service.useAppUpdate.getState().visible, true);
  await service.openAppUpdateDownload();
  assert.equal(service.opened[0].url, `https://api.example.test/api/app/download/${releaseId}`);
  await service.exitForAppUpdate();
  assert.equal(service.exits, 1);
});

test('小程序和 H5 不检查原生版本或创建更新弹窗', async () => {
  const service = setup({ android: false, payload: info() });
  assert.equal(await service.checkAppUpdate(true), 'unavailable');
  assert.equal(await service.getNativeAppInfo(), null);
  assert.equal(service.calls.length, 0);
});

test('普通更新允许稍后，强制更新提供退出而不提供忽略入口', async () => {
  const React = require('react');
  const { act, create } = require('react-test-renderer');
  const file = path.join(__dirname, '../../src/components/AppUpdatePrompt/index.tsx');
  assert.ok(fs.existsSync(file), '更新提示组件尚未实现');
  for (const force of [false, true]) {
    let dismissed = 0, exited = 0, stopped = 0;
    const deps = {
      react: React, 'react/jsx-runtime': require('react/jsx-runtime'),
      '@tarojs/components': { View: 'view', Text: 'text', ScrollView: 'scroll' },
      '@tarojs/taro': { default: { showToast() {} } },
      '@/utils/platform': { isAndroidApp: true },
      '@/stores/player': { usePlayerStore: { getState: () => ({ stop: () => stopped++ }) } },
      '@/services/appUpdate': {
        useAppUpdate: selector => selector({ visible: true, force, release: latest(), guide: '安装说明' }),
        dismissAppUpdate: () => dismissed++, exitForAppUpdate: async () => exited++, openAppUpdateDownload: async () => {},
      },
      './index.scss': {},
    };
    const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    const exports = {};
    vm.runInNewContext(compiled, { exports, require: key => deps[key] });
    let renderer;
    await act(async () => { renderer = create(React.createElement(exports.default)); });
    const text = JSON.stringify(renderer.toJSON());
    assert.ok(text.includes('修复播放器'));
    const label = force ? '退出应用' : '稍后再说';
    assert.ok(text.includes(label));
    assert.equal(text.includes(force ? '稍后再说' : '退出应用'), false);
    const action = renderer.root.findAllByType('view').find(node => node.props.className === 'app-update__secondary');
    await act(async () => action.props.onClick());
    assert.equal(force ? exited : dismissed, 1);
    assert.equal(stopped, force ? 1 : 0);
    renderer.unmount();
  }
});
