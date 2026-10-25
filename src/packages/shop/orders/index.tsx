import { useRef, useState } from 'react';
import { View, Text, Button, Input, Textarea, Image } from '@tarojs/components';
import Taro, { useDidShow, useRouter } from '@tarojs/taro';
import { commerceApi, shopPath, coursePath, money, useCommerce, type Entry } from '@/services/commerce';
import { confirmCommerceReceipt, openCommerceLogistics, payCommerceOrder } from '@/services/commerce-payment';
import { uploadCommerceImage } from '@/services/commerce-upload';
import { action, CommercePage, CustomerService, Feedback, useData } from '@/features/commerce/common';

const labels: Record<string, string> = { pending: '待付款', closing: '取消确认中', paid: '已支付', refunded: '已退款', closed: '已关闭',
  refunding: '退款中', failed: '失败', unpaid: '待付款', unshipped: '待发货', shipped: '已发货', received: '已收货', ready: '可学习',
  requested: '售后待审核', awaiting_return: '等待寄回', returning: '退货待验收', rejected: '申请未通过' };
const label = (value: string) => labels[value] || value;

export default function Orders() {
  const params = useRouter().params;
  const [kind, setKind] = useState(params.kind || '');
  const [page, setPage] = useState(1);
  const [state, setState] = useState('');
  const { data, loading, error, load } = useData<Entry>(`/orders?kind=${kind}&page=${page}&state=${state}`, { items: [], total: 0 });
  return <CommercePage title='我的订单'>
    <View className='commerce__chips'>{[['', '全部'], ['music', '音乐会员'], ['course', '课程'], ['physical', '实物']].map(([id, title]) => <Text key={title} className={`commerce__chip ${kind === id ? 'commerce__chip--active' : ''}`} onClick={() => { setKind(id); setState(''); setPage(1); }}>{title}</Text>)}</View>
    {kind === 'physical' && <View className='commerce__chips'>{[['', '全部状态'], ['pending', '待付款'], ['unshipped', '待发货'], ['shipped', '待收货'], ['aftersales', '售后']].map(([id, title]) => <Text key={id} className={`commerce__chip ${state === id ? 'commerce__chip--active' : ''}`} onClick={() => { setState(id); setPage(1); }}>{title}</Text>)}</View>}
    <Feedback loading={loading} error={error} retry={load} />{!loading && !error && !data.items.length && <Text className='commerce__empty'>暂无订单</Text>}
    {data.items.map((order: Entry) => <View className='commerce__card commerce__card-body' key={`${order.legacy ? 'music' : 'commerce'}-${order.id}`} onClick={() => Taro.navigateTo({ url: order.legacy ? '/pages/orders/index' : `${shopPath}/order/index?id=${order.id}` })}>
      <Text className='commerce__muted'>{order.kind === 'music' ? '音乐会员' : order.kind === 'course' ? '在线课程' : '实物商品'} · {label(order.status)}{order.fulfillment && order.status === 'paid' ? ` · ${label(order.fulfillment)}` : ''}</Text>
      {order.items.map((item: Entry, i: number) => <Text key={i} className='commerce__name'>{item.title} × {item.quantity}</Text>)}
      <Text className='commerce__price'>{money(order.amount_fen)}</Text><Text className='commerce__muted'>{order.order_no}</Text><Text>查看订单 →</Text>
    </View>)}
    <View className='commerce__actions'><Button disabled={page === 1} onClick={() => setPage(page - 1)}>上一页</Button><Text>第 {page} 页 · 共 {data.total} 单</Text><Button disabled={page * 20 >= data.total} onClick={() => setPage(page + 1)}>下一页</Button></View>
  </CommercePage>;
}
