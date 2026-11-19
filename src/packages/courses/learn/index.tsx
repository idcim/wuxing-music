import { withTheme } from '@/theme/withTheme';
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { View, Text, Button, Slider, Video } from '@tarojs/components';
import Taro, { useDidHide, useDidShow, useRouter } from '@tarojs/taro';
import { commerceApi, type Entry } from '@/services/commerce';
import { createLessonProgress, waitForLessonProgress } from '@/services/lesson-progress';
import { usePlayerStore } from '@/stores/player';
import { useUserStore } from '@/stores/user';
import { action, CommercePage, Cover, Feedback, Section, useData } from '@/features/commerce/common';
import '@/features/commerce/catalog.scss';

type PlaybackControl = { pause: () => void; save: () => Promise<void> };
type ControlRef = MutableRefObject<PlaybackControl | undefined>;

function CourseMedia({ lesson, play, cover, control, resume, onPlaybackError, onPlaybackStarted }: { lesson: number; play: Entry; cover: string; control: ControlRef; resume: boolean; onPlaybackError: () => void; onPlaybackStarted: () => void }) {
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
      context.onPlay(() => { if (progress.active) { usePlayerStore.getState().pause(); setAudioPlaying(true); onPlaybackStarted(); } });
      context.onPause(() => { if (progress.active) { setAudioPlaying(false); void save().catch(() => {}); } });
      context.onTimeUpdate(() => {
        if (!progress.active) return;
        progress.update(context.currentTime); setAudioPosition(progress.position);
      });
      context.onEnded(() => {
        if (!progress.active) return;
        progress.update(play.duration); void save().catch(() => {}); setAudioPlaying(false);
      });
      context.onError(() => { if (progress.active) onPlaybackError(); });
      if (resume) context.play();
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
    </View> : <Video id={videoId} className='commerce__media' src={play.url} initialTime={play.position || 0} controls autoplay={resume}
      onPlay={() => { if (progress.active) { usePlayerStore.getState().pause(); onPlaybackStarted(); } }} onTimeUpdate={e => progress.update(e.detail.currentTime)}
      onPause={() => { if (progress.active) void save().catch(() => {}); }}
      onEnded={() => { if (progress.active) { progress.update(play.duration); void save().catch(() => {}); } }} onError={() => { if (progress.active) onPlaybackError(); }} />}
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
  const [resumeAfterError, setResumeAfterError] = useState(false);
  const refreshInFlight = useRef(false);
  const autoRefreshUsed = useRef(false);
  const refresh = async (resume = false) => {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    setResumeAfterError(resume);
    setRefreshing(true);
    try {
      control.current?.pause();
      await control.current?.save();
      await load();
    } finally { refreshInFlight.current = false; setRefreshing(false); }
  };
  const onPlaybackError = () => {
    if (refreshInFlight.current) return;
    if (autoRefreshUsed.current) { setResumeAfterError(false); playbackError(); return; }
    autoRefreshUsed.current = true;
    void Taro.showToast({ title: '播放中断，正在重新连接', icon: 'none' });
    void action(() => refresh(true));
  };
  return <>
    <Feedback loading={loading} error={error} retry={() => action(() => refresh())} />
    <View className='course-learning__heading'><Text className='commerce__eyebrow'>YOUR LEARNING MOMENT</Text><Text className='course-learning__title serif'>{play.title}</Text></View>
    {play.url && <CourseMedia key={play.url} lesson={lesson} play={play} cover={cover} control={control} resume={resumeAfterError} onPlaybackError={onPlaybackError} onPlaybackStarted={() => setResumeAfterError(false)} />}
    <Section><Text className='commerce__caption'>{owner ? '学习进度自动保存，下次从这里继续。' : '当前为游客试听，登录后可保存学习进度。'}</Text><Text className='commerce__caption'>播放中断会尝试重新连接，仍失败时可手动刷新。</Text>
      <Button className='commerce__text-button' loading={refreshing} disabled={refreshing} onClick={() => action(() => refresh())}>重新连接播放</Button>
    </Section>
  </>;
}

function LearnCourse() {
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
    <Section title={course.title || '课程目录'} eyebrow='CONTINUE LEARNING'>
    {course.lessons?.map((item: Entry, index: number) => <View className={`course-lesson ${lesson === item.id ? 'course-lesson--active' : ''}`} key={item.id} onClick={() => {
      if (!course.owned && !item.preview) return Taro.showToast({ title: '该章节需要购买课程', icon: 'none' });
      control.current?.pause(); setLesson(item.id);
    }}><Text className='course-lesson__number cormorant'>{String(index + 1).padStart(2, '0')}</Text><View className='course-lesson__body'><Text className='course-lesson__title'>{item.title}</Text><Text className='course-lesson__meta'>{lesson === item.id ? '正在学习' : item.progress?.completed ? '已学完' : item.preview ? '免费试看 / 试听' : course.owned ? '已解锁' : '购买后学习'}</Text></View><Text className='course-lesson__state'>{lesson === item.id ? '学习中' : '›'}</Text></View>)}
    </Section>
  </CommercePage>;
}

export default withTheme(LearnCourse);
