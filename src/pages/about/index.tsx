import { useEffect, useState } from 'react';
import { View, Text, Image } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { goBack } from '@/utils/nav';
import { getSiteInfo, type SiteInfo } from '@/services/site';
import { useSiteStore } from '@/stores/site';
import { WUXING_DISCLAIMER, WUXING_MNEMONIC } from '@/constants/wuxing';
import { resolveUrl } from '@/utils/url';
import './index.scss';

export default function About() {
  const [info, setInfo] = useState<SiteInfo | null>(null);
  // 本页自己也拉一次站点信息（要 about_us / 联系方式），
  // 但首屏那一下先用 store 里已缓存的品牌名，别闪一个写死的名字
  const fallbackName = useSiteStore((s) => s.site.site_name);

  useEffect(() => {
    getSiteInfo().then(setInfo);
  }, []);

  const back = () => goBack();

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
        <Text className="about__name serif">{info?.site_name || fallbackName}</Text>
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

      {/* 合规免责：不依赖后台「关于我们」是否填了这句，硬编码常驻
          （docs/WUXING-REFERENCE.md 一 · 合规红线） */}
      <View className="about__section fade-up">
        <Text className="about__section-title">关于五音五行</Text>
        <Text className="about__text">{WUXING_DISCLAIMER}</Text>
        <Text className="about__mnemonic serif">{WUXING_MNEMONIC}</Text>
      </View>

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
