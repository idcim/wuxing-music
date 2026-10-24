import Taro from '@tarojs/taro';
import type { User } from '@/types';
import { useUserStore } from '@/stores/user';

// 资料是否待补全：没绑手机号，或昵称还是注册时后端生成的默认名（律音用户·XXXX）。
// 登录后引导与老用户启动检测共用这一份口径。
export function isProfileIncomplete(user: User | null): boolean {
  if (!user) return false;
  const defaultNick = !user.nickname || user.nickname.startsWith('律音用户');
  return !user.phone || defaultNick;
}

// 在主页面提示补全资料（每会话最多一次）。
// 必须等落在主页后再弹：启动期弹窗会和 splash 的 reLaunch / 测评引导撞车，
// 弹窗被导航顶掉就等于被跳过（实测教训）。所以触发点在 home 的 useDidShow，
// 而不是 app.tsx 的登录引导里。
let prompted = false;
export async function promptProfileIfIncomplete(): Promise<void> {
  if (prompted) return;
  const user = useUserStore.getState().user;
  if (!isProfileIncomplete(user)) return;
  const path = Taro.getCurrentInstance().router?.path || '';
  if (path.includes('userinfo') || path.includes('login')) return;
  prompted = true;
  const res = await Taro.showModal({
    title: '完善个人信息',
    content: '绑定手机号并设置昵称（可用微信昵称一键填入），账号找回与会员服务更有保障',
    confirmText: '去完善',
    cancelText: '下次再说'
  });
  if (res.confirm) Taro.navigateTo({ url: '/pages/userinfo/index?from=login' });
}
