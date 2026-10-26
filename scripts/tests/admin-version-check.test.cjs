const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../../admin/src/utils/version-check.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const exportsForTest = {};
vm.runInNewContext(compiled, { exports: exportsForTest });
const { createVersionChecker, readAdminBuild } = exportsForTest;
const reply = (value, type = 'application/json', ok = true) => ({ ok, headers: { get: () => type }, json: async () => value });

test('首次检查已部署新版时与当前页面构建比较，不把新版当成初始基线', async () => {
  const check = createVersionChecker('loaded-old-build', async () => 'newly-deployed-build');
  assert.equal((await check()).state, 'available');
});
test('相同页面构建不提示更新，服务器后续发布可以检测到', async () => {
  let build = 'current-build';
  const check = createVersionChecker('current-build', async () => build);
  assert.equal((await check()).state, 'current');
  build = 'next-build';
  assert.equal((await check()).buildId, 'next-build');
});
test('读取当前后台独立清单，禁用缓存且不携带凭证', async () => {
  let request;
  const build = await readAdminBuild(async (url, options) => { request = { url, options }; return reply({ schema: 1, buildId: 'build-123' }); }, '/admin-version.json');
  assert.equal(build, 'build-123');
  assert.equal(request.url, '/admin-version.json');
  assert.equal(request.options.cache, 'no-store');
  assert.equal(request.options.credentials, 'omit');
  assert.equal(request.options.redirect, 'error');
});
test('SPA 回退 HTML、未就绪清单、错误结构和网络失败均不冒充更新', async () => {
  for (const fetcher of [
    async () => reply({}, 'text/html'), async () => reply({}, 'application/json', false),
    async () => reply({ schema: 2, buildId: 'wrong-schema' }), async () => reply({ schema: 1 }),
    async () => reply({ schema: 1, buildId: '<invalid>' }), async () => { throw new Error('offline'); },
  ]) assert.equal(await readAdminBuild(fetcher, '/admin-version.json'), null);
});
test('手动检查与轮询同时发生时共用同一请求，完成后允许再查', async () => {
  let resolve, count = 0;
  const check = createVersionChecker('current', () => { count++; return new Promise((done) => { resolve = done; }); });
  const first = check(), second = check();
  assert.equal(first, second);
  assert.equal(count, 1);
  resolve('next');
  assert.equal((await first).state, 'available');
  const third = check();
  assert.equal(count, 2);
  resolve('current');
  assert.equal((await third).state, 'current');
});
test('检测失败后仍可恢复，不把临时故障记成已更新版本', async () => {
  let count = 0;
  const check = createVersionChecker('current', async () => { if (++count === 1) throw new Error('temporary'); return 'new-build'; });
  assert.equal((await check()).state, 'unavailable');
  assert.equal((await check()).state, 'available');
});
