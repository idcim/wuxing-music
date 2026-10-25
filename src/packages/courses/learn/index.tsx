import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { View, Text, Button, Slider, Video } from '@tarojs/components';
import Taro, { useDidHide, useDidShow, useRouter } from '@tarojs/taro';
import { commerceApi, type Entry } from '@/services/commerce';
import { createLessonProgress, waitForLessonProgress } from '@/services/lesson-progress';
import { usePlayerStore } from '@/stores/player';
import { useUserStore } from '@/stores/user';
import { action, CommercePage, Cover, Feedback, useData } from '@/features/commerce/common';

type PlaybackControl = { pause: () => void; save: () => Promise<void> };
type ControlRef = MutableRefObject<PlaybackControl | undefined>;

function CourseMedia({ lesson, play, cover, control }: { lesson: number; play: Entry; cover: string; control: ControlRef }) {
  const owner = useUserStore(state => state.user?.id);
  const [saveFailed, setSaveFailed] = useState(false);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioPosition, setAudioPosition] = useState(play.position || 0);
  const audio = useRef<Taro.InnerAudioContext>();
  const videoId = `course-video-${lesson}`;
  const progress = useMemo(() => createLessonProgress({
    owner: owner || '', lesson, position: play.position, duration: play.duration,
    currentOwner: () => useUserStore.getState().user?.id,
    send: async (id, position) => { await commerceApi(`/lessons/${id}/progress`, 'POST', { position }); setSaveFailed(false); },
    onError: () => setSaveFailed(true),
  }), [owner, lesson, play.url]);
  const save = () => progress.save();
  const pause = () => {
    if (play.kind === 'audio') audio.current?.pause();
    else Taro.createVideoContext(videoId).pause();
  };
  useEffect(() => {
    usePlayerStore.getState().pause();
    const controls = { pause, save };
    control.current = controls;
    if (play.kind === 'audio') {
      const context = Taro.createInnerAudioContext();
      audio.current = context;
      context.src = play.url;
      context.startTime = play.position || 0;
      context.onPlay(() => { if (progress.active) { usePlayerStore.getState().pause(); setAudioPlaying(true); } });
      context.onPause(() => { if (progress.active) { setAudioPlaying(false); void save().catch(() => {}); } });
      context.onTimeUpdate(() => {
        if (!progress.active) return;
        progress.update(context.currentTime); setAudioPosition(progress.position);
      });
      context.onEnded(() => {
        if (!progress.active) return;
        progress.update(play.duration); void save().catch(() => {}); setAudioPlaying(false);
      });
      context.onError(() => { if (progress.active) playbackError(); });
    }
    return () => {
      // 先关闭会话，再销毁播放器，迟到事件不能改变最后保存的位置。
      void progress.close().catch(() => {});
      if (control.current === controls) control.current = undefined;
      if (audio.current) { audio.current.destroy(); audio.current = undefined; }
      else Taro.createVideoContext(videoId).pause();
    };
  }, [progress]);
  return <>
    {play.kind === 'audio' ? <View className='commerce__card commerce__card-body'>
      <Cover src={cover} /><Slider min={0} max={play.duration || 1} value={Math.floor(audioPosition)} onChange={e => {
        audio.current?.seek(e.detail.value); progress.update(e.detail.value); setAudioPosition(e.detail.value);
      }} />
      <Button className='commerce__primary' onClick={() => audioPlaying ? audio.current?.pause() : audio.current?.play()}>{audioPlaying ? '暂停' : '播放音频'}</Button>
    </View> : <Video id={videoId} className='commerce__media' src={play.url} initialTime={play.position || 0} controls autoplay={false}
      onPlay={() => { if (progress.active) usePlayerStore.getState().pause(); }} onTimeUpdate={e => progress.update(e.detail.currentTime)}
      onPause={() => { if (progress.active) void save().catch(() => {}); }}
      onEnded={() => { if (progress.active) { progress.update(play.duration); void save().catch(() => {}); } }} onError={playbackError} />}
    {saveFailed && <Text className='commerce__muted'>学习进度暂未保存，请联网后重试。</Text>}
    {saveFailed && <Button className='commerce__secondary' onClick={() => action(save)}>重试保存进度</Button>}
  </>;
}

function playbackError() { void Taro.showToast({ title: '播放失败，请刷新播放地址后重试', icon: 'none' }); }

function LessonPlayer({ lesson, cover, control }: { lesson: number; cover: string; control: ControlRef }) {
  const owner = useUserStore(state => state.user?.id);
  const fetchPlayback = useCallback(async (path: string) => {
    await waitForLessonProgress(owner || '', lesson);
    return commerceApi<Entry>(path);
  }, [owner, lesson]);
  const { data: play, loading, error, load } = useData<Entry>(`/lessons/${lesson}/play`, {}, fetchPlayback);
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      control.current?.pause();
      await control.current?.save();
      await load();
    } finally { setRefreshing(false); }
  };
  return <>
    <Feedback loading={loading} error={error} retry={() => action(refresh)} /><Text className='commerce__name'>{play.title}</Text>
    {play.url && <CourseMedia key={play.url} lesson={lesson} play={play} cover={cover} control={control} />}
    <Text className='commerce__muted'>学习进度自动保存；播放地址过期或网络异常时，可刷新后继续学习。</Text>
    <Button className='commerce__secondary' loading={refreshing} disabled={refreshing} onClick={() => action(refresh)}>刷新播放地址</Button>
  </>;
}

export default function LearnCourse() {
  const visible = useRef(true);
  const control = useRef<PlaybackControl>();
  useDidShow(() => { visible.current = true; });
  useDidHide(() => { visible.current = false; control.current?.pause(); void control.current?.save().catch(() => {}); });
  useEffect(() => usePlayerStore.subscribe(state => { if (visible.current && state.isPlaying) state.pause(); }), []);
  const params = useRouter().params;
  const owner = useUserStore(state => state.user?.id);
  const [lesson, setLesson] = useState(Number(params.lesson));
  const { data: course } = useData<Entry>(`/courses/${Number(params.id)}`, {});
  return <CommercePage title='课程学习' learning>
    {Number.isSafeInteger(lesson) && lesson > 0 ? <LessonPlayer key={`${owner}:${lesson}`} lesson={lesson} cover={course.cover} control={control} /> : <Text>请选择学习章节</Text>}
    {course.lessons?.map((item: Entry) => <View className={`commerce__chip ${lesson === item.id ? 'commerce__chip--active' : ''}`} key={item.id} onClick={() => {
      if (!course.owned && !item.preview) return Taro.showToast({ title: '该章节需要购买课程', icon: 'none' });
      control.current?.pause(); setLesson(item.id);
    }}><Text>{item.title}{item.preview ? ' · 免费' : ''}</Text></View>)}
  </CommercePage>;
}
