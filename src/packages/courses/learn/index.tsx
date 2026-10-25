import { useEffect, useRef, useState } from 'react';
import { View, Text, Button, Slider } from '@tarojs/components';
import { Video } from '@tarojs/components';
import Taro, { useDidHide, useDidShow, useRouter } from '@tarojs/taro';
import { commerceApi, coursePath, shopPath, money, useCommerce, type Entry } from '@/services/commerce';
import { usePlayerStore } from '@/stores/player';
import MarkdownView from '@/components/MarkdownView';
import { action, CommercePage, Cover, CustomerService, Feedback, requireCommerceLogin, useData } from '@/features/commerce/common';

export default function LearnCourse() {
  const visible = useRef(true);
  useDidShow(() => { visible.current = true; });
  useEffect(() => usePlayerStore.subscribe(state => {
    if (visible.current && state.isPlaying) state.pause();
  }), []);
  const params = useRouter().params;
  const [lesson, setLesson] = useState(Number(params.lesson));
  const { data: course } = useData<Entry>(`/courses/${Number(params.id)}`, {});
  const { data: play, loading, error, load } = useData<Entry>(`/lessons/${lesson}/play`, {});
  const position = useRef(0);
  const reported = useRef(0);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioPosition, setAudioPosition] = useState(0);
  const audio = useRef<Taro.InnerAudioContext>();
  const save = () => !play.url ? Promise.resolve() : commerceApi(`/lessons/${lesson}/progress`, 'POST', { position: Math.floor(position.current) }).catch(() => {});
  const tick = (time: number) => { position.current = time; if (Math.abs(time - reported.current) >= 10) { reported.current = time; save(); } };
  useEffect(() => {
    usePlayerStore.getState().pause();
    position.current = play.position || 0;
    if (play.url && play.kind === 'audio') {
      const context = Taro.createInnerAudioContext();
      audio.current = context;
      context.src = play.url;
      context.startTime = play.position || 0;
      context.onPlay(() => { usePlayerStore.getState().pause(); setAudioPlaying(true); });
      context.onPause(() => { setAudioPlaying(false); save(); });
      context.onTimeUpdate(() => { tick(context.currentTime); setAudioPosition(context.currentTime); });
      context.onEnded(() => { position.current = play.duration; save(); setAudioPlaying(false); });
      context.onError(() => Taro.showToast({ title: '播放失败，请刷新播放地址后重试', icon: 'none' }));
      return () => { save(); context.destroy(); audio.current = undefined; };
    }
    return () => { save(); };
  }, [play.url]);
  useDidHide(() => { visible.current = false; save(); audio.current?.pause(); if (play.kind === 'video') Taro.createVideoContext('course-video').pause(); });
  return <CommercePage title='课程学习' learning>
    <Feedback loading={loading} error={error} retry={load} /><Text className='commerce__name'>{play.title}</Text>
    {play.url && (play.kind === 'audio' ? <View className='commerce__card commerce__card-body'>
      <Cover src={course.cover} /><Slider min={0} max={play.duration || 1} value={Math.floor(audioPosition)} onChange={e => audio.current?.seek(e.detail.value)} />
      <Button className='commerce__primary' onClick={() => audioPlaying ? audio.current?.pause() : audio.current?.play()}>{audioPlaying ? '暂停' : '播放音频'}</Button>
    </View> : <Video key={play.url} id='course-video' className='commerce__media' src={play.url} initialTime={play.position || 0} controls autoplay={false}
      onPlay={() => usePlayerStore.getState().pause()} onTimeUpdate={e => tick(e.detail.currentTime)} onPause={save}
      onEnded={() => { position.current = play.duration; save(); }} onError={() => Taro.showToast({ title: '播放失败，请刷新播放地址后重试', icon: 'none' })} />)}
    <Text className='commerce__muted'>学习进度自动保存；播放地址过期或网络异常时，可刷新后继续学习。</Text>
    <Button className='commerce__secondary' onClick={load}>刷新播放地址</Button>
    {course.lessons?.map((item: Entry) => <View className={`commerce__chip ${lesson === item.id ? 'commerce__chip--active' : ''}`} key={item.id} onClick={() => {
      if (!course.owned && !item.preview) return Taro.showToast({ title: '该章节需要购买课程', icon: 'none' });
      save(); audio.current?.pause(); if (play.kind === 'video') Taro.createVideoContext('course-video').pause(); setLesson(item.id);
    }}><Text>{item.title}{item.preview ? ' · 免费' : ''}</Text></View>)}
  </CommercePage>;
}
