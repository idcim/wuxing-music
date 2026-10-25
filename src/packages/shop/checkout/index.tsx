import { useEffect, useRef, useState } from 'react';
import { View, Text, Button, Input, Picker } from '@tarojs/components';
import Taro, { useDidShow, useRouter } from '@tarojs/taro';
import { commerceApi, shopPath, money, type Entry } from '@/services/commerce';
import { payCommerceOrder } from '@/services/commerce-payment';
import { action, CommercePage, Feedback, useData } from '@/features/commerce/common';

export default function Checkout() {
  const params = useRouter().params;
  const kind = params.kind === 'course' ? 'course' : 'physical';
  const [addresses, setAddresses] = useState<Entry[]>([]);
  const [addressId, setAddressId] = useState<number>();
  const [items, setItems] = useState<Entry[]>([]);
  const [quote, setQuote] = useState<Entry>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [revision, setRevision] = useState(0);
  const key = useRef(`checkout_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  useDidShow(() => {
    action(async () => {
      if (kind === 'physical') {
        const values = await commerceApi<Entry[]>('/addresses'); setAddresses(values);
        setAddressId(current => values.some(a => a.id === current) ? current : values[0]?.id);
        if (params.cart) {
          const cart = await commerceApi<Entry[]>('/cart');
          const ids = params.cart.split(',').map(Number);
          setItems(cart.filter(i => ids.includes(i.id)).map(i => ({ sku_id: i.sku_id, quantity: i.quantity, cart_id: i.id })));
        } else setItems([{ sku_id: Number(params.sku), quantity: Number(params.quantity) || 1 }]);
      }
    });
  });
  const body = JSON.stringify({ kind, course_id: kind === 'course' ? Number(params.course) : null,
    address_id: addressId || null, items: items.map(({ sku_id, quantity }) => ({ sku_id, quantity })) });
  useEffect(() => {
    let active = true;
    setQuote(undefined); setAgreed(false);
    key.current = `checkout_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    if (kind === 'physical' && (!addressId || !items.length)) return;
    commerceApi('/checkout', 'POST', JSON.parse(body)).then(data => { if (active) { setQuote(data); setError(''); } })
      .catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [body, revision]);
  const submit = async () => {
    if (!quote || !agreed || busy) return;
    setBusy(true);
    await action(async () => {
      const order = await commerceApi('/orders', 'POST', { ...JSON.parse(body), request_key: key.current, quoted_fen: quote.amount_fen });
      for (const item of items) if (item.cart_id) await commerceApi(`/cart/${item.cart_id}`, 'DELETE').catch(() => {});
      await action(() => payCommerceOrder(order.id, kind));
      Taro.redirectTo({ url: `${shopPath}/order/index?id=${order.id}` });
    });
    setBusy(false);
  };
  return <CommercePage title='确认订单'>
    {kind === 'physical' && <View className='commerce__card commerce__card-body'><Text className='commerce__name'>收货地址</Text>
      {addresses.map(a => <View key={a.id} className={`commerce__chip ${addressId === a.id ? 'commerce__chip--active' : ''}`} onClick={() => setAddressId(a.id)}><Text>{a.name} {a.phone}</Text><Text className='commerce__muted'>{a.province}{a.city}{a.district}{a.detail}</Text></View>)}
      <Button onClick={() => Taro.navigateTo({ url: `${shopPath}/addresses/index` })}>管理收货地址</Button></View>}
    {error && <Text className='commerce__empty'>{error}</Text>}
    <Button className='commerce__secondary' disabled={busy} onClick={() => setRevision(value => value + 1)}>重新获取价格与运费</Button>
    {quote?.items.map((item: Entry) => <View className='commerce__card commerce__card-body' key={item.entity_id}><Text className='commerce__name'>{item.title}</Text><Text className='commerce__muted'>{item.spec} × {item.quantity}</Text><Text className='commerce__price'>{money(item.price_fen * item.quantity)}</Text>
      {kind === 'course' && <Text className='commerce__muted'>{item.access_days ? `购买后可学习 ${item.access_days} 天` : '长期有效'}；课程权益与音乐会员独立。</Text>}</View>)}
    {quote && <><Text className='commerce__muted'>运费：{money(quote.shipping_fen)}</Text><Text className='commerce__price'>应付：{money(quote.amount_fen)}</Text>
      <Text className='commerce__muted'>订单保留 30 分钟，实际权益与发货以服务端确认支付为准。</Text>
      <Text className='commerce__chip' onClick={() => setAgreed(!agreed)}>{agreed ? '☑' : '□'} 我已阅读商品/课程详情中的购买、学习/配送及售后说明</Text>
      <Button className='commerce__primary' loading={busy} disabled={!agreed || busy} onClick={submit}>确认并支付 {money(quote.amount_fen)}</Button></>}
  </CommercePage>;
}
