import { withTheme } from '@/theme/withTheme';
import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { coursePath, type Entry } from '@/services/commerce';
import { CommercePage, Cover, EmptyState, Feedback, SectionHeading, useData } from '@/features/commerce/common';
import { rpx } from '@/utils/unit';
import '@/features/commerce/catalog.scss';

function MyCourses() {
  const { data, loading, error, load } = useData<Entry[]>('/courses/mine', []);
  return <CommercePage title='我的课堂'>
    <SectionHeading title='每一次学习，都有回响' caption='已加入的课程与最近学习记录' />
    <Feedback loading={loading} error={error} retry={load} />
    {!loading && !error && !data.length && <EmptyState title='从一堂课开始' description='领一堂公益课，或选择你喜欢的音乐课程。' actionLabel='发现课程' onAction={() => Taro.redirectTo({ url: `${coursePath}/list/index` })} />}
    {data.map(course => {
      const lessons = course.lessons || [];
      const completed = lessons.filter((l: Entry) => l.progress?.completed).length;
      const last = [...lessons].filter((l: Entry) => l.progress).sort((a: Entry, b: Entry) => String(b.progress.updated_at).localeCompare(String(a.progress.updated_at)))[0];
      const percentage = course.lesson_count ? Math.min(100, completed / course.lesson_count * 100) : 0;
      return <View className='catalog-course' key={course.id} onClick={() => Taro.navigateTo({ url: `${coursePath}/detail/index?id=${course.id}` })}>
        <View className='catalog-course__visual'><Cover src={course.cover} title={course.title} /></View><View className='catalog-course__body'>
          <Text className='catalog-course__title serif'>{course.title}</Text><Text className='commerce__caption'>{course.valid_until ? `有效期至 ${String(course.valid_until).slice(0, 10)}` : course.owned ? '长期有效' : '权益不可用'}</Text>
          <View className='course-progress'><View className='course-progress__fill' style={{ width: `${percentage}%` }} /></View><Text className='commerce__caption'>已完成 {completed} / {course.lesson_count} 节</Text>
          {last && <Text className='commerce__caption'>上次：{last.title}</Text>}
          <Text className='catalog-course__cta' style={{ display: 'block', marginTop: rpx(20) }}>{course.owned ? '继续学习 ›' : course.enrollments?.every((e: Entry) => e.revoked) ? '已退款 / 权益已撤销' : '学习权益已到期'}</Text>
        </View>
      </View>;
    })}
  </CommercePage>;
}
export default withTheme(MyCourses);
