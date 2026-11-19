import { withTheme } from '@/theme/withTheme';
import { useState } from 'react';
import { View, Text, Button, Image } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import { commerceApi, coursePath, shopPath, money, useCommerce, type Entry } from '@/services/commerce';
import MarkdownView from '@/components/MarkdownView';
import { action, CommercePage, Cover, CustomerService, Feedback, Section, requireCommerceLogin, useData } from '@/features/commerce/common';
import { DetailFacts } from '@/features/commerce/catalog';
import { resolveUrl } from '@/utils/url';

function CourseDetail() {
  const id = Number(useRouter().params.id);
  const { data: course, loading, error, load } = useData<Entry>(`/courses/${id}`, {});
  const courseSaleOpen = useCommerce(s => s.config.courses_sale === true);
  const canBuyCourse = courseSaleOpen && course.purchase_ready === true;
  const [busy, setBusy] = useState(false);
  const openLesson = (lesson: Entry) => {
    if (!lesson.preview && !requireCommerceLogin()) return;
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
    if (course.price_fen && !canBuyCourse) return;
    setBusy(true);
    await action(async () => {
      if (!course.price_fen) { await commerceApi(`/courses/${id}/claim`, 'POST'); await load(); }
      else Taro.navigateTo({ url: `${shopPath}/checkout/index?kind=course&course=${id}` });
    });
    setBusy(false);
  };
  return <CommercePage title='课程详情' footer={course.id && <><CustomerService /><Button className='commerce__primary' loading={busy} disabled={Boolean(course.price_fen && !course.owned && !canBuyCourse)} onClick={start}>{course.owned ? '开始学习' : course.price_fen ? canBuyCourse ? '购买课程' : '暂未开放购买' : '免费领取'}</Button></>}>
    <Feedback loading={loading} error={error} retry={load} />
    {course.id && <>
      <Cover src={course.cover} title={course.title} large />
      <View className='catalog-detail__intro'><Text className='commerce__eyebrow'>MUSIC & LEARNING</Text><Text className='catalog-detail__title serif'>{course.title}</Text><Text className='commerce__muted'>{course.subtitle}</Text>
        <View className='catalog-detail__price-row'><Text className='commerce__price'>{course.price_fen ? money(course.price_fen) : '公益免费'}</Text><Text className='catalog-detail__badge'>{course.owned ? '已加入课堂' : '独立课程'}</Text></View>
        <DetailFacts><View className='catalog-facts__item'><Text className='catalog-facts__value'>{course.lesson_count} 节</Text><Text className='catalog-facts__label'>循序学习</Text></View><View className='catalog-facts__item'><Text className='catalog-facts__value'>{course.owned ? (course.valid_until ? '有效期内' : '长期有效') : course.access_days ? `${course.access_days} 天` : '长期有效'}</Text><Text className='catalog-facts__label'>学习有效期</Text></View><View className='catalog-facts__item'><Text className='catalog-facts__value'>随时续学</Text><Text className='catalog-facts__label'>记录学习进度</Text></View></DetailFacts>
        <Text className='commerce__caption'>课程与音乐会员独立。{course.owned && course.valid_until ? `当前权益有效期至 ${String(course.valid_until).slice(0, 10)}。` : ''}</Text>
      </View>
      <Section title='关于这堂课' eyebrow='ABOUT THE COURSE'><MarkdownView source={course.intro || '课程介绍即将更新。'} /></Section>
      {course.teacher && <Section title='与你一起学音乐' eyebrow='YOUR TEACHER'><View className='course-teacher'>{course.teacher.avatar && <Image className='course-teacher__avatar' src={resolveUrl(course.teacher.avatar)} mode='aspectFill' />}<View><Text className='course-teacher__name serif'>{course.teacher.name}</Text><Text className='commerce__caption'>授课老师</Text></View></View><MarkdownView source={course.teacher.intro || ''} /></Section>}
      <Section title={`课程目录 · ${course.lesson_count} 节`} eyebrow='CURRICULUM'>
        {course.lessons?.map((lesson: Entry, index: number) => <View className='course-lesson' key={lesson.id} onClick={() => openLesson(lesson)}>
          <Text className='course-lesson__number cormorant'>{String(index + 1).padStart(2, '0')}</Text><View className='course-lesson__body'><Text className='course-lesson__title'>{lesson.title}</Text><Text className='course-lesson__meta'>{lesson.progress?.completed ? '已学完' : lesson.preview ? '免费试看 / 试听' : course.owned ? '已解锁' : '购买后学习'}</Text></View><Text className='course-lesson__state'>{lesson.preview ? '试看 ›' : '›'}</Text>
        </View>)}
      </Section>
      <Section title='学习说明'><MarkdownView source={course.instructions || '可按章节学习，登录后保留学习进度。'} /></Section>
      <Section title='购买与售后'><MarkdownView source={course.policy || '如有疑问，请先咨询客服。'} /></Section>
    </>}
  </CommercePage>;
}

export default withTheme(CourseDetail);
