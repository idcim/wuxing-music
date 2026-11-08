// 挂载真实课程/商城列表，验证分类切换生成的请求能被后端整数参数解析。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');
const React = require('react');
const { create, act } = require('react-test-renderer');

function mount(relativeFile) {
  const requests = [];
  const mocks = {
    react: React,
    'react/jsx-runtime': require('react/jsx-runtime'),
    '@tarojs/components': { View: 'view', Text: 'text', Button: 'button' },
    '@tarojs/taro': { default: { navigateTo: () => {} }, useRouter: () => ({ params: {} }) },
    '@/services/commerce': {
      coursePath: '/packages/courses', shopPath: '/packages/shop', money: n => `¥${n / 100}`,
      useCommerce: select => select({ config: { courses_visible: true, shop_visible: true } }),
    },
    '@/stores/player': { usePlayerStore: () => ({}) },
    '@/components/MarkdownView': { default: () => null },
    '@/utils/url': { resolveUrl: value => value },
    '@/features/commerce/common': {
      CommercePage: ({ children }) => React.createElement('page', null, children),
      Cover: () => null, Feedback: () => null, CustomerService: () => null,
      requireCommerceLogin: () => false,
      useData: url => {
        requests.push(url);
        return { data: { categories: [{ id: 7, name: '分类七' }, { id: 8, name: '分类八' }], items: [], total: 0 }, loading: false, error: '', load: () => {} };
      },
    },
  };
  const source = fs.readFileSync(path.join(__dirname, '../../', relativeFile), 'utf8');
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, { exports, require: name => {
    if (!(name in mocks)) throw new Error(`未替换依赖 ${name}`);
    return mocks[name];
  } });
  let renderer;
  act(() => { renderer = create(React.createElement(exports.default)); });
  const choose = label => {
    const chip = renderer.root.findAllByType('text').find(node => node.children.join('') === label);
    assert.ok(chip, `缺少分类 ${label}`);
    act(() => { chip.props.onClick(); });
  };
  return { requests, choose, close: () => act(() => renderer.unmount()) };
}

for (const [kind, file] of [
  ['course', 'src/packages/courses/list/index.tsx'],
  ['physical', 'src/packages/shop/list/index.tsx'],
]) {
  test(`${kind} 目录全部分类不发送空整数，具体分类发送编号`, () => {
    const ui = mount(file);
    try {
      assert.equal(ui.requests.at(-1), `/catalog/${kind}?page=1`);
      ui.choose('分类七');
      assert.equal(ui.requests.at(-1), `/catalog/${kind}?page=1&category=7`);
      ui.choose('全部');
      assert.equal(ui.requests.at(-1), `/catalog/${kind}?page=1`);
    } finally { ui.close(); }
  });
}
