import { useEffect, useRef, useState } from 'react';
import { View, Text, Button, Slider } from '@tarojs/components';
import { Video } from '@tarojs/components';
import Taro, { useDidHide, useRouter } from '@tarojs/taro';
import { commerceApi, coursePath, shopPath, money, useCommerce, type Entry } from '@/services/commerce';
import { usePlayerStore } from '@/stores/player';
import MarkdownView from '@/components/MarkdownView';
import { action, CommercePage, Cover, CustomerService, Feedback, requireCommerceLogin, useData } from '@/features/commerce/common';

export default function CourseDetail() {
  const id = Number(useRouter().params.id);
  const { data: course, loading, error, load } = useData<Entry>(`/courses/${id}`, {});
  const [busy, setBusy] = useState(false);
  const openLesson = (lesson: Entry) => {
    if (!requireCommerceLogin()) return;
    if (!course.owned && !lesson.preview) return Taro.showToast({ title: '请先领取或购买课程', icon: 'none' });
    Taro.navigateTo({ url: `${coursePath}/learn/index?id=${id}&lesson=${lesson.id}` });
  };
  const start = async () => {
    if (!requireCommerceLogin() || busy) return;
    if (course.owned) {
      const sorted = [...(course.lessons || [])].sort((a, b) => String(b.progress?.updated_at || '').localeCompare(String(a.progress?.updated_at || '')));
      if (sorted[0]) openLesson(sorted[0]);
      return;
    }
    setBusy(true);
    await action(async () => {
      if (!course.price_fen) { await commerceApi(`/courses/${id}/claim`, 'POST'); await load(); }
      else Taro.navigateTo({ url: `${shopPath}/checkout/index?kind=course&course=${id}` });
    });
    setBusy(false);
  };
  return <CommercePage title='课程详情' footer={course.id && <><CustomerService /><Button className='commerce__primary' loading={busy} onClick={start}>{course.owned ? '开始学习' : course.price_fen ? '购买课程' : '免费领取'}</Button></>}>
    <Feedback loading={loading} error={error} retry={load} />
    {course.id && <>
      <Cover src={course.cover} title={course.title} large /><Text className='commerce__name'>{course.title}</Text><Text className='commerce__muted'>{course.subtitle}</Text>
      <Text className='commerce__price'>{course.price_fen ? money(course.price_fen) : '公益免费'}</Text>
      <Text className='commerce__muted'>课程独立购买，与音乐会员分开。{course.owned ? (course.valid_until ? `学习有效期至 ${String(course.valid_until).slice(0, 10)}` : '学习长期有效') : course.access_days ? `获得权益后可学习 ${course.access_days} 天` : '长期有效'}</Text>
      <Text className='commerce__name'>课程介绍</Text><MarkdownView source={course.intro || ''} />
      {course.teacher && <View className='commerce__card commerce__card-body'><Text className='commerce__name'>授课老师 · {course.teacher.name}</Text><MarkdownView source={course.teacher.intro} /></View>}
      <Text className='commerce__name'>课程目录 · {course.lesson_count} 课时</Text>
      {course.lessons?.map((lesson: Entry, index: number) => <View className='commerce__card commerce__card-body' key={lesson.id} onClick={() => openLesson(lesson)}>
        <Text>{index + 1}. {lesson.title}</Text><Text className='commerce__muted'>{lesson.preview ? '免费试看 / 试听' : course.owned ? '已解锁' : '购买后学习'}{lesson.progress?.completed ? ' · 已学完' : ''}</Text>
      </View>)}
      <Text className='commerce__name'>学习说明</Text><MarkdownView source={course.instructions || ''} />
      <Text className='commerce__name'>购买与售后说明</Text><MarkdownView source={course.policy || '如有疑问，请先咨询客服。'} />
    </>}
  </CommercePage>;
}
