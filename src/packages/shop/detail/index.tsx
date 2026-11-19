import { withTheme } from '@/theme/withTheme';
import { useState } from 'react';
import { View, Text, Button, Swiper, SwiperItem, Image } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import { commerceApi, shopPath, money, useCommerce, type Entry } from '@/services/commerce';
import { resolveUrl } from '@/utils/url';
import MarkdownView from '@/components/MarkdownView';
import { action, CommercePage, Cover, CustomerService, Feedback, Section, QuantityStepper, requireCommerceLogin, useData } from '@/features/commerce/common';
import '@/features/commerce/catalog.scss';

function ProductDetail() {
  const id = Number(useRouter().params.id);
  const { data: product, loading, error, load } = useData<Entry>(`/products/${id}`, {});
  const shopSaleOpen = useCommerce(s => s.config.shop_sale === true);
  const [selected, setSelected] = useState<number>();
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const sku = product.skus?.find((s: Entry) => s.id === selected)
    || product.skus?.find((s: Entry) => s.price_fen > 0 && s.available > 0)
    || product.skus?.find((s: Entry) => s.price_fen > 0)
    || product.skus?.[0];
  const buy = async (cart: boolean) => {
    if ((!cart && !shopSaleOpen) || !requireCommerceLogin() || busy) return;
    if (!sku || sku.price_fen <= 0 || quantity < 1 || quantity > sku.available) return Taro.showToast({ title: '请选择可售且有库存的规格和数量', icon: 'none' });
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
  return <CommercePage title='商品详情' footer={product.id && <><CustomerService /><Button className='commerce__secondary' disabled={busy || !sku || sku.price_fen <= 0 || !sku.available} onClick={() => buy(true)}>加入购物车</Button><Button className='commerce__primary' loading={busy} disabled={!shopSaleOpen || !sku || sku.price_fen <= 0 || !sku.available} onClick={() => buy(false)}>{!shopSaleOpen ? '暂未开放购买' : !sku?.available || sku.price_fen <= 0 ? '暂时售罄' : '立即购买'}</Button></>}><Feedback loading={loading} error={error} retry={load} />
    {product.id && <>
      {(product.images?.length || product.cover) ? <Swiper className='catalog-detail__gallery' indicatorDots>{(product.images?.length ? product.images : [product.cover]).filter(Boolean).map((src: string, index: number) => <SwiperItem key={`${src}:${index}`}><Image src={resolveUrl(src)} className='catalog-detail__photo' mode='aspectFit' /></SwiperItem>)}</Swiper> : <Cover title={product.title} large />}
      <View className='catalog-detail__intro'><Text className='commerce__eyebrow'>CURATED FOR EVERYDAY</Text><Text className='catalog-detail__title serif'>{product.title}</Text><Text className='commerce__muted'>{product.subtitle}</Text><View className='catalog-detail__price-row'><Text className='commerce__price'>{sku?.price_fen > 0 ? money(sku.price_fen) : '暂无可售规格'}</Text><Text className='catalog-detail__badge'>{sku?.available ? '现有库存' : '暂时售罄'}</Text></View></View>
      <Section title='选一份心意'><Text className='commerce__label'>商品规格</Text><View className='commerce__chips'>{product.skus?.map((s: Entry) => <Text className={`commerce__chip ${sku?.id === s.id ? 'commerce__chip--active' : ''}`} key={s.id} onClick={() => { setSelected(s.id); setQuantity(1); }}>{s.name}{s.price_fen <= 0 ? ' · 暂不可售' : s.available ? '' : ' · 售罄'}</Text>)}</View>
        <View className='catalog-detail__quantity'><View><Text className='commerce__label'>购买数量</Text><Text className='commerce__caption'>可售 {sku?.available || 0} 件</Text></View><QuantityStepper value={quantity} max={sku?.available || 1} disabled={busy || !sku?.available} onChange={setQuantity} /></View>
      </Section>
      <Section title='好物细节' eyebrow='THE DETAILS'><MarkdownView source={product.intro || '商品介绍即将更新。'} /></Section>
      <Section title='配送与发货'><MarkdownView source={product.shipping_note || '具体配送区域与运费在结算时确认。'} /></Section>
      <Section title='售后与服务'><MarkdownView source={product.aftersale_note || product.policy || '如有疑问，请先咨询客服。'} /></Section>
      <Button className='commerce__secondary' onClick={() => requireCommerceLogin() && Taro.navigateTo({ url: `${shopPath}/cart/index` })}>查看购物袋 ›</Button>
    </>}
  </CommercePage>;
}

export default withTheme(ProductDetail);
