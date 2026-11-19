import { useEffect, useState } from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useAppUpdate, dismissAppUpdate, openAppUpdateDownload, exitForAppUpdate } from '@/services/appUpdate';
import { usePlayerStore } from '@/stores/player';
import { isAndroidApp } from '@/utils/platform';
import './index.scss';

export default function AppUpdatePrompt() {
  const { visible, release, guide, force } = useAppUpdate(s => s);
  const [opening, setOpening] = useState(false);
  useEffect(() => {
    if (isAndroidApp && visible && force) usePlayerStore.getState().stop();
  }, [visible, force]);
  if (!isAndroidApp || !visible || !release) return null;

  const download = async () => {
    if (opening) return;
    setOpening(true);
    try { await openAppUpdateDownload(); }
    catch (error: any) { Taro.showToast({ title: error?.message || '无法打开下载，请稍后重试', icon: 'none' }); }
    finally { setOpening(false); }
  };
  const exit = async () => {
    try { await exitForAppUpdate(); }
    catch { Taro.showToast({ title: '退出失败，请使用系统返回键退出', icon: 'none' }); }
  };

  return <View className="app-update-mask">
    <View className="app-update" onClick={event => event.stopPropagation()}>
      <Text className="app-update__title">发现新版本</Text>
      <Text className="app-update__version">{release.version_name} · {(release.size / 1024 / 1024).toFixed(1)} MB</Text>
      <ScrollView scrollY className="app-update__body">
        <Text className="app-update__notes">{release.notes || '优化使用体验，欢迎更新。'}</Text>
        <Text className="app-update__guide">{guide || '将在浏览器中下载安卓安装包，下载完成后请按系统提示安装。'}</Text>
        {force && <Text className="app-update__required">当前版本需要更新后继续使用。你也可以退出应用。</Text>}
      </ScrollView>
      <View className="app-update__primary" onClick={download}>
        <Text>{opening ? '正在打开…' : '立即更新'}</Text>
      </View>
      <View className="app-update__secondary" onClick={force ? exit : dismissAppUpdate}>
        <Text>{force ? '退出应用' : '稍后再说'}</Text>
      </View>
    </View>
  </View>;
}
