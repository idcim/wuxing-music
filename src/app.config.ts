export default defineAppConfig({
  pages: [
    'pages/splash/index',
    'pages/onboard/index',
    'pages/quiz/index',
    'pages/result/index',
    'pages/home/index',
    'pages/explore/index',
    'pages/member/index',
    'pages/profile/index'
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#03050a',
    navigationBarTitleText: '五行律音',
    navigationBarTextStyle: 'white',
    backgroundColor: '#03050a'
  },
  tabBar: {
    custom: true,
    color: '#64748b',
    selectedColor: '#e2e8f0',
    backgroundColor: '#03050a',
    list: [
      { pagePath: 'pages/home/index', text: '归处' },
      { pagePath: 'pages/explore/index', text: '探律' },
      { pagePath: 'pages/member/index', text: '会员' },
      { pagePath: 'pages/profile/index', text: '我的' }
    ]
  },
  requiredBackgroundModes: ['audio']
});
