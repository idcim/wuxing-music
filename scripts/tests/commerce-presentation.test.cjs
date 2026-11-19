const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');
const React = require('react');
const { create, act } = require('react-test-renderer');

function ui() {
  const site = { theme_id: 'chinese_classic', site_name: '测试品牌', logo_url: '/brand.png' };
  const mocks = {
    react: React, 'react/jsx-runtime': require('react/jsx-runtime'),
    '@tarojs/components': { View: 'view', Text: 'text', Button: 'button', Image: 'image', Input: 'input' },
    '@tarojs/taro': { default: {}, useDidShow: () => {} },
    '@/services/commerce': { useCommerce: select => select({ config: {} }) },
    '@/stores/user': {}, '@/utils/url': { resolveUrl: value => value },
    '@/utils/nav': { navTopStyle: () => ({}), navBarStyle: () => ({}) },
    '@/stores/site': { useSiteStore: select => select({ site }) },
    '@/theme': { THEMES: { chinese_classic: { accent: '#cb7758' } } },
    '@/components/Icon': { default: () => null }, '@/components/TabBar': { default: () => null },
    '@/components/MiniPlayer': { default: () => null }, './commerce.scss': {},
  };
  const source = fs.readFileSync(path.join(__dirname, '../../src/features/commerce/common.tsx'), 'utf8');
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText,
    { exports, require: name => { if (!(name in mocks)) throw new Error(name); return mocks[name]; } });
  return exports;
}

test('数量控件限制库存、整数与最少一件，禁用时不发变更', () => {
  const { QuantityStepper } = ui();
  const values = [];
  let renderer;
  act(() => { renderer = create(React.createElement(QuantityStepper, { value: 1, max: 5, onChange: value => values.push(value) })); });
  try {
    const input = () => renderer.root.findByType('input');
    assert.equal(renderer.root.findAllByType('button')[0].props.disabled, true);
    for (const value of ['99', '-2', '3.7', 'invalid']) act(() => { input().props.onInput({ detail: { value } }); });
    assert.deepEqual(values, [5, 1, 3, 1]);
    act(() => renderer.update(React.createElement(QuantityStepper, { value: 5, max: 5, disabled: true, onChange: value => values.push(value) })));
    act(() => { input().props.onInput({ detail: { value: '2' } }); renderer.root.findAllByType('button')[1].props.onClick(); });
    assert.equal(values.length, 4);
    assert.equal(renderer.root.findAllByType('button')[1].props.disabled, true);
  } finally { act(() => renderer.unmount()); }
});

test('品牌页头使用后台名称，LOGO 按完整比例显示，操作栏仍渲染', () => {
  const { CommercePage } = ui();
  let renderer;
  act(() => { renderer = create(React.createElement(CommercePage, { title: '课程', tab: 'course', footer: React.createElement('button', null, '购买') }, '课程内容')); });
  try {
    const image = renderer.root.findByType('image');
    assert.equal(image.props.src, '/brand.png');
    assert.equal(image.props.mode, 'aspectFit');
    assert.ok(renderer.root.findAllByType('text').some(node => node.children.join('') === '测试品牌'));
    assert.ok(renderer.root.findAllByType('button').some(node => node.children.join('') === '购买'));
  } finally { act(() => renderer.unmount()); }
});
