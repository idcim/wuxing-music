export default defineAppConfig({
  pages: [
    'pages/splash/index',
    'pages/onboard/index',
    'pages/login/index',
    'pages/agreement/index',
    'pages/quiz/index',
    'pages/result/index',
    'pages/home/index',
    'pages/explore/index',
    'pages/element/index',
    'pages/tones/index',
    'pages/member/index',
    'pages/profile/index',
    'pages/userinfo/index',
    'pages/settings/index',
    'pages/orders/index',
    'pages/history/index',
    'pages/player/index',
    'pages/agent/index',
    'pages/about/index',
    'pages/h5play/index',
    'pages/webview/index',
    ...(process.env.TARO_APP_PLATFORM === 'android' ? [
      'packages/courses/list/index', 'packages/courses/detail/index', 'packages/courses/mine/index', 'packages/courses/learn/index',
      'packages/shop/list/index', 'packages/shop/detail/index', 'packages/shop/cart/index', 'packages/shop/checkout/index',
      'packages/shop/addresses/index', 'packages/shop/orders/index', 'packages/shop/order/index', 'packages/shop/aftersale/index', 'packages/shop/logistics/index',
    ] : []),
  ],
  subPackages: process.env.TARO_ENV === 'weapp' ? [
    { root: 'packages/courses', pages: ['list/index', 'detail/index', 'mine/index', 'learn/index'] },
    { root: 'packages/shop', pages: ['list/index', 'detail/index', 'cart/index', 'checkout/index', 'addresses/index', 'orders/index', 'order/index', 'aftersale/index', 'logistics/index'] },
  ] : [],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#03050a',
    navigationBarTitleText: '五行律音',
    navigationBarTextStyle: 'white',
    backgroundColor: '#03050a'
  },
  requiredBackgroundModes: ['audio']
});
