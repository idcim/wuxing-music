import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { View, Text, Image, Button, Input } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { commerceApi, useCommerce } from '@/services/commerce';
import { useUserStore } from '@/stores/user';
import { resolveUrl } from '@/utils/url';
import { goBack, navBarStyle, navTopStyle } from '@/utils/nav';
import { useSiteStore } from '@/stores/site';
import { THEMES } from '@/theme';
import Icon from '@/components/Icon';
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
  const site = useSiteStore(s => s.site);
  const accent = THEMES[site.theme_id].accent;
  useDidShow(() => { useCommerce.getState().load(); });
  return <View className={`commerce ${tab ? 'commerce--tab' : ''} ${footer ? 'commerce--purchase' : ''} ${learning ? 'commerce--learning' : ''}`}>
    <View className={`commerce__header ${tab ? 'commerce__header--brand' : ''}`} style={tab ? navTopStyle() : navBarStyle()}>
      {tab ? <>
        <View className='commerce__identity'><BrandMark /><View className='commerce__wordmark'><Text className='commerce__brand-name serif'>{site.site_name}</Text><Text className='commerce__brand-caption'>{site.site_slogan}</Text></View></View>
        <Text className='commerce__destination'>{title}</Text>
      </> : <>
        <View className='commerce__back' role='button' aria-label='返回上一页' onClick={() => goBack()}><Icon name='chevronLeft' size={40} color={accent} /></View>
        <Text className='commerce__title'>{title}</Text><View className='commerce__nav-spacer' />
      </>}
    </View>
    <View className='commerce__content'>{children}</View>
    <View className='commerce__signature'><Text className='commerce__signature-name serif'>{site.site_name}</Text><Text>{site.site_slogan}</Text></View>
    {!learning && <MiniPlayer />}{tab && <TabBar active={tab} />}
    {footer && <View className='commerce__fixed'>{footer}</View>}
    {config.customer_service && <Text className='commerce__contact'>咨询与售后：{config.customer_service}</Text>}
  </View>;
}

export function Cover({ src, title = '', large = false }: { src?: string; title?: string; large?: boolean }) {
  return src ? <Image className={`commerce__cover ${large ? 'commerce__cover--large' : ''}`} src={resolveUrl(src)} mode='aspectFill' />
    : <View className={`commerce__cover commerce__placeholder ${large ? 'commerce__cover--large' : ''}`}><Text className='commerce__placeholder-mark serif'>雅</Text><Text>{title || '静候美好'}</Text></View>;
}

export function BrandMark() {
  const site = useSiteStore(s => s.site);
  return <View className='commerce__brand-mark'>
    {site.logo_url ? <Image src={resolveUrl(site.logo_url)} mode='aspectFit' className='commerce__brand-image' /> : <Text className='serif'>{site.site_name?.slice(0, 1)}</Text>}
  </View>;
}

export function Section({ title, eyebrow, children, className = '' }: { title?: string; eyebrow?: string; children: ReactNode; className?: string }) {
  return <View className={`commerce__section ${className}`}>
    {eyebrow && <Text className='commerce__eyebrow'>{eyebrow}</Text>}
    {title && <Text className='commerce__section-title serif'>{title}</Text>}{children}
  </View>;
}

export function SectionHeading({ title, caption, actionLabel, onAction }: { title: string; caption?: string; actionLabel?: string; onAction?: () => void }) {
  return <View className='commerce__section-heading'><View><Text className='commerce__section-title serif'>{title}</Text>{caption && <Text className='commerce__caption'>{caption}</Text>}</View>
    {actionLabel && <Button className='commerce__text-button' onClick={onAction}>{actionLabel} ›</Button>}
  </View>;
}

export function EmptyState({ title, description, actionLabel, onAction }: { title: string; description?: string; actionLabel?: string; onAction?: () => void }) {
  return <View className='commerce__empty-state'><View className='commerce__empty-symbol serif'>静</View><Text className='commerce__empty-title serif'>{title}</Text>{description && <Text className='commerce__caption'>{description}</Text>}
    {actionLabel && <Button className='commerce__secondary' onClick={onAction}>{actionLabel}</Button>}
  </View>;
}

export function QuantityStepper({ value, max = 99, onChange, disabled = false }: { value: number; max?: number; onChange: (value: number) => void; disabled?: boolean }) {
  const limit = Math.max(1, Math.min(99, max));
  const update = (next: number) => { if (!disabled) onChange(Math.max(1, Math.min(limit, Math.floor(next) || 1))); };
  return <View className='commerce__stepper'>
    <Button disabled={disabled || value <= 1} aria-label='减少数量' onClick={() => update(value - 1)}>−</Button>
    <Input type='number' aria-label='购买数量' value={String(value)} disabled={disabled} onInput={e => update(Number(e.detail.value))} />
    <Button disabled={disabled || value >= limit} aria-label='增加数量' onClick={() => update(value + 1)}>＋</Button>
  </View>;
}

export function Feedback({ loading, error, retry }: { loading: boolean; error: string; retry: () => void }) {
  return loading ? <View className='commerce__loading'><View className='commerce__loading-dot' /><Text>正在为你准备…</Text></View> : error ? <EmptyState title='暂时未能加载' description={error} actionLabel='重新加载' onAction={retry} /> : null;
}

export function CustomerService() {
  return <Button className='commerce__secondary commerce__service' aria-label='咨询客服' openType='contact'>客服</Button>;
}
