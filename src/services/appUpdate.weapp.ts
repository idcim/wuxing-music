// 小程序不加载 Android 更新插件；微信版本更新由微信平台管理。
export const useAppUpdate = Object.assign(() => null, { getState: () => ({ visible: false, force: false, release: null, checking: false }) });
export async function getNativeAppInfo(): Promise<null> { return null; }
export async function checkAppUpdate(_manual = false): Promise<'unavailable'> { return 'unavailable'; }
export function dismissAppUpdate(): void {}
export async function openAppUpdateDownload(): Promise<void> {}
export async function exitForAppUpdate(): Promise<void> {}
