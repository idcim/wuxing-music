import { useState } from 'react';
import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { goBack } from '@/utils/nav';
import Icon from '@/components/Icon';
import { QUIZ_QUESTIONS, EMPTY_SCORES, calcTopElement } from '@/constants/quiz';
import { useUserStore } from '@/stores/user';
import { submitQuiz } from '@/services/user';
import { storage, STORAGE_KEYS } from '@/services/storage';
import type { ElementScores, QuizOption } from '@/types';
import './index.scss';

interface QuizProgress {
  step: number;
  scores: ElementScores;
}

// 中途进度只在本地留存，答完即清。H5 上刷新/误触后退都会重挂组件，
// 不存的话答到第 3 题退出就全没了，得从头再来。
function loadProgress(): QuizProgress | null {
  const p = storage.get<QuizProgress>(STORAGE_KEYS.QUIZ_PROGRESS);
  if (!p || typeof p.step !== 'number' || !p.scores) return null;
  if (p.step <= 0 || p.step >= QUIZ_QUESTIONS.length) return null;
  return p;
}

export default function Quiz() {
  const saved = loadProgress();
  const [step, setStep] = useState(saved?.step ?? 0);
  const [scores, setScores] = useState<ElementScores>(saved?.scores ?? { ...EMPTY_SCORES });
  const setElement = useUserStore((s) => s.setElement);

  const question = QUIZ_QUESTIONS[step];

  const back = () => {
    if (step > 0) {
      const prev = step - 1;
      setStep(prev);
      storage.set(STORAGE_KEYS.QUIZ_PROGRESS, { step: prev, scores });
    } else {
      storage.remove(STORAGE_KEYS.QUIZ_PROGRESS);
      goBack('/pages/onboard/index');
    }
  };

  const choose = (opt: QuizOption) => {
    const next = { ...scores };
    (Object.entries(opt.score) as [keyof ElementScores, number][]).forEach(
      ([k, v]) => { next[k] += v; }
    );
    setScores(next);

    if (step < QUIZ_QUESTIONS.length - 1) {
      const nextStep = step + 1;
      setStep(nextStep);
      storage.set(STORAGE_KEYS.QUIZ_PROGRESS, { step: nextStep, scores: next });
    } else {
      storage.remove(STORAGE_KEYS.QUIZ_PROGRESS);   // 答完清进度，下次重测从头开始
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
