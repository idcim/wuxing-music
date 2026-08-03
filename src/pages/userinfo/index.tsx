import { View, Text, Image, Button } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { useState } from 'react';
import { WUXING } from '@/constants/wuxing';
import { useUserStore } from '@/stores/user';
import { pickAvatar, updateProfile, uploadAvatar } from '@/services/user';
import { isWeapp } from '@/utils/platform';
import { goBack } from '@/utils/nav';
import Icon from '@/components/Icon';
import UserEditSheet, { type EditField } from '@/components/UserEditSheet';
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

  const [editing, setEditing] = useState<EditField>(null);

  // 登录态变化时刷新（不再 redirectTo 到登录页——那会销毁本页，
  // 而登录成功后一律 reLaunch 回首页，用户再也回不到「个人信息」）
  const [, force] = useState(0);
  useDidShow(() => force((n) => n + 1));

  const goLogin = () => Taro.navigateTo({ url: '/pages/login/index' });

  // 上传头像临时图 → 换正式 URL → 落库 → 更新本地
  const saveAvatar = async (tmp: string) => {
    if (!tmp) return;
    Taro.showLoading({ title: '上传中', mask: true });
    try {
      const url = await uploadAvatar(tmp);
      const saved = await updateProfile({ avatar: url });
      setProfile({ avatar: saved.avatar ?? url });
      Taro.hideLoading();
      Taro.showToast({ title: '头像已更新', icon: 'success' });
    } catch (e: any) {
      Taro.hideLoading();
      // 后端会给「仅支持图片」「图片不能超过 5MB」等具体原因
      Taro.showToast({ title: e?.message || '上传失败', icon: 'none' });
    }
  };

  // 小程序：微信原生头像授权回调
  const onChooseAvatar = (e: any) => saveAvatar(e?.detail?.avatarUrl || '');

  // H5：openType="chooseAvatar" 是小程序专有能力，H5 下按钮点了毫无反应，
  // 因此改走 chooseImage（内部即 <input type="file">）取图。
  const onPickAvatar = async () => saveAvatar(await pickAvatar());

  const avatarInner = (
    <>
      <Text className="userinfo__label">头像</Text>
      <View className="userinfo__row-right">
        <View
          className="userinfo__avatar"
          style={{
            background: `radial-gradient(circle, ${A.a25(el.primary)}, transparent)`,
            borderColor: A.a50(el.primary)
          }}
        >
          {user?.avatar ? (
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
    </>
  );

  const nav = (
    <View className="userinfo__nav">
      <Text className="userinfo__back" onClick={() => goBack()}>‹</Text>
      <Text className="userinfo__nav-title">个人信息</Text>
      <View className="userinfo__nav-spacer" />
    </View>
  );

  // 编辑抽屉：无论登录与否都挂在首屏。
  // 若放进「已登录」分支，用户登录回来后抽屉才首次挂载，
  // 其中的 Input 会踩到「首屏之后挂载不渲染内部 input」那条坑（陷阱 14）。
  const sheet = (
    <UserEditSheet
      field={editing}
      nickname={user?.nickname || ''}
      phone={user?.phone || ''}
      onClose={() => setEditing(null)}
      onSaved={(patch) => {
        if (patch.nickname !== undefined) setProfile({ nickname: patch.nickname });
        if (patch.hasPassword !== undefined) setProfile({ hasPassword: patch.hasPassword });
        if (patch.phone !== undefined) setPhone(patch.phone);
      }}
    />
  );

  // 未登录：给出明确的登录入口，而不是一片空白
  if (!user) {
    return (
      <View className="userinfo">
        {nav}
        <View className="userinfo__empty fade-up">
          <Icon name="user" size={72} color="#334155" strokeWidth={1.2} />
          <Text className="userinfo__empty-text">登录后可查看与编辑个人信息</Text>
          <View className="userinfo__empty-btn" onClick={goLogin}>
            <Text className="userinfo__empty-btn-text">去登录</Text>
          </View>
        </View>
        {sheet}
      </View>
    );
  }

  return (
    <View className="userinfo">
      {nav}

      <View className="userinfo__list fade-up">
        {/* 头像：小程序用微信原生头像授权，H5 走相册/拍照 */}
        {isWeapp ? (
          <Button
            className="userinfo__row userinfo__row--btn"
            openType="chooseAvatar"
            onChooseAvatar={onChooseAvatar}
          >
            {avatarInner}
          </Button>
        ) : (
          <View className="userinfo__row" onClick={onPickAvatar}>
            {avatarInner}
          </View>
        )}

        {/* 昵称 */}
        <View
          className="userinfo__row userinfo__row--divider"
          onClick={() => setEditing('nickname')}
        >
          <Text className="userinfo__label">昵称</Text>
          <View className="userinfo__row-right">
            <Text className="userinfo__value">{user.nickname || '律音用户'}</Text>
            <Icon name="chevronRight" size={28} color="#334155" strokeWidth={1.5} />
          </View>
        </View>

        {/* 手机号 */}
        <View
          className="userinfo__row userinfo__row--divider"
          onClick={() => setEditing('phone')}
        >
          <Text className="userinfo__label">手机号</Text>
          <View className="userinfo__row-right">
            <Text className={`userinfo__value ${user.phone ? '' : 'userinfo__value--muted'}`}>
              {user.phone || '未绑定'}
            </Text>
            <Icon name="chevronRight" size={28} color="#334155" strokeWidth={1.5} />
          </View>
        </View>

        {/* 登录密码：设置后可用「手机号 + 密码」登录 */}
        <View className="userinfo__row" onClick={() => setEditing('password')}>
          <Text className="userinfo__label">登录密码</Text>
          <View className="userinfo__row-right">
            <Text className="userinfo__value userinfo__value--muted">
              {user.hasPassword ? '已设置' : '未设置'}
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

      {sheet}
    </View>
  );
}
