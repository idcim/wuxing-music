// 挂载真实课程/商城列表，验证分类切换生成的请求能被后端整数参数解析。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');
const React = require('react');
const { create, act } = require('react-test-renderer');

function mount(relativeFile, config = {}) {
  const requests = [];
  const mocks = {
    react: React,
    'react/jsx-runtime': require('react/jsx-runtime'),
    '@tarojs/components': { View: 'view', Text: 'text', Button: 'button', Image: 'image' },
    '@tarojs/taro': { default: { navigateTo: () => {} }, useRouter: () => ({ params: {} }) },
    '@/services/commerce': {
      coursePath: '/packages/courses', shopPath: '/packages/shop', money: n => `¥${n / 100}`,
      useCommerce: select => select({ config: { courses_visible: true, shop_visible: true, ...config } }),
    },
    '@/stores/player': { usePlayerStore: () => ({}) },
    '@/assets/commerce/course-banner.jpg': { default: 'local-course-banner' },
    '@/assets/commerce/shop-banner.jpg': { default: 'local-shop-banner' },
    '@/components/MarkdownView': { default: () => null },
    '@/utils/url': { resolveUrl: value => value },
    '@/features/commerce/common': {
      CommercePage: ({ children }) => React.createElement('page', null, children),
      Cover: props => React.createElement('cover', props), Feedback: () => null, CustomerService: () => null,
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
  return { requests, choose, images: () => renderer.root.findAllByType('image'),
    covers: () => renderer.root.findAllByType('cover'), close: () => act(() => renderer.unmount()) };
}

for (const [kind, file] of [
  ['course', 'src/packages/courses/list/index.tsx'],
  ['shop', 'src/packages/shop/list/index.tsx'],
]) {
  test(`${kind} 未配置运营海报时显示内置品牌海报`, () => {
    const ui = mount(file);
    try { assert.equal(ui.images()[0]?.props.src, `local-${kind}-banner`); }
    finally { ui.close(); }
  });
}

for (const [kind, file, field] of [
  ['course', 'src/packages/courses/list/index.tsx', 'course_banner'],
  ['shop', 'src/packages/shop/list/index.tsx', 'shop_banner'],
]) {
  test(`${kind} 后台运营海报优先于内置图片`, () => {
    const ui = mount(file, { [field]: 'https://example.test/banner.jpg' });
    try {
      assert.equal(ui.images().length, 0);
      assert.equal(ui.covers()[0]?.props.src, 'https://example.test/banner.jpg');
    } finally { ui.close(); }
  });
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
