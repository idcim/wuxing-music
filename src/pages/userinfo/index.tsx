import { View, Text, Image, Button } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { useState } from 'react';
import { WUXING } from '@/constants/wuxing';
import { useUserStore } from '@/stores/user';
import { bindPhone } from '@/services/user';
import Icon from '@/components/Icon';
import { A } from '@/utils/color';
import { resolveUrl } from '@/utils/url';
import type { ElementId } from '@/types';
import type { IconName } from '@/components/Icon/paths';
import './index.scss';

export default function UserInfo() {
  const user = useUserStore((s) => s.user);
  const element = useUserStore((s) => s.element);
  const setPhone = useUserStore((s) => s.setPhone);
  const setProfile = useUserStore((s) => s.setProfile);
  const el = WUXING[(element as ElementId) || '木'];

  // 未登录则退回登录页
  const [, force] = useState(0);
  useDidShow(() => {
    if (!useUserStore.getState().user) {
      Taro.redirectTo({ url: '/pages/login/index' });
    } else {
      force((n) => n + 1);
    }
  });

  const back = () => Taro.navigateBack();

  // 微信头像授权
  const onChooseAvatar = (e: any) => {
    const url = e?.detail?.avatarUrl;
    if (url) {
      setProfile({ avatar: url });
      Taro.showToast({ title: '头像已更新', icon: 'success' });
    }
  };

  // 修改昵称
  const onEditNickname = () => {
    Taro.showModal({
      title: '修改昵称',
      editable: true,
      placeholderText: '输入新昵称',
      content: user?.nickname || '',
      success: (res: any) => {
        const name = String(res?.content || '').trim();
        if (res.confirm && name) {
          setProfile({ nickname: name });
          Taro.showToast({ title: '已更新', icon: 'success' });
        }
      }
    } as any);
  };

  // 绑定手机号（真实环境用 getPhoneNumber 授权；此处弹窗输入模拟）
  const onBindPhone = () => {
    Taro.showModal({
      title: user?.phone ? '修改手机号' : '绑定手机号',
      editable: true,
      placeholderText: '请输入手机号',
      content: user?.phone || '',
      success: async (res: any) => {
        if (!res.confirm || !res.content) return;
        const phone = String(res.content).trim();
        if (!/^1\d{10}$/.test(phone)) {
          Taro.showToast({ title: '手机号格式不对', icon: 'none' });
          return;
        }
        try {
          const bound = await bindPhone(Number(user!.id), phone);
          setPhone(bound);
          Taro.showToast({ title: '绑定成功', icon: 'success' });
        } catch {
          Taro.showToast({ title: '绑定失败', icon: 'none' });
        }
      }
    } as any);
  };

  if (!user) {
    return (
      <View className="userinfo">
        <View className="userinfo__nav">
          <Text className="userinfo__back" onClick={back}>‹</Text>
          <Text className="userinfo__nav-title">个人信息</Text>
          <View className="userinfo__nav-spacer" />
        </View>
      </View>
    );
  }

  return (
    <View className="userinfo">
      <View className="userinfo__nav">
        <Text className="userinfo__back" onClick={back}>‹</Text>
        <Text className="userinfo__nav-title">个人信息</Text>
        <View className="userinfo__nav-spacer" />
      </View>

      <View className="userinfo__list fade-up">
        {/* 头像 */}
        <Button
          className="userinfo__row userinfo__row--btn"
          openType="chooseAvatar"
          onChooseAvatar={onChooseAvatar}
        >
          <Text className="userinfo__label">头像</Text>
          <View className="userinfo__row-right">
            <View
              className="userinfo__avatar"
              style={{
                background: `radial-gradient(circle, ${A.a25(el.primary)}, transparent)`,
                borderColor: A.a50(el.primary)
              }}
            >
              {user.avatar ? (
                <Image
                  className="userinfo__avatar-img"
                  src={resolveUrl(user.avatar)}
                  mode="aspectFill"
                />
              ) : (
                <Icon name={el.icon as IconName} size={36} color={el.primary} strokeWidth={1.2} />
              )}
            </View>
            <Icon name="chevronRight" size={28} color="#334155" strokeWidth={1.5} />
          </View>
        </Button>

        {/* 昵称 */}
        <View className="userinfo__row userinfo__row--divider" onClick={onEditNickname}>
          <Text className="userinfo__label">昵称</Text>
          <View className="userinfo__row-right">
            <Text className="userinfo__value">{user.nickname || '律音用户'}</Text>
            <Icon name="chevronRight" size={28} color="#334155" strokeWidth={1.5} />
          </View>
        </View>

        {/* 手机号 */}
        <View className="userinfo__row" onClick={onBindPhone}>
          <Text className="userinfo__label">手机号</Text>
          <View className="userinfo__row-right">
            <Text className={`userinfo__value ${user.phone ? '' : 'userinfo__value--muted'}`}>
              {user.phone || '未绑定'}
            </Text>
            <Icon name="chevronRight" size={28} color="#334155" strokeWidth={1.5} />
          </View>
        </View>
      </View>

      {/* 体质 / 会员（只读） */}
      <View className="userinfo__list userinfo__list--readonly fade-up" style={{ animationDelay: '0.05s' }}>
        <View className="userinfo__row userinfo__row--divider">
          <Text className="userinfo__label">五行体质</Text>
          <Text className="userinfo__value" style={{ color: el.accent }}>
            {element ? `${el.id}型 · ${el.note}音` : '未测评'}
          </Text>
        </View>
        <View className="userinfo__row">
          <Text className="userinfo__label">会员</Text>
          <Text className="userinfo__value">{user.membership.name}</Text>
        </View>
      </View>
    </View>
  );
}
