import type { User } from '@/types';

// 资料是否待补全：没绑手机号，或昵称还是注册时后端生成的默认名（律音用户·XXXX）。
// 登录后引导与老用户启动检测共用这一份口径。
export function isProfileIncomplete(user: User | null): boolean {
  if (!user) return false;
  const defaultNick = !user.nickname || user.nickname.startsWith('律音用户');
  return !user.phone || defaultNick;
}
