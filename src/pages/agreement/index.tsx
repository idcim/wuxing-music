import { useEffect, useState } from 'react';
import { View, Text } from '@tarojs/components';
import { goBack, navTopStyle } from '@/utils/nav';
import { getSiteInfo } from '@/services/site';
import MarkdownView from '@/components/MarkdownView';
import './index.scss';

export default function Agreement() {
  const [terms, setTerms] = useState<string | null>(null);

  useEffect(() => {
    getSiteInfo().then((info) => setTerms(info.service_terms));
  }, []);

  return (
    <View className="agreement">
      <View className="agreement__nav" style={navTopStyle()}>
        <Text className="agreement__back" onClick={() => goBack('/pages/login/index')}>‹ 返回</Text>
        <Text className="agreement__title">用户服务协议</Text>
      </View>
      <View className="agreement__body">
        {terms === null ? (
          <Text>正在加载协议…</Text>
        ) : terms ? (
          <MarkdownView source={terms} />
        ) : (
          <Text>用户服务协议暂未配置，请稍后再试。</Text>
        )}
      </View>
    </View>
  );
}
