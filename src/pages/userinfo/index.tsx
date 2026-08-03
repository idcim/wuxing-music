import { View, Text, Image, Button, Picker } from '@tarojs/components';
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

// 出生时辰选项。下标 0 = 未知，其余对应十二时辰；值是该时辰的代表钟点（存进后端的就是它）。
// 子时跨 23:00-00:59 两个自然日，这里取 00 点一侧——与用户填的公历日期同一天，
// 与后端 lunar.py 里 sect=2 的取舍一致，不会出现「补了时辰本命五行就变」。
const SHICHEN: { label: string; hour: number }[] = [
  { label: '未知', hour: -1 },
  { label: '子时 23:00-00:59', hour: 0 },
  { label: '丑时 01:00-02:59', hour: 2 },
  { label: '寅时 03:00-04:59', hour: 4 },
  { label: '卯时 05:00-06:59', hour: 6 },
  { label: '辰时 07:00-08:59', hour: 8 },
  { label: '巳时 09:00-10:59', hour: 10 },
  { label: '午时 11:00-12:59', hour: 12 },
  { label: '未时 13:00-14:59', hour: 14 },
  { label: '申时 15:00-16:59', hour: 16 },
  { label: '酉时 17:00-18:59', hour: 18 },
  { label: '戌时 19:00-20:59', hour: 20 },
  { label: '亥时 21:00-22:59', hour: 22 }
];
const SHICHEN_LABELS = SHICHEN.map((s) => s.label);

// 今天（Picker 的 end，生日不能选未来）
function todayStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function UserInfo() {
  const user = useUserStore((s) => s.user);
  const element = useUserStore((s) => s.element);
  const setPhone = useUserStore((s) => s.setPhone);
  const setUser = useUserStore((s) => s.setUser);
  const setProfile = useUserStore((s) => s.setProfile);
  const el = WUXING[(element as ElementId) || '木'];

  const [editing, setEditing] = useState<EditField>(null);

  // 生日/时辰改完立即落库。updateProfile 返回完整用户对象——
  // 生日会连带算出农历、生肖、本命五行，这些派生字段只有后端知道。
  const saveBirth = async (patch: { birthday?: string; birthHour?: number }) => {
    try {
      setUser(await updateProfile(patch));
      Taro.showToast({ title: '已更新', icon: 'success' });
    } catch (e: any) {
      Taro.showToast({ title: e?.message || '保存失败', icon: 'none' });
    }
  };

  // 登录态变化时刷新（不再 redirectTo 到登录页——那会销毁本页，
  // 而登录成功后一律 reLaunch 回首页，用户再也回不到「个人信息」）
  const [, force] = useState(0);
  useDidShow(() => force((n) => n + 1));

  const goLogin = () => Taro.navigateTo({ url: '/pages/login/index' });

  // 当前时辰在选项里的下标（0 = 未知）
  const shichenIndex = Math.max(
    0,
    SHICHEN.findIndex((s) => s.hour === (user?.birthHour ?? -1))
  );
  // 本命五行的配色（与测评体质区分开，各用各的颜色）
  const birthEl = user?.lunar?.element ? WUXING[user.lunar.element as ElementId] : null;

  // 上传头像临时图 → 换正式 URL → 落库 → 更新本地
  const saveAvatar = async (tmp: string) => {
    if (!tmp) return;
    Taro.showLoading({ title: '上传中', mask: true });
    try {
      const url = await uploadAvatar(tmp);
      setUser(await updateProfile({ avatar: url }));
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
        <View
          className="userinfo__row userinfo__row--divider"
          onClick={() => setEditing('password')}
        >
          <Text className="userinfo__label">登录密码</Text>
          <View className="userinfo__row-right">
            <Text className="userinfo__value userinfo__value--muted">
              {user.hasPassword ? '已设置' : '未设置'}
            </Text>
            <Icon name="chevronRight" size={28} color="#334155" strokeWidth={1.5} />
          </View>
        </View>

        {/* 生日：用 Picker 包住整行，不走 UserEditSheet——
            Picker 内不含 <Input>，天然绕开「Input 必须常驻挂载」那套（陷阱 14）。 */}
        <Picker
          mode="date"
          start="1900-01-01"
          end={todayStr()}
          value={user.birthday || todayStr()}
          onChange={(e) => saveBirth({ birthday: String(e.detail.value) })}
        >
          <View className="userinfo__row userinfo__row--divider">
            <Text className="userinfo__label">生日</Text>
            <View className="userinfo__row-right">
              <Text className={`userinfo__value ${user.birthday ? '' : 'userinfo__value--muted'}`}>
                {user.birthday || '未填写'}
              </Text>
              <Icon name="chevronRight" size={28} color="#334155" strokeWidth={1.5} />
            </View>
          </View>
        </Picker>

        {/* 出生时辰：可选，填了才能凑齐四柱 */}
        <Picker
          mode="selector"
          range={SHICHEN_LABELS}
          value={shichenIndex}
          onChange={(e) => saveBirth({ birthHour: SHICHEN[Number(e.detail.value)].hour })}
        >
          <View className="userinfo__row">
            <Text className="userinfo__label">出生时辰</Text>
            <View className="userinfo__row-right">
              <Text className={`userinfo__value ${shichenIndex ? '' : 'userinfo__value--muted'}`}>
                {SHICHEN_LABELS[shichenIndex]}
              </Text>
              <Icon name="chevronRight" size={28} color="#334155" strokeWidth={1.5} />
            </View>
          </View>
        </Picker>
      </View>

      {/* 体质 / 本命 / 会员（只读） */}
      <View className="userinfo__list userinfo__list--readonly fade-up" style={{ animationDelay: '0.05s' }}>
        {/* 测评体质：推荐曲目与主题配色的依据，仍以它为准 */}
        <View className="userinfo__row userinfo__row--divider">
          <Text className="userinfo__label">测评体质</Text>
          <Text className="userinfo__value" style={{ color: el.accent }}>
            {element ? `${el.id}型 · ${el.note}音` : '未测评'}
          </Text>
        </View>

        {/* 本命五行：由生日换算，仅作命理趣味展示，不参与推荐 */}
        {!!user.lunar && (
          <View className="userinfo__row userinfo__row--divider">
            <Text className="userinfo__label">本命五行</Text>
            <Text
              className="userinfo__value userinfo__value--wrap"
              style={{ color: birthEl ? birthEl.accent : undefined }}
            >
              {[
                user.lunar.date,
                user.lunar.shengXiao ? `属${user.lunar.shengXiao}` : '',
                user.lunar.element ? `${user.lunar.dayGan}${user.lunar.element}命` : ''
              ].filter(Boolean).join(' · ')}
            </Text>
          </View>
        )}

        <View className="userinfo__row">
          <Text className="userinfo__label">会员</Text>
          <Text className="userinfo__value">{user.membership.name}</Text>
        </View>
      </View>

      {sheet}
    </View>
  );
}
