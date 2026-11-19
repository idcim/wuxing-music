import { useEffect, useRef, useState } from 'react';
import { View, Text, Image, Input, Button, Checkbox, CheckboxGroup, Label } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { useSiteStore } from '@/stores/site';
import { useUserStore } from '@/stores/user';
import { THEMES } from '@/theme';
import { sendSmsCode } from '@/services/auth';
import { appSmsAvailable, cancelAppSmsLogin, loginAppBySms } from '@/services/appAuth';
import { appWechatAvailable, cancelAppWechatLogin, loginByAppWechat } from '@/services/appWechat';
import { navBarStyle, goBack } from '@/utils/nav';
import { resolveUrl } from '@/utils/url';
import './app-auth.scss';

export default function AppLogin() {
  const site = useSiteStore(s => s.site);
  const [capabilities, setCapabilities] = useState<{ sms: boolean; wechat: boolean }>();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [sending, setSending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const active = useRef(true), sendLock = useRef(false), loginLock = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; cancelAppSmsLogin(); cancelAppWechatLogin(); };
  }, []);
  const loadCapabilities = async () => {
    setCapabilities(undefined);
    const [sms, wechat] = await Promise.allSettled([appSmsAvailable(), appWechatAvailable()]);
    if (active.current) setCapabilities({ sms: sms.status === 'fulfilled' && sms.value, wechat: wechat.status === 'fulfilled' && wechat.value });
  };
  useEffect(() => { void loadCapabilities(); }, []);
  useEffect(() => {
    if (!countdown) return;
    const timer = setTimeout(() => setCountdown(n => Math.max(0, n - 1)), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);
  useDidShow(() => { if (useUserStore.getState().user) void Taro.reLaunch({ url: '/pages/home/index' }); });
  const consent = () => {
    if (agreed) return true;
    void Taro.showToast({ title: '请先阅读并勾选用户服务协议和隐私政策', icon: 'none' });
    return false;
  };
  const sendCode = async () => {
    if (sendLock.current || countdown || loginLock.current || !capabilities?.sms || !consent()) return;
    if (!/^1\d{10}$/.test(phone)) return void Taro.showToast({ title: '请输入正确的手机号', icon: 'none' });
    sendLock.current = true; setSending(true);
    try {
      const result = await sendSmsCode(phone, 'login');
      if (!active.current) return;
      if (!result.sent) throw new Error('发送失败，请重试');
      setCountdown(60);
      void Taro.showToast({ title: '验证码已发送', icon: 'none' });
    } catch (error: any) {
      if (active.current) void Taro.showToast({ title: error.message || '发送失败，请重试', icon: 'none' });
    } finally { sendLock.current = false; if (active.current) setSending(false); }
  };
  const submit = async (method: 'sms' | 'wechat') => {
    if (loginLock.current || sendLock.current || !consent()) return;
    if ((method === 'sms' && !capabilities?.sms) || (method === 'wechat' && !capabilities?.wechat)) return;
    if (method === 'sms' && (!/^1\d{10}$/.test(phone) || !/^\d{6}$/.test(code))) {
      return void Taro.showToast({ title: '请输入正确的手机号和六位验证码', icon: 'none' });
    }
    loginLock.current = true; setSubmitting(true);
    try {
      const user = await (method === 'sms' ? loginAppBySms(phone, code) : loginByAppWechat());
      if (!active.current) return;
      useUserStore.getState().setUser(user);
      void Taro.reLaunch({ url: '/pages/home/index' });
    } catch (error: any) {
      if (active.current) void Taro.showToast({ title: error.message || '登录未完成，请重试', icon: 'none' });
    } finally { loginLock.current = false; if (active.current) setSubmitting(false); }
  };
  const leave = () => { active.current = false; cancelAppSmsLogin(); cancelAppWechatLogin(); goBack(); };
  return <View className='app-auth'>
    <View className='app-auth__nav' style={navBarStyle()}><Button className='app-auth__back' onClick={leave}>‹ 返回</Button></View>
    <View className='app-auth__brand'><View className='app-auth__logo'>{site.logo_url ? <Image className='app-auth__logo-image' src={resolveUrl(site.logo_url)} mode='aspectFit' /> : <Text className='serif'>{site.site_name?.slice(0, 1)}</Text>}</View><View><Text className='app-auth__name serif'>{site.site_name}</Text><Text className='app-auth__caption'>{site.site_slogan}</Text></View></View>
    <Text className='app-auth__title serif'>登录，继续你的音律之旅</Text>
    {capabilities === undefined ? <Text className='app-auth__hint'>正在加载登录方式…</Text> : capabilities.sms ? <>
      <View className='app-auth__field'><Text className='app-auth__prefix'>+86</Text><Input className='app-auth__input' type='number' maxlength={11} value={phone} disabled={submitting || sending} placeholder='请输入手机号' onInput={e => setPhone(e.detail.value.replace(/\D/g, ''))} /></View>
      <View className='app-auth__field'><Input className='app-auth__input' type='number' maxlength={6} value={code} disabled={submitting} placeholder='六位短信验证码' onInput={e => setCode(e.detail.value.replace(/\D/g, ''))} /><Button className='app-auth__send' disabled={sending || submitting || countdown > 0} onClick={sendCode}>{sending ? '发送中…' : countdown ? `${countdown}s 后重发` : '获取验证码'}</Button></View>
    </> : <View className='app-auth__unavailable'><Text>短信登录暂未开启</Text><Button className='app-auth__retry' onClick={() => void loadCapabilities()}>重新检查</Button></View>}
    <View className='app-auth__consent'>
      <CheckboxGroup className='app-auth__consent-control' onChange={e => setAgreed(e.detail.value.includes('agreed'))}>
        <Label className='app-auth__consent-hit' for='app-login-consent'>
          <Checkbox id='app-login-consent' className='app-auth__checkbox' value='agreed' checked={agreed} color={THEMES[site.theme_id].accent} nativeProps={{ 'aria-label': '同意用户服务协议和隐私政策' }} />
        </Label>
      </CheckboxGroup>
      <View className='app-auth__consent-copy'>
        <Label className='app-auth__consent-label' for='app-login-consent'>我已阅读并同意</Label>
        <Text className='app-auth__link' onClick={() => Taro.navigateTo({ url: '/pages/agreement/index' })}>《用户服务协议》</Text>
        <Text>和</Text>
        <Text className='app-auth__link' onClick={() => Taro.navigateTo({ url: '/pages/agreement/index?kind=app-privacy' })}>《隐私政策》</Text>
      </View>
    </View>
    {capabilities?.sms && <Button className='app-auth__primary' loading={submitting} disabled={submitting || sending} onClick={() => void submit('sms')}>登录 / 注册</Button>}
    {capabilities?.wechat && <Button className={`app-auth__wechat ${capabilities.sms ? '' : 'app-auth__primary'}`} disabled={submitting || sending} onClick={() => void submit('wechat')}>微信登录</Button>}
    {capabilities?.sms && <Text className='app-auth__hint'>未注册的手机号验证后将自动创建账号</Text>}
    <Button className='app-auth__guest' onClick={leave}>先逛逛，继续游客体验</Button>
  </View>;
}
