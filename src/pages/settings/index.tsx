import { useState } from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { TOKEN_KEY } from '@/constants/env';
import { APP_VERSION } from '@/constants/version';
import { STORAGE_KEYS } from '@/services/storage';
import { cancelAccount } from '@/services/user';
import { logsToText } from '@/utils/logger';
import audioService from '@/services/audio';
import { logInfo, logError } from '@/utils/logger';
import { usePlayerStore } from '@/stores/player';
import { useUserStore } from '@/stores/user';
import { isWeapp } from '@/utils/platform';
import { goBack } from '@/utils/nav';
import Icon from '@/components/Icon';
import './index.scss';

// 清缓存时需要保留的键（保持登录态与身份不丢）
const KEEP_KEYS = [TOKEN_KEY, 'wx_guest_openid', STORAGE_KEYS.USER];

// H5 的 getStorageInfoSync 只返回 keys，limitSize / currentSize 都是 NaN
// （taro-h5 api/storage），拿不到真实占用；小程序才有实测值。
function readCacheKB(): number | null {
  if (!isWeapp) return null;
  try {
    return Taro.getStorageInfoSync().currentSize || 0;
  } catch {
    return null;
  }
}

// 小程序能读到微信平台上的线上版本号；H5 没有该 API，用构建时写死的 APP_VERSION。
function readVersion(): string {
  if (!isWeapp) return APP_VERSION;
  try {
    const acc: any = Taro.getAccountInfoSync?.();
    return acc?.miniProgram?.version || APP_VERSION;
  } catch {
    return APP_VERSION;
  }
}

export default function Settings() {
  const [cacheKB, setCacheKB] = useState<number | null>(null);
  const [version, setVersion] = useState(APP_VERSION);
  const [cancelling, setCancelling] = useState(false);
  const [diagOpen, setDiagOpen] = useState(false);
  const [testingAudio, setTestingAudio] = useState(false);

  const copyLogs = async () => {
    await Taro.setClipboardData({ data: logsToText() || '暂无日志' });
    Taro.showToast({ title: '已复制', icon: 'success' });
  };

  // 播放公认公共测试音频：确认「这台设备能不能放任何远程音频」，
  // 与我们自己的文件/签名/格式完全解耦。直接用音频服务（会顶掉正在播的曲子，
  // 下次点播放会重新绑定，无残留）。
  const TEST_AUDIO_URL = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3';
  // WebAudio 蜂鸣测试：纯合成音，不走网络、不走解码器、不走媒体组件。
  // 它能响 = PC 端可以用「分块 PCM + WebAudio 调度」做不依赖 H5 的原生播放。
  const onTestWebAudio = () => {
    logInfo('test', 'WebAudio 振荡器测试（纯合成音，1 秒蜂鸣）');
    try {
      if (isWeapp) {
        const ctx = (Taro as any).createWebAudioContext();
        const osc = ctx.createOscillator();
        osc.frequency.value = 440;
        osc.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 1);
        logInfo('test', `WebAudio 已启动 state=${ctx.state}（没听到声音=这条路也不通）`);
      } else {
        const w = window as any;
        const Ctx = w.AudioContext || w.webkitAudioContext;
        const ctx = new Ctx();
        const osc = ctx.createOscillator();
        osc.frequency.value = 440;
        osc.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 1);
        logInfo('test', `WebAudio 已启动 state=${ctx.state}`);
      }
    } catch (e) {
      logError('test', 'WebAudio 不可用', e);
    }
  };

  const onTestAudio = () => {
    if (testingAudio) {
      audioService.stop();
      setTestingAudio(false);
      logInfo('test', '手动停止测试音频');
      return;
    }
    setTestingAudio(true);
    logInfo('test', '播放公共测试音频（SoundHelix mp3）');
    audioService.load(TEST_AUDIO_URL, { title: '公共测试音频' }, {
      onPlay: () => logInfo('test', 'onPlay ✓ 这台设备能放远程音频'),
      onError: (e) => {
        logError('test', 'onError ✗ 连公共测试音频都放不了', e);
        setTestingAudio(false);
      },
      onEnded: () => setTestingAudio(false),
      onStop: () => setTestingAudio(false)
    });
  };

  useDidShow(() => {
    setCacheKB(readCacheKB());
    setVersion(readVersion());
  });

  const goAbout = () => Taro.navigateTo({ url: '/pages/about/index' });

  const clearCache = () => {
    Taro.showModal({
      title: '清除缓存',
      content: '将清理本地缓存（不影响登录与已购权益）',
      success: (res) => {
        if (!res.confirm) return;
        try {
          const info = Taro.getStorageInfoSync();
          (info.keys || []).forEach((k) => {
            if (!KEEP_KEYS.includes(k)) Taro.removeStorageSync(k);
          });
        } catch {
          // ignore
        }
        setCacheKB(readCacheKB());
        Taro.showToast({ title: '已清除', icon: 'success' });
      }
    });
  };

  const cancel = () => {
    if (cancelling) return;
    if (!useUserStore.getState().user) {
      Taro.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    Taro.showModal({
      title: '注销账号',
      content: '注销后账号将退出登录，个人资料与聆听记录会被删除，剩余会员与代理身份立即失效；订单记录按监管要求保留。',
      confirmText: '确认注销',
      confirmColor: '#f87171',
      success: async (res) => {
        if (!res.confirm) return;
        setCancelling(true);
        try {
          await cancelAccount();
          usePlayerStore.getState().stop();
          useUserStore.getState().logout(true);
          Taro.showToast({ title: '账号已注销', icon: 'success' });
          Taro.reLaunch({ url: '/pages/home/index' });
        } catch (e: any) {
          Taro.showToast({ title: e?.message || '注销失败，请重试', icon: 'none' });
        } finally {
          setCancelling(false);
        }
      }
    });
  };

  return (
    <View className="settings">
      <View className="settings__nav">
        <Text className="settings__back" onClick={() => goBack()}>‹</Text>
        <Text className="settings__nav-title">设置</Text>
        <View className="settings__nav-spacer" />
      </View>

      <View className="settings__list">
        <View className="settings__row settings__row--divider" onClick={clearCache}>
          <Text className="settings__label">清除缓存</Text>
          <View className="settings__row-right">
            {/* H5 读不到真实占用，就别显示一个恒为 0 的假数字 */}
            {cacheKB !== null && <Text className="settings__value">{cacheKB} KB</Text>}
            <Icon name="chevronRight" size={28} color="#334155" strokeWidth={1.5} />
          </View>
        </View>

        <View className="settings__row settings__row--divider" onClick={goAbout}>
          <Text className="settings__label">关于我们 / 服务条款</Text>
          <Icon name="chevronRight" size={28} color="#334155" strokeWidth={1.5} />
        </View>

        <View className="settings__row settings__row--divider" onClick={() => setDiagOpen(true)}>
          <Text className="settings__label">诊断日志</Text>
          <Icon name="chevronRight" size={28} color="#334155" strokeWidth={1.5} />
        </View>

        <View className="settings__row" onClick={cancel}>
          <Text className="settings__label settings__label--danger">
            {cancelling ? '注销中…' : '注销账号'}
          </Text>
          <Icon name="chevronRight" size={28} color="#7f1d1d" strokeWidth={1.5} />
        </View>
      </View>

      <View className="settings__version">
        <Text className="settings__version-text">版本 {version || '—'}</Text>
      </View>

      {/* 诊断日志：播放链路关键事件，可整段复制给客服/开发 */}
      {diagOpen && (
        <View className="settings__diag-mask" onClick={() => setDiagOpen(false)}>
          <View className="settings__diag" onClick={(e) => e.stopPropagation()}>
            <View className="settings__diag-head">
              <Text className="settings__diag-title">诊断日志</Text>
              <View className="settings__diag-close" onClick={() => setDiagOpen(false)}>
                <Icon name="x" size={28} color="#94a3b8" strokeWidth={2} />
              </View>
            </View>
            <ScrollView scrollY className="settings__diag-body">
              <Text className="settings__diag-text">{logsToText() || '暂无日志'}</Text>
            </ScrollView>
            <View className="settings__diag-copy" onClick={copyLogs}>
              <Text className="settings__diag-copy-text">复制全部</Text>
            </View>
            <View className="settings__diag-copy" onClick={onTestAudio}>
              <Text className="settings__diag-copy-text">
                {testingAudio ? '停止测试音频' : '播放测试音频（公共 MP3）'}
              </Text>
            </View>
            <View className="settings__diag-copy" onClick={onTestWebAudio}>
              <Text className="settings__diag-copy-text">WebAudio 蜂鸣测试</Text>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}
