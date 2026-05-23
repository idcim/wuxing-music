import { useState } from 'react';
import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { WUXING } from '@/constants/wuxing';
import { useUserStore } from '@/stores/user';
import CdkeyModal from '@/components/CdkeyModal';
import MiniPlayer from '@/components/MiniPlayer';
import TabBar from '@/components/TabBar';
import type { ElementId } from '@/types';
import './index.scss';

export default function Profile() {
  const element = useUserStore((s) => s.element);
  const isPremium = useUserStore((s) => s.isPremium);
  const user = useUserStore((s) => s.user);
  const el = element ? WUXING[element as ElementId] : null;

  const [cdkeyOpen, setCdkeyOpen] = useState(false);

  const retakeQuiz = () => Taro.navigateTo({ url: '/pages/quiz/index' });

  return (
    <View className="profile">
      <Text className="profile__title serif">我的</Text>

      <View className="profile__card fade-up">
        <Text className="profile__card-label">本命五行</Text>
        <Text className="profile__card-el serif" style={{ color: el?.primary || '#e2e8f0' }}>
          {el ? `${el.id}型 · ${el.note}音` : '尚未测评'}
        </Text>
        <Text className="profile__card-link" onClick={retakeQuiz}>
          {el ? '重新测评 ›' : '立即测评 ›'}
        </Text>
      </View>

      <View className="profile__card fade-up">
        <Text className="profile__card-label">会员状态</Text>
        <Text className="profile__card-el serif">
          {isPremium && user ? user.membership.name : '听闻 · 免费'}
        </Text>
        {isPremium && user?.membership.expireAt && (
          <Text className="profile__card-link">
            {new Date(user.membership.expireAt).toLocaleDateString()} 到期
          </Text>
        )}
      </View>

      <View className="profile__entry fade-up" onClick={() => setCdkeyOpen(true)}>
        <Text className="profile__entry-text">兑换码</Text>
        <Text className="profile__entry-arrow">›</Text>
      </View>

      <CdkeyModal open={cdkeyOpen} onClose={() => setCdkeyOpen(false)} />
      <MiniPlayer />
      <TabBar active="profile" />
    </View>
  );
}
