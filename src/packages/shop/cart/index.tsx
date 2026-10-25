import { useState } from 'react';
import { View, Text, Button, Input, Swiper, SwiperItem, Image } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import { commerceApi, shopPath, money, useCommerce, type Entry } from '@/services/commerce';
import { resolveUrl } from '@/utils/url';
import MarkdownView from '@/components/MarkdownView';
import { action, CommercePage, Cover, CustomerService, Feedback, requireCommerceLogin, useData } from '@/features/commerce/common';

export default function Cart() {
  const { data, loading, error, load } = useData<Entry[]>('/cart', []);
  const [selected, setSelected] = useState<number[]>([]);
  const choose = (id: number) => setSelected(list => list.includes(id) ? list.filter(i => i !== id) : [...list, id]);
  const total = data.filter(i => selected.includes(i.id)).reduce((n, i) => n + (i.sku?.price_fen || 0) * i.quantity, 0);
  const change = (item: Entry, qty: number) => action(async () => { await commerceApi('/cart', 'POST', { sku_id: item.sku_id, quantity: Math.max(1, Math.min(99, qty)) }); await load(); });
  return <CommercePage title='购物车'><Feedback loading={loading} error={error} retry={load} />
    {!loading && !error && !data.length && <Text className='commerce__empty'>购物车还是空的</Text>}
    {data.map(item => <View className='commerce__card commerce__card-body' key={item.id}>
      <Text className='commerce__name' onClick={() => choose(item.id)}>{selected.includes(item.id) ? '☑' : '□'} {item.product?.title || '商品已失效'}</Text>
      <Text className='commerce__muted'>{item.sku?.name} · {money(item.sku?.price_fen || 0)} · 可用库存 {item.sku?.available || 0}</Text>
      <View className='commerce__row'><Button onClick={() => change(item, item.quantity - 1)}>−</Button><Text>{item.quantity}</Text><Button onClick={() => change(item, item.quantity + 1)}>＋</Button>
        <Button onClick={() => action(async () => { await commerceApi(`/cart/${item.id}`, 'DELETE'); setSelected(selected.filter(i => i !== item.id)); await load(); })}>移除</Button></View>
    </View>)}
    <Text className='commerce__price'>商品合计 {money(total)}（运费结算时确认）</Text>
    <Button className='commerce__primary' disabled={!selected.length} onClick={() => Taro.navigateTo({ url: `${shopPath}/checkout/index?kind=physical&cart=${selected.join(',')}` })}>去结算</Button>
  </CommercePage>;
}
