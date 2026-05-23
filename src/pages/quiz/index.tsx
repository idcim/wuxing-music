import { useState } from 'react';
import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import Icon from '@/components/Icon';
import { QUIZ_QUESTIONS, EMPTY_SCORES, calcTopElement } from '@/constants/quiz';
import { useUserStore } from '@/stores/user';
import { submitQuiz } from '@/services/user';
import type { ElementScores, QuizOption } from '@/types';
import './index.scss';

export default function Quiz() {
  const [step, setStep] = useState(0);
  const [scores, setScores] = useState<ElementScores>({ ...EMPTY_SCORES });
  const setElement = useUserStore((s) => s.setElement);

  const question = QUIZ_QUESTIONS[step];

  const back = () => {
    if (step > 0) setStep(step - 1);
    else Taro.navigateBack().catch(() => Taro.redirectTo({ url: '/pages/onboard/index' }));
  };

  const choose = (opt: QuizOption) => {
    const next = { ...scores };
    (Object.entries(opt.score) as [keyof ElementScores, number][]).forEach(
      ([k, v]) => { next[k] += v; }
    );
    setScores(next);

    if (step < QUIZ_QUESTIONS.length - 1) {
      setStep(step + 1);
    } else {
      const top = calcTopElement(next);
      setElement(top, next);
      submitQuiz(top, next).catch(() => { /* 同步失败不阻断流程，已存本地 */ });
      Taro.redirectTo({ url: `/pages/result/index?element=${encodeURIComponent(top)}` });
    }
  };

  return (
    <View className="quiz">
      {/* 顶部栏：返回 + 分段进度 + 计数 */}
      <View className="quiz__top">
        <View className="quiz__back" onClick={back}>
          <Icon name="chevronLeft" size={32} color="#94a3b8" strokeWidth={2} />
        </View>
        <View className="quiz__seg">
          {QUIZ_QUESTIONS.map((_, i) => (
            <View
              key={i}
              className={`quiz__seg-item${i <= step ? ' quiz__seg-item--on' : ''}`}
            />
          ))}
        </View>
        <Text className="quiz__count cormorant">
          {step + 1} / {QUIZ_QUESTIONS.length}
        </Text>
      </View>

      {/* 题目区：换题时 key 触发 fade-up 重播 */}
      <View className="quiz__panel fade-up" key={step}>
        <Text className="quiz__qno cormorant italic">
          QUESTION {String(step + 1).padStart(2, '0')}
        </Text>
        <Text className="quiz__q serif">{question.q}</Text>
        <View className="quiz__opts">
          {question.opts.map((opt) => (
            <View key={opt.text} className="quiz__opt" onClick={() => choose(opt)}>
              <Text className="quiz__opt-text">{opt.text}</Text>
              <Icon name="arrowRight" size={28} color="#475569" strokeWidth={1.5} />
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}
