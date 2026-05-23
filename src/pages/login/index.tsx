import { View, Text } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import Icon from '@/components/Icon';
import { useUserStore } from '@/stores/user';
import './index.scss';

export default function Login() {
  const loggingIn = useUserStore((s) => s.loggingIn);
  const login = useUserStore((s) => s.login);

  // 已登录用户直接跳走
  useDidShow(() => {
    if (useUserStore.getState().user) {
      Taro.reLaunch({ url: '/pages/home/index' });
    }
  });

  const onLogin = async () => {
    if (loggingIn) return;
    try {
      await login();
      Taro.reLaunch({ url: '/pages/home/index' });
    } catch {
      Taro.showToast({ title: '登录失败，请重试', icon: 'none' });
    }
  };

  return (
    <View className="login">
      <View className="login__brand fade-up">
        <View className="login__moon float">
          <View className="login__moon-halo" />
          <Icon name="moon" size={88} color="#cbd5e1" strokeWidth={1} />
        </View>
        <Text className="login__title serif">五行律音</Text>
        <Text className="login__slogan cormorant italic">SOUND HEALS · MUSIC RESTORES</Text>
      </View>

      <View className="login__actions fade-up" style={{ animationDelay: '0.2s' }}>
        <View
          className={`login__btn ${loggingIn ? 'login__btn--loading' : ''}`}
          onClick={onLogin}
        >
          <Text className="login__btn-text">{loggingIn ? '登录中…' : '微信一键登录'}</Text>
        </View>
        <Text className="login__terms">登录即同意服务条款与隐私政策</Text>
      </View>
    </View>
  );
}
