import { useEffect, useRef, useState } from 'react';
import { View, Text, Button, Slider } from '@tarojs/components';
import { Video } from '@tarojs/components';
import Taro, { useDidHide, useRouter } from '@tarojs/taro';
import { commerceApi, coursePath, shopPath, money, useCommerce, type Entry } from '@/services/commerce';
import { usePlayerStore } from '@/stores/player';
import MarkdownView from '@/components/MarkdownView';
import { action, CommercePage, Cover, CustomerService, Feedback, requireCommerceLogin, useData } from '@/features/commerce/common';

export default function CourseList() {
  const [category, setCategory] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const { data, loading, error, load } = useData<Entry>(`/catalog/course?page=${page}&category=${category || ''}`, { items: [], categories: [], total: 0 });
  const cfg = useCommerce(s => s.config);
  return <CommercePage title='课程' tab='course'>
    <View className='commerce__hero' onClick={() => cfg.course_banner_course_id && Taro.navigateTo({ url: `${coursePath}/detail/index?id=${cfg.course_banner_course_id}` })}>
      <Cover src={cfg.course_banner} title='在音乐中，重新认识自己' large />
      <View className='commerce__card-body'><Text className='commerce__name'>东方音乐 · 美育课堂</Text><Text className='commerce__muted'>视频与音频课程，按章节循序学习。课程独立购买，音乐会员不包含课程。</Text></View>
    </View>
    <View className='commerce__actions'><Button className='commerce__secondary' onClick={() => requireCommerceLogin() && Taro.navigateTo({ url: `${coursePath}/mine/index` })}>我的课程</Button></View>
    {data.categories.length > 1 && <View className='commerce__chips'>{[{ id: null, name: '全部' }, ...data.categories].map((c: Entry) => <Text key={c.id || 'all'} className={`commerce__chip ${category === c.id ? 'commerce__chip--active' : ''}`} onClick={() => { setCategory(c.id); setPage(1); }}>{c.name}</Text>)}</View>}
    {cfg.courses_visible === false ? <Text className='commerce__empty'>课程正在准备中，敬请期待</Text> : <>
      <Feedback loading={loading} error={error} retry={load} />
      {!loading && !error && !data.items.length && <Text className='commerce__empty'>新课程筹备中</Text>}
      {data.items.map((course: Entry) => <View className='commerce__card' key={course.id} onClick={() => Taro.navigateTo({ url: `${coursePath}/detail/index?id=${course.id}` })}>
        <Cover src={course.cover} /><View className='commerce__card-body'><Text className='commerce__name'>{course.title}</Text><Text className='commerce__muted'>{course.subtitle}</Text>
          <Text className='commerce__muted'>{course.lesson_count} 课时</Text><Text className='commerce__price'>{course.price_fen ? money(course.price_fen) : '公益免费'}</Text>
          <Text>{course.owned ? '开始学习 →' : '查看课程 →'}</Text></View>
      </View>)}
      {data.total > 20 && <View className='commerce__actions'><Button disabled={page === 1} onClick={() => setPage(page - 1)}>上一页</Button><Text>第 {page} 页</Text><Button disabled={page * 20 >= data.total} onClick={() => setPage(page + 1)}>下一页</Button></View>}
    </>}
  </CommercePage>;
}
