import { useEffect, useState } from 'react';
import { View, Text, Image } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { getSiteInfo, type SiteInfo } from '@/services/site';
import { resolveUrl } from '@/utils/url';
import './index.scss';

export default function About() {
  const [info, setInfo] = useState<SiteInfo | null>(null);

  useEffect(() => {
    getSiteInfo().then(setInfo);
  }, []);

  const back = () => Taro.navigateBack();

  return (
    <View className="about">
      <View className="about__nav">
        <Text className="about__back" onClick={back}>‹</Text>
        <Text className="about__nav-title">关于我们</Text>
        <View className="about__nav-spacer" />
      </View>

      <View className="about__head fade-up">
        {info?.logo_url ? (
          <Image className="about__logo" src={resolveUrl(info.logo_url)} mode="aspectFit" />
        ) : (
          <Text className="about__logo-text serif">律</Text>
        )}
        <Text className="about__name serif">{info?.site_name || '五行律音'}</Text>
      </View>

      {!!info?.about_us && (
        <View className="about__section fade-up">
          <Text className="about__text">{info.about_us}</Text>
        </View>
      )}

      {!!info?.service_terms && (
        <View className="about__section fade-up">
          <Text className="about__section-title">服务条款</Text>
          <Text className="about__text">{info.service_terms}</Text>
        </View>
      )}

      <View className="about__footer">
        {!!info?.contact_email && (
          <Text className="about__contact">邮箱：{info.contact_email}</Text>
        )}
        {!!info?.contact_phone && (
          <Text className="about__contact">电话：{info.contact_phone}</Text>
        )}
        {!!info?.icp_no && <Text className="about__icp">{info.icp_no}</Text>}
      </View>
    </View>
  );
}
