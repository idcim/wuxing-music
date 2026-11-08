// 挂载真实购物车页面，检查结算返回后服务端已移除商品的选择状态。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');
const React = require('react');
const { create, act } = require('react-test-renderer');

test('购物车条目已被结算移除后，不再保留可结算的幽灵勾选', () => {
  let setCart;
  const navigations = [];
  const mocks = {
    react: React,
    'react/jsx-runtime': require('react/jsx-runtime'),
    '@tarojs/components': { View: 'view', Text: 'text', Button: 'button' },
    '@tarojs/taro': { default: { navigateTo: options => navigations.push(options.url) }, useRouter: () => ({ params: {} }) },
    '@/services/commerce': {
      shopPath: '/packages/shop', money: n => `¥${n / 100}`,
      useCommerce: select => select({ config: { shop_sale: true } }),
      commerceApi: async () => {},
    },
    '@/utils/url': { resolveUrl: value => value },
    '@/components/MarkdownView': { default: () => null },
    '@/features/commerce/common': {
      CommercePage: ({ children }) => React.createElement('page', null, children),
      Feedback: () => null, Cover: () => null, CustomerService: () => null,
      requireCommerceLogin: () => true, action: async work => work(),
      useData: () => {
        const [data, setData] = React.useState([{ id: 12, sku_id: 4, quantity: 1,
          product: { title: '测试茶' }, sku: { name: '一盒', price_fen: 1000, available: 3 } }]);
        setCart = setData;
        return { data, loading: false, error: '', load: async () => {} };
      },
    },
  };
  const source = fs.readFileSync(path.join(__dirname, '../../src/packages/shop/cart/index.tsx'), 'utf8');
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
    const row = renderer.root.findAllByType('text').find(node => node.children.join('').includes('测试茶'));
    act(() => { row.props.onClick(); });
    const checkout = () => renderer.root.findAllByType('button').find(node => node.children.join('') === '去结算');
    assert.equal(checkout().props.disabled, false);
    act(() => { setCart([]); });
    assert.equal(checkout().props.disabled, true);
    assert.equal(navigations.length, 0);
  } finally { act(() => renderer.unmount()); }
});
