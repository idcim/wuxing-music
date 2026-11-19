const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');

function navigation(platform, taro = {}) {
  const compiled = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../../src/utils/nav.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { exports, require: name => {
    if (name === '@tarojs/taro') return { default: taro };
    if (name === './platform') return platform;
    if (name === './unit') return { rpx: n => platform.isH5 ? `${n / 40}rem` : `${n}rpx` };
    throw new Error(name);
  } });
  return exports;
}

test('APP 页头保留设备安全区和日常间距，不读取微信胶囊', () => {
  const nav = navigation({ isH5: true, isAndroidApp: true }, new Proxy({}, {
    get() { throw new Error('APP 不应读取小程序窗口与胶囊'); },
  }));
  const safeTop = 'var(--safe-area-inset-top, env(safe-area-inset-top, 0px))';
  assert.equal(nav.navTopStyle().paddingTop, `calc(${safeTop} + 0.8rem)`);
  assert.equal(nav.navBarStyle().paddingTop, safeTop);
  assert.equal(nav.navBarStyle().height, '44px');
  assert.equal(nav.navBarStyle().boxSizing, 'content-box');
});

test('旧 H5 页头间距保持原设计', () => {
  const nav = navigation({ isH5: true, isAndroidApp: false });
  assert.equal(nav.navTopStyle().paddingTop, '2.2rem');
  assert.equal(nav.navBarStyle().paddingTop, '2.2rem');
});

test('小程序仍按实际状态栏与胶囊避让，异常窗口仍有兜底', () => {
  const nav = navigation({ isH5: false, isAndroidApp: false }, {
    getWindowInfo: () => ({ statusBarHeight: 24 }),
    getMenuButtonBoundingClientRect: () => ({ bottom: 58 }),
  });
  assert.equal(nav.navTopStyle().paddingTop, '66px');
  assert.equal(nav.navBarStyle().paddingTop, '24px');
  const fallback = navigation({ isH5: false, isAndroidApp: false }, {
    getWindowInfo: () => { throw new Error('window unavailable'); },
  });
  assert.equal(fallback.navTopStyle().paddingTop, '64px');
  assert.equal(fallback.navBarStyle().paddingTop, '20px');
});
