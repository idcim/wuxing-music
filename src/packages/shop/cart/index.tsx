import { withTheme } from '@/theme/withTheme';
import { useState } from 'react';
import { View, Text, Button } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { commerceApi, shopPath, money, useCommerce, type Entry } from '@/services/commerce';
import { action, CommercePage, Cover, EmptyState, Feedback, QuantityStepper, Section, useData } from '@/features/commerce/common';
import '@/features/commerce/transactions.scss';

function Cart() {
  const { data, loading, error, load } = useData<Entry[]>('/cart', []);
  const shopSaleOpen = useCommerce(s => s.config.shop_sale === true);
  const [selected, setSelected] = useState<number[]>([]);
  const choose = (id: number) => setSelected(list => list.includes(id) ? list.filter(i => i !== id) : [...list, id]);
  const selectedItems = data.filter(i => selected.includes(i.id));
  const total = selectedItems.reduce((n, i) => n + (i.sku?.price_fen || 0) * i.quantity, 0);
  const change = (item: Entry, qty: number) => action(async () => { await commerceApi('/cart', 'POST', { sku_id: item.sku_id, quantity: Math.max(1, Math.min(99, qty)) }); await load(); });
  return <CommercePage title='购物车' footer={data.length > 0 && <>
    <View className='commerce-tx__footer-total'><Text className='commerce__muted'>已选 {selectedItems.length} 款 · 商品合计</Text><Text className='commerce__price'>{money(total)}</Text></View>
    <Button className='commerce__primary' disabled={!selectedItems.length || !shopSaleOpen} onClick={() => Taro.navigateTo({ url: `${shopPath}/checkout/index?kind=physical&cart=${selectedItems.map(item => item.id).join(',')}` })}>{shopSaleOpen ? '去结算' : '暂未开放结算'}</Button>
  </>}><Feedback loading={loading} error={error} retry={load} />
    {!loading && !error && !data.length && <EmptyState title='为日常留一份好物' description='购物车还是空的，去选一件喜欢的五行好物。' actionLabel='逛逛商城' onAction={() => Taro.redirectTo({ url: `${shopPath}/list/index` })} />}
    {data.length > 0 && <Section title='我的好物' eyebrow='SHOPPING BAG'>
      <Text className='commerce-tx__intro'>选择本次购买的商品，运费将在结算时确认。</Text>
      {data.map(item => <View className='commerce-tx__cart-item' key={item.id}>
        <View className='commerce-tx__product-row'>
          <Button className={`commerce-tx__select ${selected.includes(item.id) ? 'commerce-tx__select--active' : ''}`} aria-label={selected.includes(item.id) ? '取消选择商品' : '选择商品'} onClick={() => choose(item.id)}>{selected.includes(item.id) ? '✓' : ''}</Button>
          <Cover src={item.product?.cover} title={item.product?.title} />
          <View className='commerce-tx__product-copy'><Text className='commerce__name'>{item.product?.title || '商品已失效'}</Text><Text className='commerce__muted'>{item.sku?.name || '规格信息待更新'}</Text><Text className='commerce-tx__amount'>{money(item.sku?.price_fen || 0)}</Text></View>
        </View>
        <View className='commerce-tx__cart-controls'><Text className='commerce__muted'>可用库存 {item.sku?.available || 0}</Text><QuantityStepper value={item.quantity} max={99} onChange={qty => change(item, qty)} /><Button className='commerce-tx__text-button' onClick={() => action(async () => { await commerceApi(`/cart/${item.id}`, 'DELETE'); setSelected(selected.filter(i => i !== item.id)); await load(); })}>移除</Button></View>
      </View>)}
    </Section>}
    {!shopSaleOpen && <View className='commerce-tx__notice'><Text>好物可以先收藏进购物车，商城购买开放后再结算。</Text></View>}
  </CommercePage>;
}

export default withTheme(Cart);
