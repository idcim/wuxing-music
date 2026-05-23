import { useState } from 'react';
import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { QUIZ_QUESTIONS, EMPTY_SCORES, calcTopElement } from '@/constants/quiz';
import { useUserStore } from '@/stores/user';
import type { ElementScores, QuizOption } from '@/types';
import './index.scss';

export default function Quiz() {
  const [step, setStep] = useState(0);
  const [scores, setScores] = useState<ElementScores>({ ...EMPTY_SCORES });
  const setElement = useUserStore((s) => s.setElement);

  const question = QUIZ_QUESTIONS[step];
  const progress = ((step + 1) / QUIZ_QUESTIONS.length) * 100;

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
      Taro.redirectTo({ url: `/pages/result/index?element=${encodeURIComponent(top)}` });
    }
  };

  return (
    <View className="quiz">
      <View className="quiz__bar">
        <View className="quiz__bar-fill" style={{ width: `${progress}%` }} />
      </View>
      <Text className="quiz__step">{step + 1} / {QUIZ_QUESTIONS.length}</Text>
      <Text className="quiz__q serif">{question.q}</Text>
      <View className="quiz__opts">
        {question.opts.map((opt) => (
          <View key={opt.text} className="quiz__opt fade-up" onClick={() => choose(opt)}>
            <Text className="quiz__opt-text">{opt.text}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
