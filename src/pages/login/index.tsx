import { useEffect, useState } from 'react';
import { View, Text, Input } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import Icon from '@/components/Icon';
import { useUserStore } from '@/stores/user';
import { sendSmsCode } from '@/services/auth';
import { isWeapp, isInWeChat } from '@/utils/platform';
import './index.scss';

type LoginTab = 'code' | 'password';
type LoginMode = 'wechat' | 'phone';

const PHONE_RE = /^1\d{10}$/;

export default function Login() {
  const loggingIn = useUserStore((s) => s.loggingIn);
  const login = useUserStore((s) => s.login);
  const loginByPhone = useUserStore((s) => s.loginByPhone);
  const loginByPassword = useUserStore((s) => s.loginByPassword);
  const loginByWechatH5 = useUserStore((s) => s.loginByWechatH5);

  // 微信内以微信登录为主入口；外部浏览器完不成公众号授权，仍以手机号登录为主
  const [mode, setMode] = useState<LoginMode>(isInWeChat ? 'wechat' : 'phone');
  const [tab, setTab] = useState<LoginTab>('code');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // 已登录用户直接跳走
  useDidShow(() => {
    if (useUserStore.getState().user) {
      Taro.reLaunch({ url: '/pages/home/index' });
    }
  });

  // 发送验证码倒计时
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  // ── 小程序：微信一键登录（保持原逻辑）──
  const onWeappLogin = async () => {
    if (loggingIn) return;
    try {
      await login();
      Taro.reLaunch({ url: '/pages/home/index' });
    } catch {
      Taro.showToast({ title: '登录失败，请重试', icon: 'none' });
    }
  };

  // ── H5：发送短信验证码 ──
  const onSendCode = async () => {
    if (countdown > 0) return;
    if (!PHONE_RE.test(phone)) {
      Taro.showToast({ title: '请输入正确的手机号', icon: 'none' });
      return;
    }
    try {
      const res = await sendSmsCode(phone, 'login');
      if (!res.sent) {
        Taro.showToast({ title: '发送失败，请重试', icon: 'none' });
        return;
      }
      setCountdown(60);
      // 开发/mock 期后端直接下发验证码：自动填入并提示，便于联调
      if (res.devCode) {
        setCode(res.devCode);
        Taro.showToast({ title: `验证码已发送：${res.devCode}`, icon: 'none' });
      } else {
        Taro.showToast({ title: '验证码已发送', icon: 'none' });
      }
    } catch (e: any) {
      Taro.showToast({ title: e?.message || '发送失败，请重试', icon: 'none' });
    }
  };

  // ── H5：手机号登录（验证码 / 密码）──
  const onSubmit = async () => {
    if (submitting) return;
    if (!PHONE_RE.test(phone)) {
      Taro.showToast({ title: '请输入正确的手机号', icon: 'none' });
      return;
    }
    if (tab === 'code' && !code.trim()) {
      Taro.showToast({ title: '请输入验证码', icon: 'none' });
      return;
    }
    if (tab === 'password' && !password) {
      Taro.showToast({ title: '请输入密码', icon: 'none' });
      return;
    }
    setSubmitting(true);
    try {
      if (tab === 'code') await loginByPhone(phone, code.trim());
      else await loginByPassword(phone, password);
      Taro.reLaunch({ url: '/pages/home/index' });
    } catch (e: any) {
      Taro.showToast({ title: e?.message || '登录失败，请重试', icon: 'none' });
    } finally {
      setSubmitting(false);
    }
  };

  // ── H5：微信登录 ──
  const onWechatLogin = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const { user, devGuest } = await loginByWechatH5();
      // user 为 null：正在跳转微信授权页，页面即将卸载，无需处理
      if (!user) return;
      // 开发游客兜底（公众号未配置）：醒目弹窗，避免误以为是真实微信登录
      if (devGuest) {
        await Taro.showModal({
          title: '开发环境提示',
          content: '公众号未配置，当前为「游客登录」，并非真实微信登录。配置公众号 AppID/Secret 并关闭后端 DEBUG 后，此处将走真实微信授权。',
          showCancel: false,
          confirmText: '知道了'
        });
      }
      Taro.reLaunch({ url: '/pages/home/index' });
    } catch (e: any) {
      Taro.showToast({ title: e?.message || '微信登录失败', icon: 'none' });
      setSubmitting(false);
    }
  };

  const brand = (
    <View className="login__brand fade-up">
      <View className="login__moon float">
        <View className="login__moon-halo" />
        <Icon name="moon" size={88} color="#cbd5e1" strokeWidth={1} />
      </View>
      <Text className="login__title serif">五行律音</Text>
      <Text className="login__slogan cormorant italic">SOUND HEALS · MUSIC RESTORES</Text>
    </View>
  );

  // ── 小程序端 ──
  if (isWeapp) {
    return (
      <View className="login">
        {brand}
        <View className="login__actions fade-up" style={{ animationDelay: '0.2s' }}>
          <View
            className={`login__btn ${loggingIn ? 'login__btn--loading' : ''}`}
            onClick={onWeappLogin}
          >
            <Text className="login__btn-text">{loggingIn ? '登录中…' : '微信一键登录'}</Text>
          </View>
          <Text className="login__terms">登录即同意服务条款与隐私政策</Text>
        </View>
      </View>
    );
  }

  // ── H5 端 · 微信内：微信登录为主，其余方式收成下方小字 ──
  if (mode === 'wechat') {
    const toPhone = (t: LoginTab) => () => {
      setTab(t);
      setMode('phone');
    };
    return (
      <View className="login">
        {brand}
        <View className="login__actions fade-up" style={{ animationDelay: '0.2s' }}>
          <View
            className={`login__btn login__btn--wechat ${submitting ? 'login__btn--loading' : ''}`}
            onClick={onWechatLogin}
          >
            <Icon name="messageCircle" size={38} color="#0a0e1a" strokeWidth={2} />
            <Text className="login__btn-text">{submitting ? '登录中…' : '微信登录'}</Text>
          </View>

          <View className="login__alts">
            <Text className="login__alt" onClick={toPhone('code')}>验证码登录</Text>
            <Text className="login__alt-sep">·</Text>
            <Text className="login__alt" onClick={toPhone('password')}>密码登录</Text>
          </View>

          <Text className="login__terms">登录即同意服务条款与隐私政策</Text>
        </View>
      </View>
    );
  }

  // ── H5 端 · 手机号登录 ──
  return (
    <View className="login">
      {brand}
      <View className="login__form fade-up" style={{ animationDelay: '0.2s' }}>
        {/* Tab 切换 */}
        <View className="login__tabs">
          <Text
            className={`login__tab ${tab === 'code' ? 'login__tab--active' : ''}`}
            onClick={() => setTab('code')}
          >
            验证码登录
          </Text>
          <Text
            className={`login__tab ${tab === 'password' ? 'login__tab--active' : ''}`}
            onClick={() => setTab('password')}
          >
            密码登录
          </Text>
        </View>

        {/* 手机号 */}
        <View className="login__field">
          <Input
            className="login__input"
            type="number"
            maxlength={11}
            placeholder="请输入手机号"
            placeholderStyle="color:#475569"
            value={phone}
            onInput={(e) => setPhone(e.detail.value)}
          />
        </View>

        {/* 验证码 / 密码 */}
        {tab === 'code' ? (
          <View className="login__field login__field--row">
            <Input
              className="login__input login__input--flex"
              type="number"
              maxlength={6}
              placeholder="请输入验证码"
              placeholderStyle="color:#475569"
              value={code}
              onInput={(e) => setCode(e.detail.value)}
            />
            <View
              className={`login__code-btn ${countdown > 0 ? 'login__code-btn--disabled' : ''}`}
              onClick={onSendCode}
            >
              <Text className="login__code-btn-text">
                {countdown > 0 ? `${countdown}s 后重发` : '发送验证码'}
              </Text>
            </View>
          </View>
        ) : (
          <View className="login__field">
            <Input
              className="login__input"
              password
              maxlength={32}
              placeholder="请输入密码"
              placeholderStyle="color:#475569"
              value={password}
              onInput={(e) => setPassword(e.detail.value)}
            />
          </View>
        )}

        {/* 提交 */}
        <View
          className={`login__btn ${submitting ? 'login__btn--loading' : ''}`}
          onClick={onSubmit}
        >
          <Text className="login__btn-text">{submitting ? '登录中…' : '登录 / 注册'}</Text>
        </View>

        {/* 微信登录 */}
        <View className="login__wechat" onClick={onWechatLogin}>
          <Icon name="messageCircle" size={36} color="#84cc16" strokeWidth={2} />
          <Text className="login__wechat-text">微信登录</Text>
        </View>

        <Text className="login__terms">登录即同意服务条款与隐私政策</Text>
      </View>
    </View>
  );
}
