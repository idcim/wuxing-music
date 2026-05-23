import { useState } from 'react';
import { View, Text, Image, Button } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { WUXING } from '@/constants/wuxing';
import { useUserStore } from '@/stores/user';
import { bindPhone } from '@/services/user';
import Icon from '@/components/Icon';
import { A } from '@/utils/color';
import { getNavTop } from '@/utils/nav';
import CdkeyModal from '@/components/CdkeyModal';
import MiniPlayer from '@/components/MiniPlayer';
import TabBar from '@/components/TabBar';
import type { ElementId } from '@/types';
import type { IconName } from '@/components/Icon/paths';
import './index.scss';

const BARS = [40, 65, 30, 80, 55, 70, 45];
const WEEK_LABELS = ['一', '二', '三', '四', '五', '六', '今'];

export default function Profile() {
  const element = useUserStore((s) => s.element);
  const isPremium = useUserStore((s) => s.isPremium);
  const user = useUserStore((s) => s.user);
  const loggingIn = useUserStore((s) => s.loggingIn);
  const login = useUserStore((s) => s.login);
  const logout = useUserStore((s) => s.logout);
  const setPhone = useUserStore((s) => s.setPhone);
  const setProfile = useUserStore((s) => s.setProfile);
  const el = WUXING[(element as ElementId) || '木'];

  const [cdkeyOpen, setCdkeyOpen] = useState(false);

  const retakeQuiz = () => Taro.navigateTo({ url: '/pages/quiz/index' });
  const goAbout = () => Taro.navigateTo({ url: '/pages/about/index' });

  // 会员剩余天数
  const expireDays = user?.membership.expireAt
    ? Math.max(
        0,
        Math.ceil((new Date(user.membership.expireAt).getTime() - Date.now()) / 86400000)
      )
    : null;

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
      success: (res) => {
        if (res.confirm) logout();
      }
    });
  };

  // 微信头像授权（open-type=chooseAvatar 的回调里 e.detail.avatarUrl）
  const onChooseAvatar = (e: any) => {
    const url = e?.detail?.avatarUrl;
    if (url) {
      setProfile({ avatar: url });
      Taro.showToast({ title: '头像已更新', icon: 'success' });
    }
  };

  // 修改昵称（弹窗输入）
  const onEditNickname = () => {
    if (!user) {
      Taro.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    Taro.showModal({
      title: '修改昵称',
      editable: true,
      placeholderText: '输入新昵称',
      content: user.nickname || '',
      success: (res: any) => {
        const name = String(res?.content || '').trim();
        if (res.confirm && name) {
          setProfile({ nickname: name });
          Taro.showToast({ title: '已更新', icon: 'success' });
        }
      }
    } as any);
  };

  // 功能菜单
  const menu: { icon: IconName; text: string; onClick: () => void; highlight?: boolean }[] = [
    { icon: 'user', text: '修改昵称', onClick: onEditNickname },
    { icon: 'circleDot', text: user?.phone ? `手机号 ${user.phone}` : '绑定手机号', onClick: onBindPhone },
    { icon: 'keyRound', text: '兑换码 / CDKEY', onClick: () => setCdkeyOpen(true), highlight: true },
    { icon: 'user', text: element ? '重新测评体质' : '立即测评体质', onClick: retakeQuiz },
    { icon: 'history', text: '聆听历史', onClick: () => {} },
    { icon: 'settings', text: '设置', onClick: () => {} },
    { icon: 'messageCircle', text: '关于我们', onClick: goAbout },
    user
      ? { icon: 'user', text: '退出登录', onClick: onLogout }
      : { icon: 'user', text: loggingIn ? '登录中…' : '微信登录', onClick: onLogin }
  ];

  return (
    <View className="profile">
      {/* 标题 */}
      <View className="profile__header fade-up" style={{ paddingTop: `${getNavTop()}px` }}>
        <Text className="profile__eyebrow cormorant italic">Profile</Text>
        <Text className="profile__title">我的</Text>
      </View>

      {/* 用户卡 */}
      <View
        className="profile__user fade-up"
        style={{
          background: `linear-gradient(135deg, ${A.a15(el.primary)}, transparent)`,
          borderColor: A.a25(el.primary)
        }}
      >
        {/* 头像：已登录可点按钮换微信头像；未登录显示元素图标 */}
        {user ? (
          <Button
            className="profile__avatar-btn"
            openType="chooseAvatar"
            onChooseAvatar={onChooseAvatar}
          >
            <View
              className="profile__avatar"
              style={{
                background: `radial-gradient(circle, ${A.a25(el.primary)}, transparent)`,
                borderColor: A.a50(el.primary)
              }}
            >
              {user.avatar ? (
                <Image className="profile__avatar-img" src={user.avatar} mode="aspectFill" />
              ) : (
                <Icon name={el.icon as IconName} size={52} color={el.primary} strokeWidth={1.2} />
              )}
            </View>
          </Button>
        ) : (
          <View
            className="profile__avatar"
            style={{
              background: `radial-gradient(circle, ${A.a25(el.primary)}, transparent)`,
              borderColor: A.a50(el.primary)
            }}
          >
            <Icon name={el.icon as IconName} size={52} color={el.primary} strokeWidth={1.2} />
          </View>
        )}

        <View className="profile__user-info">
          {user ? (
            <Text className="profile__user-name">{user.nickname || '律音用户'}</Text>
          ) : (
            <Text className="profile__user-name">未登录</Text>
          )}
          <Text className="profile__user-meta" style={{ color: el.accent }}>
            {el.id}型 · {el.note}音 · {user ? user.membership.name : '听闻'}
            {expireDays !== null ? ` · ${expireDays}天到期` : ''}
          </Text>
          {user ? (
            <Text className="profile__user-sub">
              {isPremium ? '已解锁全部权益' : '升级解锁全部曲目'}
            </Text>
          ) : (
            <Text className="profile__user-action" onClick={onLogin}>
              {loggingIn ? '登录中…' : '微信登录 ›'}
            </Text>
          )}
        </View>
      </View>

      {/* 本周统计 */}
      <View className="profile__stats fade-up" style={{ animationDelay: '0.1s' }}>
        <View className="profile__stats-head">
          <View className="profile__stats-label">
            <Icon name="trendingUp" size={28} color="#94a3b8" strokeWidth={1.5} />
            <Text className="profile__stats-en cormorant italic">This Week</Text>
          </View>
          <Text className="profile__stats-val cormorant" style={{ color: el.accent }}>
            5.2<Text className="profile__stats-unit">hrs</Text>
          </Text>
        </View>
        <View className="profile__stats-bars">
          {BARS.map((h, i) => {
            const today = i === BARS.length - 1;
            return (
              <View key={i} className="profile__stats-col">
                <View
                  className="profile__stats-bar"
                  style={{
                    height: `${h}%`,
                    background: today
                      ? `linear-gradient(180deg, ${el.primary}, ${A.a50(el.primary)})`
                      : 'rgba(148,163,184,0.15)'
                  }}
                />
                <Text
                  className="profile__stats-day"
                  style={{ color: today ? el.accent : '#475569' }}
                >
                  {WEEK_LABELS[i]}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* 功能菜单 */}
      <View className="profile__menu">
        {menu.map((item, i) => (
          <View
            key={i}
            className={`profile__menu-item ${i < menu.length - 1 ? 'profile__menu-item--divider' : ''}`}
            onClick={item.onClick}
          >
            <Icon
              name={item.icon}
              size={32}
              color={item.highlight ? el.accent : '#64748b'}
              strokeWidth={1.5}
            />
            <Text className="profile__menu-text">{item.text}</Text>
            <Icon name="chevronRight" size={28} color="#334155" strokeWidth={1.5} />
          </View>
        ))}
      </View>

      <CdkeyModal open={cdkeyOpen} onClose={() => setCdkeyOpen(false)} />
      <MiniPlayer />
      <TabBar active="profile" />
    </View>
  );
}
