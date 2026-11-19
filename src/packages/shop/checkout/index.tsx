import { withTheme } from '@/theme/withTheme';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Button } from '@tarojs/components';
import Taro, { useDidHide, useDidShow, useRouter } from '@tarojs/taro';
import { commerceApi, shopPath, money, type Entry } from '@/services/commerce';
import { payCommerceOrder } from '@/services/commerce-payment';
import { action, CommercePage, EmptyState, Feedback, Section } from '@/features/commerce/common';
import '@/features/commerce/transactions.scss';

function Checkout() {
  const params = useRouter().params;
  const kind = params.kind === 'course' ? 'course' : 'physical';
  const [addresses, setAddresses] = useState<Entry[]>([]);
  const [addressId, setAddressId] = useState<number>();
  const [items, setItems] = useState<Entry[]>([]);
  const [quoted, setQuoted] = useState<{ body: string; revision: number; value: Entry }>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [revision, setRevision] = useState(0);
  const [preparing, setPreparing] = useState(true);
  const [inputsReady, setInputsReady] = useState(false);
  const [quoting, setQuoting] = useState(false);
  const inputRequest = useRef(0);
  const preparingRef = useRef(true);
  const submitting = useRef(false);
  const latestQuote = useRef<Entry>();
  const key = useRef(`checkout_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  const reload = useCallback(async () => {
    const request = ++inputRequest.current;
    preparingRef.current = true; latestQuote.current = undefined;
    setPreparing(true); setInputsReady(false); setQuoted(undefined); setAgreed(false); setError('');
    try {
      if (kind === 'physical') {
        const values = await commerceApi<Entry[]>('/addresses');
        let nextItems: Entry[];
        if (params.cart) {
          const cart = await commerceApi<Entry[]>('/cart');
          const ids = params.cart.split(',').map(Number);
          nextItems = cart.filter(i => ids.includes(i.id)).map(i => ({ sku_id: i.sku_id, quantity: i.quantity, cart_id: i.id }));
          // 不能将已移除的勾选商品静默变成部分结算。
          if (nextItems.length !== new Set(ids).size) throw new Error('购物车商品已变化，请返回购物车重新选择');
        } else nextItems = [{ sku_id: Number(params.sku), quantity: Number(params.quantity) || 1 }];
        if (request !== inputRequest.current) return;
        setAddresses(values);
        setAddressId(current => values.some(a => a.id === current) ? current : values[0]?.id);
        setItems(nextItems);
      }
      if (request !== inputRequest.current) return;
      setInputsReady(true);
      // 地址可以原地修改省份，ID 与购买条目不变时也必须重新报价。
      setRevision(value => value + 1);
    } catch (e: any) {
      if (request === inputRequest.current) setError(e.message || '订单信息加载失败，请重试');
    } finally {
      if (request === inputRequest.current) { preparingRef.current = false; setPreparing(false); }
    }
  }, [kind, params.cart, params.sku, params.quantity]);
  useDidShow(() => { void reload(); });
  useDidHide(() => { inputRequest.current++; preparingRef.current = true; latestQuote.current = undefined; setPreparing(true); setQuoted(undefined); setAgreed(false); });
  useEffect(() => () => { inputRequest.current++; }, []);
  const body = JSON.stringify({ kind, course_id: kind === 'course' ? Number(params.course) : null,
    address_id: addressId || null, items: items.map(({ sku_id, quantity }) => ({ sku_id, quantity })) });
  useEffect(() => {
    let active = true;
    latestQuote.current = undefined;
    setQuoted(undefined); setAgreed(false); setQuoting(false);
    key.current = `checkout_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    if (preparing || !inputsReady || (kind === 'physical' && (!addressId || !items.length))) return;
    setQuoting(true); setError('');
    commerceApi('/checkout', 'POST', JSON.parse(body)).then(data => { if (active) { latestQuote.current = data; setQuoted({ body, revision, value: data }); setError(''); } })
      .catch(e => { if (active) setError(e.message || '价格与运费获取失败，请重试'); })
      .finally(() => { if (active) setQuoting(false); });
    return () => { active = false; };
  }, [body, revision, preparing, inputsReady]);
  const quote = !preparing && quoted?.body === body && quoted.revision === revision ? quoted.value : undefined;
  const submit = async () => {
    if (!quote || quote !== latestQuote.current || !agreed || preparingRef.current || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    try { await action(async () => {
      const order = await commerceApi('/orders', 'POST', { ...JSON.parse(body), request_key: key.current, quoted_fen: quote.amount_fen });
      for (const item of items) if (item.cart_id) await commerceApi(`/cart/${item.cart_id}`, 'DELETE').catch(() => {});
      await action(() => payCommerceOrder(order.id, kind));
      Taro.redirectTo({ url: `${shopPath}/order/index?id=${order.id}` });
    }); } finally { submitting.current = false; setBusy(false); }
  };
  return <CommercePage title='确认订单' footer={quote && <>
    <View className='commerce-tx__footer-total'><Text className='commerce__muted'>应付合计</Text><Text className='commerce__price'>{money(quote.amount_fen)}</Text></View>
    <Button className='commerce__primary' loading={busy} disabled={!agreed || busy} onClick={submit}>确认并支付</Button>
  </>}>
    <View className='commerce-tx__steps'><Text className='commerce-tx__step commerce-tx__step--active'>01 确认订单</Text><Text className='commerce-tx__step'>02 完成支付</Text><Text className='commerce-tx__step'>03 {kind === 'course' ? '开始学习' : '等待收货'}</Text></View>
    {kind === 'physical' && <Section title='送到这里' eyebrow='DELIVERY'>
      {!preparing && !addresses.length && <EmptyState title='添加一个收货地址' description='填写收货信息后，才能确认配送范围和运费。' />}
      {addresses.map(a => <View key={a.id} className={`commerce-tx__address-option ${addressId === a.id ? 'commerce-tx__address-option--active' : ''}`} onClick={() => { if (!busy && !preparing) setAddressId(a.id); }}><View className='commerce-tx__between'><Text className='commerce__name'>{a.name}</Text><Text>{a.phone}</Text></View><Text className='commerce__muted'>{a.province}{a.city}{a.district}{a.detail}</Text><Text className='commerce-tx__address-selected'>{addressId === a.id ? '✓ 配送至此地址' : '选择此地址'}</Text></View>)}
      <Button className='commerce__secondary' disabled={busy || preparing} onClick={() => Taro.navigateTo({ url: `${shopPath}/addresses/index` })}>{addresses.length ? '管理收货地址' : '新增收货地址'}</Button></Section>}
    <Feedback loading={preparing || quoting} error={error} retry={reload} />
    {quote && <><Section title={kind === 'course' ? '本次学习' : '本次好物'} eyebrow='YOUR SELECTION'>
      {quote.items.map((item: Entry) => <View className='commerce-tx__line-item' key={item.entity_id}><View className='commerce-tx__between'><Text className='commerce__name'>{item.title}</Text><Text className='commerce-tx__amount'>{money(item.price_fen * item.quantity)}</Text></View><Text className='commerce__muted'>{item.spec} × {item.quantity}</Text>{kind === 'course' && <Text className='commerce-tx__notice'>{item.access_days ? `购买后可学习 ${item.access_days} 天` : '长期有效'}；课程权益与音乐会员独立。</Text>}</View>)}
    </Section><Section title='费用明细' eyebrow='ORDER SUMMARY'>
      <View className='commerce-tx__detail-row'><Text className='commerce__muted'>商品金额</Text><Text>{money(quote.amount_fen - quote.shipping_fen)}</Text></View><View className='commerce-tx__detail-row'><Text className='commerce__muted'>运费</Text><Text>{money(quote.shipping_fen)}</Text></View><View className='commerce-tx__detail-row commerce-tx__detail-row--total'><Text>应付合计</Text><Text className='commerce__price'>{money(quote.amount_fen)}</Text></View>
      <Button className='commerce-tx__text-button' disabled={busy || preparing || quoting} onClick={reload}>重新获取价格与运费 ↻</Button>
    </Section><View className='commerce-tx__notice'><Text>订单保留 30 分钟，实际权益与发货以服务端确认支付为准。</Text></View>
      <Button className={`commerce-tx__agreement ${agreed ? 'commerce-tx__agreement--active' : ''}`} aria-label='确认购买说明' aria-pressed={agreed} onClick={() => setAgreed(!agreed)}><Text className='commerce-tx__agreement-check'>{agreed ? '✓' : '○'}</Text><Text>我已阅读商品/课程详情中的购买、学习/配送及售后说明</Text></Button></>}
    {!quote && !preparing && !quoting && <Button className='commerce__secondary' disabled={busy} onClick={reload}>重新获取价格与运费</Button>}
  </CommercePage>;
}

export default withTheme(Checkout);
