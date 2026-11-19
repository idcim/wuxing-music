const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, extra = {}) {
  const source = fs.readFileSync(path.resolve(__dirname, '../../', file), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { exports, require, ...extra });
  return exports;
}
test('APP管理使用独立权限且始终为二级菜单', () => {
  const { NAV_GROUPS, NAV_ALL } = load('admin/src/menu.ts');
  const apps = NAV_ALL.filter(item => item.path === '/apps');
  assert.equal(apps.length, 1);
  assert.equal(apps[0].perm, 'apps:view');
  const group = NAV_GROUPS.find(item => item.items.includes(apps[0]));
  assert.equal(group.title, '配置与权限');
  assert.ok(group.items.every(item => !item.items));
});
test('APP管理路由与菜单共用查看权限，无查看权限不能进入', async () => {
  const menu = load('admin/src/menu.ts');
  let config, guard;
  const allowed = new Set(['dashboard:view']);
  const mocks = {
    'vue-router': { createWebHistory: () => ({}), createRouter: value => { config = value; return { beforeEach: value => { guard = value; } }; } },
    'element-plus': { ElMessage: { error() {} } },
    '@/stores/auth': { useAuthStore: () => ({ loaded: true, can: value => allowed.has(value), hasFeature: () => true }) },
    '@/menu': menu,
  };
  load('admin/src/router/index.ts', { require: name => mocks[name], localStorage: { getItem: () => 'session' } });
  const route = config.routes.find(item => item.path === '/').children.find(item => item.path === 'apps');
  assert.equal(route.meta.perm, 'apps:view');
  assert.equal(await guard({ path: '/apps', meta: route.meta }), '/dashboard');
  allowed.add('apps:view');
  assert.equal(await guard({ path: '/apps', meta: route.meta }), true);
});
test('APK只直传HTTPS OSS，携带签名表单和文件，报告进度且不携带后台凭证', async () => {
  let xhr;
  class FakeXhr {
    constructor() { xhr = this; this.upload = {}; this.headers = []; }
    open(...args) { this.openArgs = args; }
    setRequestHeader(...args) { this.headers.push(args); }
    send(body) { this.body = body; }
    abort() { this.onabort?.(); }
  }
  class FakeForm { constructor() { this.fields = []; } append(...args) { this.fields.push(args); } }
  const { uploadApk } = load('admin/src/components/apps/upload.ts', { XMLHttpRequest: FakeXhr, FormData: FakeForm, URL, Error });
  const file = { name: 'preview.apk', size: 123 };
  const progress = [];
  const promise = uploadApk(file, { host: 'https://bucket.oss-cn-hangzhou.aliyuncs.com', fields: { key: 'apps/preview.apk', policy: 'signed' } }, value => progress.push(value));
  assert.deepEqual(Array.from(xhr.openArgs), ['POST', 'https://bucket.oss-cn-hangzhou.aliyuncs.com', true]);
  assert.equal(xhr.withCredentials, false);
  assert.equal(xhr.headers.length, 0);
  assert.deepEqual(xhr.body.fields.map(row => row[0]), ['key', 'policy', 'file']);
  xhr.upload.onprogress({ lengthComputable: true, loaded: 50, total: 100 });
  assert.equal(progress.at(-1), 50);
  xhr.status = 204; xhr.onload(); await promise;
  const failed = uploadApk(file, { host: 'https://bucket.example.com', fields: {} }, () => {});
  xhr.status = 403; xhr.onload(); await assert.rejects(failed, /403/);
  await assert.rejects(uploadApk(file, { host: 'http://bucket.example.com', fields: {} }, () => {}), /HTTPS/);
});
test('取消APK上传会中止请求并可安全关闭弹窗', async () => {
  let xhr;
  class FakeXhr { constructor() { xhr = this; this.upload = {}; } open() {} send() {} abort() { this.aborted = true; this.onabort?.(); } }
  const { uploadApk } = load('admin/src/components/apps/upload.ts', { XMLHttpRequest: FakeXhr, FormData: class { append() {} }, URL, Error });
  const controller = new AbortController();
  const promise = uploadApk({ name: 'a.apk' }, { host: 'https://oss.example.com', fields: {} }, () => {}, controller.signal);
  controller.abort();
  await assert.rejects(promise, /取消/);
  assert.equal(xhr.aborted, true);
});
