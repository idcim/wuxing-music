import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import './index.scss';

export default function Onboard() {
  const startQuiz = () => Taro.navigateTo({ url: '/pages/quiz/index' });
  const skip = () => Taro.reLaunch({ url: '/pages/home/index' });

  return (
    <View className="onboard">
      <Text className="onboard__skip" onClick={skip}>跳过</Text>
      <View className="onboard__body fade-up">
        <Text className="onboard__title serif">寻你的本命音律</Text>
        <Text className="onboard__desc">
          以中医五行为本，4 题快速测评，{'\n'}为你匹配专属安神音律方案。
        </Text>
      </View>
      <View className="onboard__btn" onClick={startQuiz}>
        <Text className="onboard__btn-text">开始测评</Text>
      </View>
    </View>
  );
}
