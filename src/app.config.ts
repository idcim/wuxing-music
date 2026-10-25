export default defineAppConfig({
  pages: [
    'pages/splash/index',
    'pages/onboard/index',
    'pages/login/index',
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
    'pages/webview/index'
  ],
  subPackages: process.env.TARO_ENV === 'weapp' ? [
    { root: 'packages/courses', pages: ['list/index', 'detail/index', 'mine/index', 'learn/index'] },
    { root: 'packages/shop', pages: ['list/index', 'detail/index', 'cart/index', 'checkout/index', 'addresses/index', 'orders/index', 'order/index', 'aftersale/index'] },
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
