import { useState } from 'react';
import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { WUXING } from '@/constants/wuxing';
import { useUserStore } from '@/stores/user';
import { bindPhone } from '@/services/user';
import CdkeyModal from '@/components/CdkeyModal';
import MiniPlayer from '@/components/MiniPlayer';
import TabBar from '@/components/TabBar';
import type { ElementId } from '@/types';
import './index.scss';

export default function Profile() {
  const element = useUserStore((s) => s.element);
  const isPremium = useUserStore((s) => s.isPremium);
  const user = useUserStore((s) => s.user);
  const loggingIn = useUserStore((s) => s.loggingIn);
  const login = useUserStore((s) => s.login);
  const logout = useUserStore((s) => s.logout);
  const setPhone = useUserStore((s) => s.setPhone);
  const el = element ? WUXING[element as ElementId] : null;

  const [cdkeyOpen, setCdkeyOpen] = useState(false);

  const retakeQuiz = () => Taro.navigateTo({ url: '/pages/quiz/index' });
  const goAbout = () => Taro.navigateTo({ url: '/pages/about/index' });

  // 绑定手机号：真实环境用 getPhoneNumber 授权按钮拿加密数据；此处弹窗输入模拟。
  const onBindPhone = () => {
    if (!user) {
      Taro.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    Taro.showModal({
      title: '绑定手机号',
      editable: true,
      placeholderText: '请输入手机号',
      success: async (res: any) => {
        if (!res.confirm || !res.content) return;
        const phone = String(res.content).trim();
        if (!/^1\d{10}$/.test(phone)) {
          Taro.showToast({ title: '手机号格式不对', icon: 'none' });
          return;
        }
        try {
          const bound = await bindPhone(Number(user.id), phone);
          setPhone(bound);
          Taro.showToast({ title: '绑定成功', icon: 'success' });
        } catch {
          Taro.showToast({ title: '绑定失败', icon: 'none' });
        }
      }
    } as any);
  };

  const onLogin = async () => {
    try {
      await login();
    } catch {
      Taro.showToast({ title: '登录失败，请重试', icon: 'none' });
    }
  };

  const onLogout = () => {
    Taro.showModal({
      title: '退出登录',
      content: '确定要退出当前账号吗？',
      success: (res) => { if (res.confirm) logout(); }
    });
  };

  return (
    <View className="profile">
      <Text className="profile__title serif">我的</Text>

      <View className="profile__user fade-up">
        <View className="profile__avatar" style={{ background: el?.glow || 'rgba(255,255,255,0.06)' }}>
          <Text className="profile__avatar-text serif" style={{ color: el?.primary || '#e2e8f0' }}>
            {el ? el.id : '律'}
          </Text>
        </View>
        <View className="profile__user-info">
          <Text className="profile__user-name">{user ? user.nickname : '未登录'}</Text>
          {user ? (
            <Text className="profile__user-action" onClick={onLogout}>退出登录</Text>
          ) : (
            <Text className="profile__user-action" onClick={onLogin}>
              {loggingIn ? '登录中…' : '微信登录 ›'}
            </Text>
          )}
        </View>
      </View>

      <View className="profile__card fade-up">
        <Text className="profile__card-label">本命五行</Text>
        <Text className="profile__card-el serif" style={{ color: el?.primary || '#e2e8f0' }}>
          {el ? `${el.id}型 · ${el.note}音` : '尚未测评'}
        </Text>
        <Text className="profile__card-link" onClick={retakeQuiz}>
          {el ? '重新测评 ›' : '立即测评 ›'}
        </Text>
      </View>

      <View className="profile__card fade-up">
        <Text className="profile__card-label">会员状态</Text>
        <Text className="profile__card-el serif">
          {isPremium && user ? user.membership.name : '听闻 · 免费'}
        </Text>
        {isPremium && user?.membership.expireAt && (
          <Text className="profile__card-link">
            {new Date(user.membership.expireAt).toLocaleDateString()} 到期
          </Text>
        )}
      </View>

      <View className="profile__entry fade-up" onClick={onBindPhone}>
        <Text className="profile__entry-text">手机号</Text>
        <Text className="profile__entry-arrow">
          {user?.phone ? `${user.phone} ›` : '去绑定 ›'}
        </Text>
      </View>

      <View className="profile__entry fade-up" onClick={() => setCdkeyOpen(true)}>
        <Text className="profile__entry-text">兑换码</Text>
        <Text className="profile__entry-arrow">›</Text>
      </View>

      <View className="profile__entry fade-up" onClick={goAbout}>
        <Text className="profile__entry-text">关于我们</Text>
        <Text className="profile__entry-arrow">›</Text>
      </View>

      <CdkeyModal open={cdkeyOpen} onClose={() => setCdkeyOpen(false)} />
      <MiniPlayer />
      <TabBar active="profile" />
    </View>
  );
}
