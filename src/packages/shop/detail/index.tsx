import { useState } from 'react';
import { View, Text, Button, Input, Swiper, SwiperItem, Image } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import { commerceApi, shopPath, money, useCommerce, type Entry } from '@/services/commerce';
import { resolveUrl } from '@/utils/url';
import MarkdownView from '@/components/MarkdownView';
import { action, CommercePage, Cover, CustomerService, Feedback, requireCommerceLogin, useData } from '@/features/commerce/common';

export default function ProductDetail() {
  const id = Number(useRouter().params.id);
  const { data: product, loading, error, load } = useData<Entry>(`/products/${id}`, {});
  const [selected, setSelected] = useState<number>();
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const sku = product.skus?.find((s: Entry) => s.id === selected) || product.skus?.[0];
  const buy = async (cart: boolean) => {
    if (!requireCommerceLogin() || busy) return;
    if (!sku || quantity < 1 || quantity > sku.available) return Taro.showToast({ title: '请选择有库存的规格和数量', icon: 'none' });
    setBusy(true);
    await action(async () => {
      if (cart) {
        const existing = await commerceApi<Entry[]>('/cart');
        const count = existing.find(i => i.sku_id === sku.id)?.quantity || 0;
        await commerceApi('/cart', 'POST', { sku_id: sku.id, quantity: Math.min(99, count + quantity) });
        Taro.showToast({ title: '已加入购物车', icon: 'success' });
      } else Taro.navigateTo({ url: `${shopPath}/checkout/index?kind=physical&sku=${sku.id}&quantity=${quantity}` });
    });
    setBusy(false);
  };
  return <CommercePage title='商品详情' footer={product.id && <><CustomerService /><Button className='commerce__secondary' disabled={busy} onClick={() => buy(true)}>加入购物车</Button><Button className='commerce__primary' loading={busy} onClick={() => buy(false)}>立即购买</Button></>}><Feedback loading={loading} error={error} retry={load} />
    {product.id && <>
      {product.images?.length ? <Swiper className='commerce__cover commerce__cover--large' indicatorDots>{product.images.map((src: string) => <SwiperItem key={src}><Image src={resolveUrl(src)} className='commerce__cover commerce__cover--large' mode='aspectFill' /></SwiperItem>)}</Swiper> : <Cover src={product.cover} large />}
      <Text className='commerce__name'>{product.title}</Text><Text className='commerce__muted'>{product.subtitle}</Text><Text className='commerce__price'>{money(sku?.price_fen || product.price_fen)}</Text>
      <Text className='commerce__name'>选择规格</Text><View className='commerce__chips'>{product.skus?.map((s: Entry) => <Text className={`commerce__chip ${sku?.id === s.id ? 'commerce__chip--active' : ''}`} key={s.id} onClick={() => { setSelected(s.id); setQuantity(1); }}>{s.name}{s.available ? '' : ' · 售罄'}</Text>)}</View>
      <View className='commerce__field'><Text className='commerce__label'>数量（剩余 {sku?.available || 0}）</Text><Input type='number' value={String(quantity)} onInput={e => setQuantity(Math.max(1, Math.min(99, Number(e.detail.value) || 1)))} /></View>
      <Text className='commerce__name'>商品介绍</Text><MarkdownView source={product.intro || ''} />
      <Text className='commerce__name'>发货说明</Text><MarkdownView source={product.shipping_note || '具体配送区域与运费在结算时确认。'} />
      <Text className='commerce__name'>售后说明</Text><MarkdownView source={product.aftersale_note || product.policy || '如有疑问，请先咨询客服。'} />
      <Button className='commerce__secondary' onClick={() => requireCommerceLogin() && Taro.navigateTo({ url: `${shopPath}/cart/index` })}>查看购物车</Button>
    </>}
  </CommercePage>;
}
