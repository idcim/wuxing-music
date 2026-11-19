import type { User } from '@/types';
// 小程序保留原生 wx.login，不打包 Capacitor 或移动应用 SDK。
export async function appWechatAvailable(): Promise<boolean> { return false; }
export async function loginByAppWechat(): Promise<User> { throw new Error('请使用小程序微信登录'); }

export function cancelAppWechatLogin(): void {}
