import { useState } from 'react';
import { View, Text } from '@tarojs/components';
import { useRouter } from '@tarojs/taro';
import { goBack, navTopStyle } from '@/utils/nav';
import Icon from '@/components/Icon';
import { A } from '@/utils/color';
import {
  ELEMENT_LIST,
  WUXING,
  WUXING_MNEMONIC,
  WUXING_DISCLAIMER
} from '@/constants/wuxing';
import { useUserStore } from '@/stores/user';
import type { ElementId, ElementMeta } from '@/types';
import './index.scss';

/**
 * 文化维度的分组呈现。数据来自 element.meta（后台可编辑），
 * 内容基准是 docs/WUXING-REFERENCE.md 的「五行总对应表」。
 *
 * 用常量表驱动而不是写三十个 JSX 分支：后台把某项清空时整行自动消失，
 * 日后加维度也只改这张表。
 *
 * ⚠️「身心对照」组带 note —— 五脏五腑属文化对照，不能读成疗效承诺，
 * 这条是参考文档第一节的硬约束，别删。
 */
const SECTIONS: {
  title: string;
  en: string;
  note?: string;
  items: [string, keyof ElementMeta][];
}[] = [
  {
    title: '声音',
    en: 'Sound',
    items: [
      ['简谱近似', 'notation'],
      ['五声调式', 'mode'],
      ['音乐气质', 'musicMood'],
      ['内容关键词', 'keywords']
    ]
  },
  {
    title: '天地',
    en: 'Nature',
    items: [
      ['基本气质', 'temperament'],
      ['方位', 'direction'],
      ['气候', 'climate'],
      ['五化', 'phase'],
      ['五色', 'colorName'],
      ['五味', 'taste'],
      ['五臭', 'smell'],
      ['时间感', 'timeFeel'],
      ['空间感', 'spaceFeel'],
      ['适合画面', 'imagery']
    ]
  },
  {
    title: '身心对照',
    en: 'Body',
    note: '以下为传统文化中的对应关系，非医学诊断或疗效说明。',
    items: [
      ['五脏', 'organZang'],
      ['五腑', 'organFu'],
      ['五官', 'sense'],
      ['五体', 'tissue'],
      ['五华', 'bloom'],
      ['五液', 'fluid'],
      ['五志', 'emotion'],
      ['五神', 'spirit'],
      ['人声五声', 'voice']
    ]
  },
  {
    title: '心境',
    en: 'Mind',
    items: [
      ['情绪失衡表现', 'imbalance'],
      ['情绪转化方向', 'transform']
    ]
  },
  {
    title: '象征',
    en: 'Symbol',
    items: [
      ['五常', 'virtue'],
      ['五德感受', 'virtueFeel'],
      ['五方神兽', 'beast'],
      ['五星', 'star'],
      ['天干', 'gan'],
      ['地支', 'zhi'],
      ['八卦', 'gua']
    ]
  }
];

export default function Tones() {
  const router = useRouter();
  const userElement = useUserStore((s) => s.element);
  const initial = (router.params.id
    ? (decodeURIComponent(router.params.id) as ElementId)
    : (userElement as ElementId)) || '木';
  const [selected, setSelected] = useState<ElementId>(
    WUXING[initial] ? initial : '木'
  );

  const el = WUXING[selected];
  const back = () => goBack('/pages/explore/index');

  return (
    <View className="tones" style={{ background: el.bg }}>
      <View className="tones__nav" style={navTopStyle()}>
        <Text className="tones__back" onClick={back}>‹</Text>
        <Text className="tones__nav-title">五音对照</Text>
        <View className="tones__nav-spacer" />
      </View>

      {/* 五音横轴：角徵宫商羽。按五行相生序排，与其余页面的 ELEMENT_ORDER 一致 */}
      <View className="tones__axis">
        {ELEMENT_LIST.map((w) => {
          const on = w.id === selected;
          return (
            <View
              key={w.id}
              className="tones__axis-item"
              onClick={() => setSelected(w.id)}
            >
              <Text
                className="tones__axis-note serif"
                style={{ color: on ? w.primary : '#475569' }}
              >
                {w.note}
              </Text>
              <Text
                className="tones__axis-el"
                style={{ color: on ? w.accent : '#475569' }}
              >
                {w.id}
              </Text>
              <View
                className="tones__axis-dot"
                style={{ background: on ? w.primary : 'transparent' }}
              />
            </View>
          );
        })}
      </View>

      {/* 当前音：音名 + 简谱 + 调式 + 气质 */}
      <View className="tones__hero fade-up" key={selected}>
        <Text className="tones__hero-note serif" style={{ color: el.primary }}>
          {el.note}
        </Text>
        <Text className="tones__hero-line" style={{ color: el.accent }}>
          {[`${el.id}· ${el.en}`, el.meta?.notation, el.meta?.mode]
            .filter(Boolean)
            .join(' · ')}
        </Text>
        {!!el.meta?.musicMood && (
          <Text className="tones__hero-mood">{el.meta.musicMood}</Text>
        )}

        {!!el.sleepTip && (
          <View
            className="tones__quote"
            style={{
              background: `linear-gradient(135deg, ${A.a10(el.primary)}, transparent)`,
              borderColor: A.a25(el.primary)
            }}
          >
            <Text className="tones__quote-text serif">{el.sleepTip}</Text>
          </View>
        )}
      </View>

      {/* 分组维度 */}
      {SECTIONS.map((sec) => {
        const rows = sec.items.filter(([, k]) => !!el.meta?.[k]);
        if (!rows.length) return null;
        return (
          <View key={sec.title} className="tones__section">
            <View className="tones__section-head">
              <Text className="tones__section-zh">{sec.title}</Text>
              <Text className="tones__section-en cormorant italic">{sec.en}</Text>
            </View>
            {!!sec.note && <Text className="tones__section-note">{sec.note}</Text>}
            <View className="tones__rows">
              {rows.map(([label, k]) => (
                <View key={k} className="tones__row">
                  <Text className="tones__row-k">{label}</Text>
                  <Text className="tones__row-v" style={{ color: el.accent }}>
                    {el.meta?.[k]}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        );
      })}

      {/* 口诀 */}
      <View className="tones__mnemonic">
        <View className="tones__mnemonic-head">
          <Icon name="sparkles" size={26} color="#475569" strokeWidth={1.5} />
          <Text className="tones__section-en cormorant italic">Mnemonic</Text>
        </View>
        {!!el.meta?.mnemonic && (
          <Text className="tones__mnemonic-one serif" style={{ color: el.accent }}>
            {el.meta.mnemonic}
          </Text>
        )}
        <Text className="tones__mnemonic-all serif">{WUXING_MNEMONIC}</Text>
      </View>

      <Text className="tones__disclaimer">{WUXING_DISCLAIMER}</Text>
    </View>
  );
}
