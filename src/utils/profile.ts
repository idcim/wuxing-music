import type { User } from '@/types';

// 资料是否待补全：没绑手机号，或昵称还是注册时后端生成的默认名（律音用户·XXXX）。
// “我的”页面用这份口径显示资料完善提示。
export function isProfileIncomplete(user: User | null): boolean {
  if (!user) return false;
  const defaultNick = !user.nickname || user.nickname.startsWith('律音用户');
  return !user.phone || defaultNick;
}
