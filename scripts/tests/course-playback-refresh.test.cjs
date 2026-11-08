const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { create, act } = require('react-test-renderer');

test('课程媒体播放报错后自动重新授权一次，重复报错仍可手动刷新', async () => {
  let playRequests = 0;
  let saves = 0;
  let waits = 0;
  const toasts = [];
  const progress = () => ({
    active: true, position: 12, update: () => {},
    save: async () => { saves++; }, close: async () => {},
  });
  const taro = {
    createVideoContext: () => ({ pause: () => {} }),
    showToast: options => { toasts.push(options.title); },
  };
  const mocks = {
    react: React,
    'react/jsx-runtime': require('react/jsx-runtime'),
    '@tarojs/components': { View: 'view', Text: 'text', Button: 'button', Slider: 'slider', Video: 'video' },
    '@tarojs/taro': { default: taro, useDidHide: () => {}, useDidShow: () => {},
      useRouter: () => ({ params: { id: '1', lesson: '5' } }) },
    '@/services/commerce': { commerceApi: async endpoint => {
      if (endpoint === '/lessons/5/play') return { title: '第一节', url: `url-${++playRequests}`, kind: 'video', position: 12, duration: 60 };
      return {};
    } },
    '@/services/lesson-progress': { createLessonProgress: progress,
      waitForLessonProgress: async () => { waits++; } },
    '@/stores/player': { usePlayerStore: Object.assign(() => ({}), {
      getState: () => ({ pause: () => {} }), subscribe: () => () => {},
    }) },
    '@/stores/user': { useUserStore: Object.assign(selector => selector({ user: { id: '1' } }), {
      getState: () => ({ user: { id: '1' } }),
    }) },
    '@/features/commerce/common': {
      CommercePage: ({ children }) => React.createElement('page', null, children),
      Cover: () => null, Feedback: () => null,
      action: async work => work(),
      useData: (endpoint, initial, fetcher) => {
        if (endpoint.startsWith('/courses/')) return { data: { cover: '', lessons: [] } };
        const [data, setData] = React.useState({ title: '第一节', url: 'url-0', kind: 'video', position: 12, duration: 60 });
        return { data, loading: false, error: '', load: async () => setData(await fetcher(endpoint)) };
      },
    },
  };
  const source = fs.readFileSync(path.join(__dirname, '../../src/packages/courses/learn/index.tsx'), 'utf8');
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, { exports, require: name => {
    if (!(name in mocks)) throw new Error(`未替换依赖 ${name}`);
    return mocks[name];
  } });
  let renderer;
  act(() => { renderer = create(React.createElement(exports.default)); });
  try {
    const video = () => renderer.root.findByType('video');
    await act(async () => { video().props.onError(); });
    assert.equal(playRequests, 1);
    assert.equal(video().props.src, 'url-1');
    assert.equal(video().props.initialTime, 12);
    assert.equal(video().props.autoplay, true);
    assert.equal(saves, 1);
    assert.equal(waits, 1);
    await act(async () => { video().props.onError(); });
    assert.equal(playRequests, 1);
    assert.match(toasts.at(-1), /播放失败/);
    const refresh = renderer.root.findAllByType('button').find(node => node.children.join('') === '刷新播放地址');
    await act(async () => { await refresh.props.onClick(); });
    assert.equal(playRequests, 2);
    assert.equal(video().props.autoplay, false);
  } finally { act(() => renderer.unmount()); }
});
