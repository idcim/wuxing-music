import { create } from 'zustand';
import { API_BASE } from '@/constants/env';
import { request } from '@/services/api';
import { isAndroidApp } from '@/utils/platform';

export interface NativeAppInfo { id: string; name: string; version: string; build: string }
export interface AppRelease {
  id: string;
  version_name: string;
  version_code: number;
  package_name: string;
  channel: string;
  size: number;
  sha256: string;
  notes: string;
  download_url: string;
}
interface PublicAppInfo {
  enabled: boolean;
  app_name?: string;
  install_guide?: string;
  latest: AppRelease | null;
  update_available: boolean;
  force_update: boolean;
}
interface UpdateState {
  nativeInfo: NativeAppInfo | null;
  release: AppRelease | null;
  guide: string;
  visible: boolean;
  force: boolean;
  checking: boolean;
}
export const useAppUpdate = create<UpdateState>(() => ({
  nativeInfo: null, release: null, guide: '', visible: false, force: false, checking: false,
}));

const CHANNEL = 'preview';
const CHECK_INTERVAL = 5 * 60 * 1000;
let lastCheck = 0;
let nativeInfoPromise: Promise<NativeAppInfo> | undefined;
let pending: Promise<UpdateCheckResult> | undefined;
const dismissed = new Set<number>();
export type UpdateCheckResult = 'update' | 'current' | 'unavailable';

export async function getNativeAppInfo(): Promise<NativeAppInfo | null> {
  if (!isAndroidApp) return null;
  if (!nativeInfoPromise) {
    nativeInfoPromise = import('@capacitor/app').then(({ App }) => App.getInfo()).catch(error => {
      nativeInfoPromise = undefined;
      throw error;
    });
  }
  const info = await nativeInfoPromise;
  useAppUpdate.setState({ nativeInfo: info });
  return info;
}

function downloadAddress(release: AppRelease): string | null {
  try {
    const origin = new URL(API_BASE);
    const address = new URL(release.download_url, origin);
    if (origin.protocol !== 'https:' || address.protocol !== 'https:' || address.origin !== origin.origin
      || address.username || address.password || address.search || address.hash
      || address.pathname !== `/api/app/download/${release.id}`) return null;
    return address.href;
  } catch { return null; }
}

function validRelease(release: AppRelease | null, native: NativeAppInfo): release is AppRelease {
  if (!release) return false;
  const installed = Number(native.build);
  return Number.isSafeInteger(installed) && installed > 0
    && typeof release.id === 'string' && /^[a-f0-9]{32}$/.test(release.id)
    && Number.isSafeInteger(release.version_code) && release.version_code > installed
    && release.package_name === native.id && release.channel === CHANNEL
    && typeof release.version_name === 'string' && release.version_name.length > 0
    && Number.isSafeInteger(release.size) && release.size > 0
    && typeof release.sha256 === 'string' && /^[0-9a-f]{64}$/i.test(release.sha256)
    && !!downloadAddress(release);
}

/** 手动检查会重新展示本会话略过的普通更新；自动检查静默处理网络失败。 */
export async function checkAppUpdate(manual = false): Promise<UpdateCheckResult> {
  if (!isAndroidApp) return 'unavailable';
  if (pending) {
    const result = await pending;
    if (manual && useAppUpdate.getState().release) useAppUpdate.setState({ visible: true });
    return result;
  }
  if (!manual && lastCheck && Date.now() - lastCheck < CHECK_INTERVAL) {
    return useAppUpdate.getState().release ? 'update' : 'current';
  }
  pending = (async () => {
    useAppUpdate.setState({ checking: true });
    lastCheck = Date.now();
    try {
      const native = await getNativeAppInfo();
      if (!native) return 'unavailable';
      const query = `channel=${CHANNEL}&version_code=${encodeURIComponent(native.build)}&package_name=${encodeURIComponent(native.id)}`;
      const data = await request<PublicAppInfo>(`/api/app/info?${query}`, { auth: false });
      lastCheck = Date.now();
      const candidate = data.enabled === true && data.update_available === true && validRelease(data.latest, native) ? data.latest : null;
      const force = !!candidate && data.force_update === true;
      useAppUpdate.setState({
        release: candidate, force, guide: typeof data.install_guide === 'string' ? data.install_guide : '',
        visible: !!candidate && (manual || force || !dismissed.has(candidate.version_code)),
      });
      return candidate ? 'update' : data.enabled ? 'current' : 'unavailable';
    } finally {
      useAppUpdate.setState({ checking: false });
      pending = undefined;
    }
  })();
  return pending;
}

export function dismissAppUpdate(): void {
  const state = useAppUpdate.getState();
  if (state.force) return;
  if (state.release) dismissed.add(state.release.version_code);
  useAppUpdate.setState({ visible: false });
}

export async function openAppUpdateDownload(): Promise<void> {
  if (!isAndroidApp) return;
  const state = useAppUpdate.getState();
  if (!state.nativeInfo || !validRelease(state.release, state.nativeInfo)) throw new Error('版本信息已失效，请重新检查更新');
  const url = downloadAddress(state.release);
  if (!url) throw new Error('下载地址无效，请重新检查更新');
  const { registerPlugin } = await import('@capacitor/core');
  const plugin = registerPlugin<{ openDownload(options: { url: string }): Promise<void> }>('AppUpdate');
  await plugin.openDownload({ url });
}

export async function exitForAppUpdate(): Promise<void> {
  if (!isAndroidApp) return;
  const { App } = await import('@capacitor/app');
  await App.exitApp();
}
