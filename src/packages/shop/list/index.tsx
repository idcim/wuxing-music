import { withTheme } from '@/theme/withTheme';
import { useState } from 'react';
import { View, Text, Button } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { shopPath, money, useCommerce, type Entry } from '@/services/commerce';
import { resolveUrl } from '@/utils/url';
import { CommercePage, Cover, EmptyState, Feedback, SectionHeading, requireCommerceLogin, useData } from '@/features/commerce/common';
import { CatalogHero, QuickEntry } from '@/features/commerce/catalog';
import shopBanner from '@/assets/commerce/shop-banner.jpg';

function ShopList() {
  const [category, setCategory] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const { data, loading, error, load } = useData<Entry>(`/catalog/physical?page=${page}${category === null ? '' : `&category=${category}`}`, { items: [], categories: [], total: 0 });
  const cfg = useCommerce(s => s.config);
  return <CommercePage title='商城' tab='shop'>
    <CatalogHero image={cfg.shop_banner ? resolveUrl(cfg.shop_banner) : shopBanner} eyebrow='OBJECTS FOR A SLOWER LIFE' title='一器一物，皆有余韵' description='一杯茶，一缕香，让日常有自己的节奏。'
      onClick={cfg.shop_banner_product_id ? () => Taro.navigateTo({ url: `${shopPath}/detail/index?id=${cfg.shop_banner_product_id}` }) : undefined} />
    <View className='catalog-quick-row catalog-quick-row--pair'>
      <QuickEntry mark='选' label='购物袋' description='收藏一份心意' onClick={() => requireCommerceLogin() && Taro.navigateTo({ url: `${shopPath}/cart/index` })} />
      <QuickEntry mark='单' label='我的订单' description='查看订单与配送' onClick={() => requireCommerceLogin() && Taro.navigateTo({ url: `${shopPath}/orders/index?kind=physical` })} />
    </View>
    <SectionHeading title='日常雅集' caption='选一件好物，留一刻从容' />
    {data.categories.length > 1 && <View className='commerce__chips'>{[{ id: null, name: '全部好物' }, ...data.categories].map((c: Entry) => <Text key={c.id || 'all'} className={`commerce__chip ${category === c.id ? 'commerce__chip--active' : ''}`} onClick={() => { setCategory(c.id); setPage(1); }}>{c.name}</Text>)}</View>}
    {cfg.shop_visible === false ? <EmptyState title='雅集正在准备' description='新的日常好物，即将相见。' /> : <>
      <Feedback loading={loading} error={error} retry={load} />
      {!loading && !error && !data.items.length && <EmptyState title='好物，慢慢甄选' description='咖啡、五行茶与生活雅物，正在为你准备。' />}
      <View className='commerce__grid'>{data.items.map((product: Entry) => <View className='commerce__card catalog-product' key={product.id} onClick={() => Taro.navigateTo({ url: `${shopPath}/detail/index?id=${product.id}` })}>
        <Cover src={product.cover} title={product.title} /><View className='commerce__card-body'><Text className='commerce__name serif'>{product.title}</Text><Text className='commerce__muted'>{product.subtitle}</Text><Text className='commerce__price'>{product.price_fen ? `${money(product.price_fen)} 起` : '待上新'}</Text>{product.price_fen > 0 && !product.in_stock && <Text className='commerce__caption'>暂时售罄</Text>}</View>
      </View>)}</View>
      {data.total > 20 && <View className='commerce__actions'><Button disabled={page === 1} onClick={() => setPage(page - 1)}>上一页</Button><Text>第 {page} 页</Text><Button disabled={page * 20 >= data.total} onClick={() => setPage(page + 1)}>下一页</Button></View>}
    </>}
  </CommercePage>;
}
export default withTheme(ShopList);
