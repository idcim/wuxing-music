const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { create, act } = require('react-test-renderer');

test('游客可打开免费试听，付费章节仍引导登录', () => {
  const navigations = [];
  let loginPrompts = 0;
  const mocks = {
    react: React,
    'react/jsx-runtime': require('react/jsx-runtime'),
    '@tarojs/components': { View: 'view', Text: 'text', Button: 'button', Slider: 'slider', Video: 'video' },
    '@tarojs/taro': { default: { navigateTo: options => navigations.push(options.url), showToast: () => {} },
      useDidHide: () => {}, useRouter: () => ({ params: { id: '8' } }) },
    '@/services/commerce': { coursePath: '/packages/courses', shopPath: '/packages/shop',
      money: value => `¥${value / 100}`, useCommerce: select => select({ config: { courses_sale: false } }) },
    '@/stores/player': { usePlayerStore: () => ({}) },
    '@/components/MarkdownView': { default: () => null },
    '@/features/commerce/common': {
      CommercePage: ({ children }) => React.createElement('page', null, children),
      Cover: () => null, CustomerService: () => null, Feedback: () => null,
      action: async work => work(),
      requireCommerceLogin: () => { loginPrompts++; return false; },
      useData: () => ({ data: { id: 8, title: '声乐课', price_fen: 1000, owned: false, lesson_count: 2,
        lessons: [{ id: 10, title: '免费试听', preview: true }, { id: 11, title: '付费章节', preview: false }] },
        loading: false, error: '', load: async () => {} }),
    },
  };
  const source = fs.readFileSync(path.join(__dirname, '../../src/packages/courses/detail/index.tsx'), 'utf8');
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
    const lesson = title => renderer.root.findAllByType('text').find(node => node.children.join('').includes(title));
    act(() => { lesson('免费试听').parent.props.onClick(); });
    assert.deepEqual(navigations, ['/packages/courses/learn/index?id=8&lesson=10']);
    assert.equal(loginPrompts, 0);
    act(() => { lesson('付费章节').parent.props.onClick(); });
    assert.equal(navigations.length, 1);
    assert.equal(loginPrompts, 1);
  } finally { act(() => renderer.unmount()); }
});
