import { withTheme } from '@/theme/withTheme';
import { useState } from 'react';
import { View, Text, Button } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { coursePath, money, useCommerce, type Entry } from '@/services/commerce';
import { resolveUrl } from '@/utils/url';
import { CommercePage, Cover, EmptyState, Feedback, SectionHeading, requireCommerceLogin, useData } from '@/features/commerce/common';
import { CatalogHero, QuickEntry } from '@/features/commerce/catalog';
import courseBanner from '@/assets/commerce/course-banner.jpg';

function CourseList() {
  const [category, setCategory] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const { data, loading, error, load } = useData<Entry>(`/catalog/course?page=${page}${category === null ? '' : `&category=${category}`}`, { items: [], categories: [], total: 0 });
  const cfg = useCommerce(s => s.config);
  return <CommercePage title='课程' tab='course'>
    <CatalogHero image={cfg.course_banner ? resolveUrl(cfg.course_banner) : courseBanner} eyebrow='THE ART OF LISTENING' title='以乐入心，以学见美' description='从一段旋律开始，走近东方音乐的世界。'
      onClick={cfg.course_banner_course_id ? () => Taro.navigateTo({ url: `${coursePath}/detail/index?id=${cfg.course_banner_course_id}` }) : undefined} />
    <View className='catalog-quick-row'><QuickEntry mark='学' label='我的课堂' description='已购课程 · 继续上次学习' onClick={() => requireCommerceLogin() && Taro.navigateTo({ url: `${coursePath}/mine/index` })} /></View>
    <SectionHeading title='音律学堂' caption='把热爱，慢慢学成日常' />
    {data.categories.length > 1 && <View className='commerce__chips'>{[{ id: null, name: '全部课程' }, ...data.categories].map((c: Entry) => <Text key={c.id || 'all'} className={`commerce__chip ${category === c.id ? 'commerce__chip--active' : ''}`} onClick={() => { setCategory(c.id); setPage(1); }}>{c.name}</Text>)}</View>}
    {cfg.courses_visible === false ? <EmptyState title='好课正在准备' description='新的声音与灵感，即将相见。' /> : <>
      <Feedback loading={loading} error={error} retry={load} />
      {!loading && !error && !data.items.length && <EmptyState title='下一堂好课，值得等待' description='我们正在认真准备课程内容，欢迎下次再来。' />}
      {data.items.map((course: Entry) => <View className='catalog-course' key={course.id} onClick={() => Taro.navigateTo({ url: `${coursePath}/detail/index?id=${course.id}` })}>
        <View className='catalog-course__visual'><Cover src={course.cover} title={course.title} /></View>
        <View className='catalog-course__body'><Text className='catalog-course__tag'>{course.lesson_count} 节课程{course.owned ? ' · 已加入课堂' : ''}</Text><Text className='catalog-course__title serif'>{course.title}</Text><Text className='catalog-course__subtitle'>{course.subtitle}</Text>
          <View className='catalog-course__bottom'><Text className='catalog-course__price'>{course.price_fen ? money(course.price_fen) : '公益免费'}</Text><Text className='catalog-course__cta'>{course.owned ? '开始学习' : '查看课程'} ›</Text></View>
        </View>
      </View>)}
      {data.total > 20 && <View className='commerce__actions'><Button disabled={page === 1} onClick={() => setPage(page - 1)}>上一页</Button><Text>第 {page} 页</Text><Button disabled={page * 20 >= data.total} onClick={() => setPage(page + 1)}>下一页</Button></View>}
    </>}
    <Text className='catalog-note'>课程按套独立购买，音乐会员不包含课程。公益课程登录后可免费领取。</Text>
  </CommercePage>;
}
export default withTheme(CourseList);
