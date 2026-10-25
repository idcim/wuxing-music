const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function factory() {
  const source = fs.readFileSync(path.join(__dirname, '../../src/services/lesson-progress.ts'), 'utf8');
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
  } }).outputText, { exports }, { filename: 'lesson-progress.js' });
  return Object.assign(exports.createLessonProgress, { wait: exports.waitForLessonProgress });
}
const options = extra => ({ owner: 'user-a', lesson: 1, position: 0, duration: 300,
  currentOwner: () => 'user-a', send: async () => {}, onError: () => {}, ...extra });
const turn = () => new Promise(resolve => setImmediate(resolve));

test('切章关闭后迟到事件不能改写旧章节或新章节进度', async () => {
  const create = factory();
  const writes = [];
  const send = async (id, position) => { writes.push([id, position]); };
  const first = create(options({ send }));
  first.update(27);
  await first.close();
  const second = create(options({ lesson: 2, position: 5, send }));
  first.update(299);
  second.update(16);
  await second.close();
  assert.equal(first.position, 27);
  assert.equal(second.position, 16);
  assert.deepEqual(writes, [[1, 27], [1, 27], [2, 16], [2, 16]]);
});

test('慢请求完成前不发后续请求，最后暂停位置不会被覆盖', async () => {
  const create = factory();
  const writes = [];
  let release;
  const first = new Promise(resolve => { release = resolve; });
  const progress = create(options({ send: async (id, position) => {
    writes.push(position); if (writes.length === 1) await first;
  } }));
  progress.update(20);
  await turn();
  progress.update(5); // 用户主动向后拖动，也要保存最新位置。
  const closed = progress.close();
  await turn();
  assert.deepEqual(writes, [20]);
  release();
  await closed;
  assert.deepEqual(writes, [20, 5, 5]);
});

test('同一章节重新创建播放器仍等待旧会话最后一次写入', async () => {
  const create = factory();
  let release;
  const wait = new Promise(resolve => { release = resolve; });
  const writes = [];
  const old = create(options({ send: async (_, value) => { await wait; writes.push(value); } }));
  old.update(40);
  const oldClose = old.close();
  const next = create(options({ position: 40, send: async (_, value) => { writes.push(value); } }));
  next.update(51);
  const nextClose = next.close();
  await turn();
  assert.deepEqual(writes, []);
  release(); await Promise.all([oldClose, nextClose]);
  assert.deepEqual(writes, [40, 40, 51, 51]);
});

test('网络失败可见且可重试，失败不阻塞后续保存', async () => {
  let attempts = 0;
  let errors = 0;
  const progress = factory()(options({ position: 17,
    send: async (_, value) => { assert.equal(value, 17); if (++attempts === 1) throw new Error('offline'); },
    onError: () => { errors++; },
  }));
  await assert.rejects(progress.save(), /offline/);
  await progress.save();
  assert.equal(errors, 1);
  assert.equal(attempts, 2);
});

test('重新获取播放地址前等待同账号章节保存，其他章节不阻塞', async () => {
  const create = factory();
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  const progress = create(options({ send: () => blocked }));
  const saving = progress.save();
  let ready = false;
  const loading = create.wait('user-a', 1).then(() => { ready = true; });
  await create.wait('user-a', 2);
  await turn(); assert.equal(ready, false);
  release(); await Promise.all([saving, loading]);
  assert.equal(ready, true);
});

test('排队中切换账号不把原账号的进度提交给新账号', async () => {
  let owner = 'user-a';
  let writes = 0;
  const progress = factory()(options({ currentOwner: () => owner, send: async () => { writes++; } }));
  const saving = progress.save();
  owner = 'user-b';
  await saving;
  assert.equal(writes, 0);
});

test('无效时间忽略、越界时间限制在媒体时长以内', async () => {
  const progress = factory()(options({ position: 12 }));
  progress.update(NaN); progress.update(Infinity);
  assert.equal(progress.position, 12);
  progress.update(-1); assert.equal(progress.position, 0);
  progress.update(400); assert.equal(progress.position, 300);
  await progress.close();
});
