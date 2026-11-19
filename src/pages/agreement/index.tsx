import { withTheme } from '@/theme/withTheme';
import { useEffect, useState } from 'react';
import Taro from '@tarojs/taro';
import { request } from '@/services/api';
import { isAndroidApp } from '@/utils/platform';
import { View, Text } from '@tarojs/components';
import { goBack, navBarStyle } from '@/utils/nav';
import { getSiteInfo } from '@/services/site';
import MarkdownView from '@/components/MarkdownView';
import './index.scss';

function Agreement() {
  const isAppPrivacy = isAndroidApp && Taro.getCurrentInstance().router?.params.kind === 'app-privacy';
  const [terms, setTerms] = useState<string | null>(null);

  useEffect(() => {
    if (isAppPrivacy) request<{ content: string }>('/api/app/wechat/privacy', { auth: false }).then((data) => setTerms(data.content)).catch(() => setTerms(''));
    else getSiteInfo().then((info) => setTerms(info.service_terms));
  }, []);

  return (
    <View className="agreement">
      <View className="agreement__nav" style={navBarStyle()}>
        <Text className="agreement__back" onClick={() => goBack('/pages/login/index')}>‹ 返回</Text>
        <Text className="agreement__title">{isAppPrivacy ? '隐私政策' : '用户服务协议'}</Text>
      </View>
      <View className="agreement__body">
        {terms === null ? (
          <Text>正在加载协议…</Text>
        ) : terms ? (
          <MarkdownView source={terms} />
        ) : (
          <Text>{isAppPrivacy ? '隐私政策' : '用户服务协议'}暂未配置，请稍后再试。</Text>
        )}
      </View>
    </View>
  );
}

export default withTheme(Agreement);
