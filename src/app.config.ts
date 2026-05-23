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
    'pages/member/index',
    'pages/profile/index',
    'pages/history/index',
    'pages/player/index',
    'pages/about/index'
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#03050a',
    navigationBarTitleText: '五行律音',
    navigationBarTextStyle: 'white',
    backgroundColor: '#03050a'
  },
  requiredBackgroundModes: ['audio']
});
