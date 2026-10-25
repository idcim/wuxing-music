import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { View, Text, Image, Button } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { commerceApi, useCommerce } from '@/services/commerce';
import { useUserStore } from '@/stores/user';
import { resolveUrl } from '@/utils/url';
import { goBack, navTopStyle } from '@/utils/nav';
import TabBar from '@/components/TabBar';
import MiniPlayer from '@/components/MiniPlayer';
import './commerce.scss';

export function useData<T>(path: string, initial: T, fetcher?: (path: string) => Promise<T>) {
  const [data, setData] = useState<T>(initial);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const request = useRef(0);
  const load = useCallback(async () => {
    const current = ++request.current;
    setLoading(true);
    try { const value = await (fetcher ? fetcher(path) : commerceApi<T>(path)); if (current === request.current) { setData(value); setError(''); } }
    catch (e: any) { if (current === request.current) setError(e.message || '加载失败'); }
    finally { if (current === request.current) setLoading(false); }
  }, [path, fetcher]);
  const shown = useRef(false);
  useDidShow(() => { if (shown.current) load(); else shown.current = true; });
  useEffect(() => { setData(initial); load(); return () => { request.current++; }; }, [load]);
  return { data, setData, error, loading, load };
}

export async function action(work: () => Promise<unknown>) {
  try { await work(); } catch (e: any) {
    const message = String(e?.message || e?.errMsg || '操作失败，请重试');
    if (!message.includes('cancel')) Taro.showToast({ title: message, icon: 'none', duration: 3000 });
  }
}

export function requireCommerceLogin() {
  if (useUserStore.getState().user) return true;
  Taro.navigateTo({ url: '/pages/login/index' });
  return false;
}

export function CommercePage({ title, children, tab, learning = false, footer }: { title: string; children: ReactNode; tab?: 'course' | 'shop'; learning?: boolean; footer?: ReactNode }) {
  const config = useCommerce(s => s.config);
  useDidShow(() => { useCommerce.getState().load(); });
  return <View className={`commerce ${tab ? 'commerce--tab' : ''} ${footer ? 'commerce--purchase' : ''}`}>
    <View className='commerce__header' style={navTopStyle()}>
      {!tab && <Text className='commerce__back' onClick={() => goBack()}>‹ 返回</Text>}<Text className='commerce__title'>{title}</Text>
    </View>
    {children}
    {!learning && <MiniPlayer />}{tab && <TabBar active={tab} />}
    {footer && <View className='commerce__fixed'>{footer}</View>}
    {config.customer_service && <Text className='commerce__contact'>咨询与售后：{config.customer_service}</Text>}
  </View>;
}

export function Cover({ src, title = '', large = false }: { src?: string; title?: string; large?: boolean }) {
  return src ? <Image className={`commerce__cover ${large ? 'commerce__cover--large' : ''}`} src={resolveUrl(src)} mode='aspectFill' />
    : <View className={`commerce__cover commerce__placeholder ${large ? 'commerce__cover--large' : ''}`}><Text>{title || '待更新封面'}</Text></View>;
}

export function Feedback({ loading, error, retry }: { loading: boolean; error: string; retry: () => void }) {
  return loading ? <Text className='commerce__empty'>正在加载…</Text> : error ? <View className='commerce__empty'><Text>{error}</Text><Button onClick={retry}>重新加载</Button></View> : null;
}

export function CustomerService() {
  return <Button className='commerce__secondary' openType='contact'>咨询客服</Button>;
}
