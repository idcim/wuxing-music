const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');
const { createRequire } = require('node:module');
const adminRequire = createRequire(path.resolve(__dirname, '../../admin/package.json'));
const Vue = adminRequire('vue');
const { createRenderer, defineComponent, h, reactive, ref, nextTick, onUnmounted } = Vue;

function load(relative, extra = {}) {
  const source = fs.readFileSync(path.resolve(__dirname, '../../admin/src', relative), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { exports, require: adminRequire, ...extra });
  return exports;
}
const RouteCache = load('components/shell/RouteCache.ts').default;
function host() {
  const node = (type, text = '') => ({ type, text, children: [], parent: null });
  const renderer = createRenderer({
    createElement: node, createText: text => node('text', text), createComment: text => node('comment', text),
    setText: (n, text) => { n.text = text; }, setElementText: (n, text) => { n.text = text; }, patchProp: () => {},
    parentNode: n => n.parent, nextSibling: n => n.parent?.children[n.parent.children.indexOf(n) + 1] || null,
    insert(n, parent, anchor = null) {
      if (n.parent) n.parent.children.splice(n.parent.children.indexOf(n), 1);
      const index = anchor ? parent.children.indexOf(anchor) : -1;
      parent.children.splice(index < 0 ? parent.children.length : index, 0, n); n.parent = parent;
    },
    remove(n) { if (n.parent) n.parent.children.splice(n.parent.children.indexOf(n), 1); n.parent = null; },
  });
  return { ...renderer, root: node('root') };
}
const settle = async () => { await nextTick(); await Promise.resolve(); await nextTick(); };
function fixture(Page) {
  const state = reactive({ path: '/a', paths: ['/a', '/b'], revision: 0, enabled: true, owner: 'first' });
  const renderer = host();
  const app = renderer.createApp({ setup: () => () => h(RouteCache, {
    key: state.owner, view: h(Page, { id: state.path }), path: state.path,
    paths: [...state.paths], revision: state.revision, enabled: state.enabled,
  }) });
  app.mount(renderer.root);
  return { state, app };
}

test('真实 Vue 缓存隔离同名页面，保留草稿，关闭与刷新仅销毁对应标签', async () => {
  const instances = new Map(), removed = [];
  const Page = defineComponent({ name: 'Settings', props: ['id'], setup(props) {
    const instance = { draft: ref(''), id: props.id };
    instances.set(props.id, instance); onUnmounted(() => removed.push(instance));
    return () => h('div', instance.draft.value);
  } });
  const { state, app } = fixture(Page);
  try {
    await settle(); const a = instances.get('/a'); a.draft.value = '未保存课程';
    state.path = '/b'; await settle(); const b = instances.get('/b'); b.draft.value = '商品筛选';
    state.path = '/a'; await settle();
    assert.equal(instances.get('/a'), a); assert.equal(a.draft.value, '未保存课程');
    state.revision++; await settle();
    assert.notEqual(instances.get('/a'), a); assert.ok(removed.includes(a)); assert.ok(!removed.includes(b));
    state.path = '/b'; await settle(); assert.equal(instances.get('/b'), b); assert.equal(b.draft.value, '商品筛选');
    state.paths = ['/b']; await settle();
    assert.ok(removed.includes(instances.get('/a')));
    state.paths = ['/a', '/b']; state.path = '/a'; await settle();
    assert.equal(instances.get('/a').draft.value, '');
    state.enabled = false; await settle(); assert.ok(removed.includes(b));
    const plain = instances.get('/a'); state.path = '/b'; await settle(); assert.ok(removed.includes(plain));
    state.enabled = true; await settle(); const ownerPage = instances.get('/b');
    ownerPage.draft.value = '账号私有草稿'; state.owner = 'second'; await settle();
    assert.ok(removed.includes(ownerPage)); assert.equal(instances.get('/b').draft.value, '');
  } finally { app.unmount(); }
});

test('缓存页面 mount/activate 只启动一次，隐藏停轮询，恢复及销毁正确清理', async () => {
  const timers = new Map(); let serial = 0;
  const { useActivePolling } = load('composables/useActivePolling.ts', {
    setInterval: fn => { timers.set(++serial, fn); return serial; }, clearInterval: id => timers.delete(id),
  });
  const calls = { '/a': 0, '/b': 0 }, pauses = { '/a': 0, '/b': 0 };
  const Page = defineComponent({ props: ['id'], setup(props) {
    const id = props.id; useActivePolling(() => { calls[id]++; }, 1000, () => { pauses[id]++; });
    return () => h('div');
  } });
  const { state, app } = fixture(Page);
  try {
    await settle(); assert.equal(calls['/a'], 1); assert.equal(timers.size, 1);
    // 调度后同步切走：已经排入微任务的旧回调也必须失效。
    state.path = '/b'; const oldTimer = [...timers.values()][0]; oldTimer(); await settle();
    assert.equal(calls['/a'], 1); assert.equal(pauses['/a'], 1); assert.equal(calls['/b'], 1); assert.equal(timers.size, 1);
    state.path = '/a'; await settle(); assert.equal(calls['/a'], 2); assert.equal(pauses['/b'], 1); assert.equal(timers.size, 1);
    [...timers.values()][0](); await settle(); assert.equal(calls['/a'], 3);
  } finally { app.unmount(); }
  await settle(); assert.equal(timers.size, 0); assert.equal(pauses['/a'], 2); assert.equal(pauses['/b'], 1);
});

test('音频历史缓存后，从其他页面进入指定批次应用新查询，普通切回保留手动筛选', async () => {
  const { parse, compileScript } = adminRequire('@vue/compiler-sfc');
  const source = fs.readFileSync(path.resolve(__dirname, '../../admin/src/views/AudioHistory.vue'), 'utf8');
  const script = compileScript(parse(source).descriptor, { id: 'audio-history-regression' }).content;
  const route = reactive({ path: '/audio-history', query: { job: '7' } });
  const requests = [];
  const polling = load('composables/useActivePolling.ts', { setInterval: () => 1, clearInterval: () => {} });
  const exports = {};
  const mocks = {
    '@/composables/useActivePolling': polling,
    'vue-router': { useRoute: () => route, useRouter: () => ({ replace: () => {} }) },
    '@/api': { listAudioHistory: async params => { requests.push({ ...params }); return { items: [], total: 0, batch: null }; }, normalizeTrack: async () => {} },
    '@/stores/auth': { useAuthStore: () => ({ can: () => true }) },
    'element-plus': { ElMessage: { success: () => {} } },
  };
  const compiled = ts.transpileModule(script, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(compiled, { exports, require: name => mocks[name] || adminRequire(name) });
  const Page = exports.default; Page.render = () => h('div');
  const state = reactive({ show: true }); const renderer = host(); let history;
  const app = renderer.createApp({ setup: () => () => h(RouteCache, {
    view: state.show ? h(Page, { ref: value => { if (value) history = value; } }) : h({ render: () => h('div') }),
    path: state.show ? '/audio-history' : '/tracks', paths: ['/audio-history', '/tracks'],
  }) });
  app.mount(renderer.root);
  try {
    await settle(); assert.equal(requests.at(-1).job, 7);
    state.show = false; route.path = '/tracks'; route.query = {}; await settle();
    route.path = '/audio-history'; route.query = { job: '19' }; state.show = true; await settle();
    assert.equal(requests.at(-1).job, 19);
    history.$.setupState.job = 24;
    state.show = false; route.path = '/tracks'; route.query = {}; await settle();
    state.show = true; route.path = '/audio-history'; await settle();
    assert.equal(requests.at(-1).job, 24);
  } finally { app.unmount(); }
});
