import { useEffect, useRef, useState } from 'react';
import { View, Text, Button } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { useUserStore } from '@/stores/user';
import { isAndroidApp } from '@/utils/platform';
import { appWechatAvailable, appWechatBinding, bindAppWechat, cancelAppWechatLogin } from '@/services/appWechat';
import './binding.scss';

export default function AppWechatBinding() {
  const user = useUserStore(s => s.user);
  const [bound, setBound] = useState<boolean>();
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const active = useRef(true), lock = useRef(false), version = useRef(0);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; version.current++; if (lock.current) cancelAppWechatLogin(); };
  }, []);
  const load = async () => {
    if (!isAndroidApp || !user) return;
    const current = ++version.current;
    setFailed(false); setBound(undefined);
    try {
      const [status, ready] = await Promise.all([appWechatBinding(), appWechatAvailable()]);
      if (active.current && current === version.current) { setBound(status); setEnabled(ready); }
    } catch { if (active.current && current === version.current) setFailed(true); }
  };
  useEffect(() => { void load(); }, [user?.id]);
  useDidShow(() => { if (!lock.current) void load(); });
  if (!isAndroidApp || !user) return null;
  const bind = async () => {
    if (lock.current || bound !== false || !enabled) return;
    const owner = user.id;
    lock.current = true; setBusy(true);
    try {
      const answer = await Taro.showModal({ title: '绑定微信', content: '确认使用本人微信绑定当前账号。绑定后，短信和微信登录均可使用当前会员、课程及订单。', confirmText: '去绑定', cancelText: '取消' });
      if (!answer.confirm || !active.current || useUserStore.getState().user?.id !== owner) return;
      const updated = await bindAppWechat();
      if (!active.current || useUserStore.getState().user?.id !== owner) return;
      useUserStore.getState().setUser(updated); setBound(true);
      void Taro.showToast({ title: '微信绑定成功', icon: 'success' });
    } catch (error: any) {
      if (active.current) void Taro.showModal({ title: '微信未绑定', content: error.message || '绑定未完成，请重试。', showCancel: false });
    } finally { lock.current = false; if (active.current) setBusy(false); }
  };
  return <View className='app-binding'>
    <View className='app-binding__copy'><Text className='app-binding__title'>微信账号</Text><Text className='app-binding__description'>{bound ? '已绑定 · 短信与微信可登录同一账号' : failed ? '绑定状态暂未获取，请重试' : bound === undefined ? '正在检查绑定状态…' : enabled ? '绑定后，换一种方式也能找到你的课程与订单' : '微信授权暂未开启，短信登录可正常使用'}</Text></View>
    {failed ? <Button className='app-binding__button' onClick={() => void load()}>重试</Button> : bound ? <Text className='app-binding__done'>已绑定</Text> : <Button className='app-binding__button' disabled={bound === undefined || !enabled || busy} loading={busy} onClick={() => void bind()}>绑定微信</Button>}
  </View>;
}
