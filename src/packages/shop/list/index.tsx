import { useState } from 'react';
import { View, Text, Button, Input, Swiper, SwiperItem, Image } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import { commerceApi, shopPath, money, useCommerce, type Entry } from '@/services/commerce';
import { resolveUrl } from '@/utils/url';
import MarkdownView from '@/components/MarkdownView';
import { action, CommercePage, Cover, CustomerService, Feedback, requireCommerceLogin, useData } from '@/features/commerce/common';

export default function ShopList() {
  const [category, setCategory] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const { data, loading, error, load } = useData<Entry>(`/catalog/physical?page=${page}&category=${category || ''}`, { items: [], categories: [], total: 0 });
  const cfg = useCommerce(s => s.config);
  return <CommercePage title='商城' tab='shop'>
    <View className='commerce__hero' onClick={() => cfg.shop_banner_product_id && Taro.navigateTo({ url: `${shopPath}/detail/index?id=${cfg.shop_banner_product_id}` })}>
      <Cover src={cfg.shop_banner} title='一杯茶，一段静好的日常' large />
      <View className='commerce__card-body'><Text className='commerce__name'>东方生活 · 日用之美</Text><Text className='commerce__muted'>咖啡、五行茶与生活雅物。让音乐之外的时光，也从容一些。</Text></View>
    </View>
    <View className='commerce__actions'><Button className='commerce__secondary' onClick={() => requireCommerceLogin() && Taro.navigateTo({ url: `${shopPath}/cart/index` })}>购物车</Button>
      <Button className='commerce__secondary' onClick={() => requireCommerceLogin() && Taro.navigateTo({ url: `${shopPath}/orders/index?kind=physical` })}>我的订单</Button></View>
    {data.categories.length > 1 && <View className='commerce__chips'>{[{ id: null, name: '全部' }, ...data.categories].map((c: Entry) => <Text key={c.id || 'all'} className={`commerce__chip ${category === c.id ? 'commerce__chip--active' : ''}`} onClick={() => { setCategory(c.id); setPage(1); }}>{c.name}</Text>)}</View>}
    {cfg.shop_visible === false ? <Text className='commerce__empty'>商城正在准备中，敬请期待</Text> : <>
      <Feedback loading={loading} error={error} retry={load} />
      {!loading && !error && !data.items.length && <Text className='commerce__empty'>好物筹备中</Text>}
      <View className='commerce__grid'>{data.items.map((product: Entry) => <View className='commerce__card' key={product.id} onClick={() => Taro.navigateTo({ url: `${shopPath}/detail/index?id=${product.id}` })}>
        <Cover src={product.cover} /><View className='commerce__card-body'><Text className='commerce__name'>{product.title}</Text><Text className='commerce__muted'>{product.subtitle}</Text><Text className='commerce__price'>{money(product.price_fen)} 起</Text></View>
      </View>)}</View>
      {data.total > 20 && <View className='commerce__actions'><Button disabled={page === 1} onClick={() => setPage(page - 1)}>上一页</Button><Text>第 {page} 页</Text><Button disabled={page * 20 >= data.total} onClick={() => setPage(page + 1)}>下一页</Button></View>}
    </>}
  </CommercePage>;
}
