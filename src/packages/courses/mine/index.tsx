import { useEffect, useRef, useState } from 'react';
import { View, Text, Button, Slider } from '@tarojs/components';
import { Video } from '@tarojs/components';
import Taro, { useDidHide, useRouter } from '@tarojs/taro';
import { commerceApi, coursePath, shopPath, money, useCommerce, type Entry } from '@/services/commerce';
import { usePlayerStore } from '@/stores/player';
import MarkdownView from '@/components/MarkdownView';
import { action, CommercePage, Cover, CustomerService, Feedback, requireCommerceLogin, useData } from '@/features/commerce/common';

export default function MyCourses() {
  const { data, loading, error, load } = useData<Entry[]>('/courses/mine', []);
  return <CommercePage title='我的课程'><Feedback loading={loading} error={error} retry={load} />
    {!loading && !error && !data.length && <Text className='commerce__empty'>还没有课程，先去课程页看看吧</Text>}
    {data.map(course => <View className='commerce__card' key={course.id} onClick={() => Taro.navigateTo({ url: `${coursePath}/detail/index?id=${course.id}` })}>
      <Cover src={course.cover} /><View className='commerce__card-body'><Text className='commerce__name'>{course.title}</Text>
        <Text className='commerce__muted'>已完成 {course.lessons.filter((l: Entry) => l.progress?.completed).length} / {course.lesson_count} 节</Text>
        <Text className='commerce__muted'>{course.valid_until ? `有效期至 ${String(course.valid_until).slice(0, 10)}` : course.owned ? '长期有效' : '权益不可用'}</Text>
        {course.lessons.some((l: Entry) => l.progress) && <Text className='commerce__muted'>上次学习：{[...course.lessons].filter((l: Entry) => l.progress).sort((a: Entry, b: Entry) => String(b.progress.updated_at).localeCompare(String(a.progress.updated_at)))[0]?.title}</Text>}
        <Text>{course.owned ? '继续学习 →' : course.enrollments.every((e: Entry) => e.revoked) ? '已退款 / 权益已撤销' : '学习权益已到期'}</Text>
      </View></View>)}
  </CommercePage>;
}
