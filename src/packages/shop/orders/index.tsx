import { withTheme } from '@/theme/withTheme';
import { useState } from 'react';
import { View, Text, Button } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import { shopPath, money, type Entry } from '@/services/commerce';
import { CommercePage, EmptyState, Feedback, useData } from '@/features/commerce/common';
import '@/features/commerce/transactions.scss';

const labels: Record<string, string> = { pending: '待付款', closing: '取消确认中', paid: '已支付', refunded: '已退款', closed: '已关闭',
  refunding: '退款中', failed: '失败', unpaid: '待付款', unshipped: '待发货', shipped: '已发货', received: '已收货', ready: '可学习',
  requested: '售后待审核', awaiting_return: '等待寄回', returning: '退货待验收', rejected: '申请未通过' };
const label = (value: string) => labels[value] || value;

function Orders() {
  const params = useRouter().params;
  const [kind, setKind] = useState(params.kind || '');
  const [page, setPage] = useState(1);
  const [state, setState] = useState('');
  const { data, loading, error, load } = useData<Entry>(`/orders?kind=${kind}&page=${page}&state=${state}`, { items: [], total: 0 });
  return <CommercePage title='我的订单'>
    <View className='commerce__chips'>{[['', '全部'], ['music', '音乐会员'], ['course', '课程'], ['physical', '实物']].map(([id, title]) => <Text key={title} className={`commerce__chip ${kind === id ? 'commerce__chip--active' : ''}`} onClick={() => { setKind(id); setState(''); setPage(1); }}>{title}</Text>)}</View>
    {kind === 'physical' && <View className='commerce__chips'>{[['', '全部状态'], ['pending', '待付款'], ['unshipped', '待发货'], ['shipped', '待收货'], ['aftersales', '售后']].map(([id, title]) => <Text key={id} className={`commerce__chip ${state === id ? 'commerce__chip--active' : ''}`} onClick={() => { setState(id); setPage(1); }}>{title}</Text>)}</View>}
    <Feedback loading={loading} error={error} retry={load} />{!loading && !error && !data.items.length && <EmptyState title={state ? '暂无此状态的订单' : '还没有订单记录'} description={state ? '试试切换其他订单状态，查看购买与售后进度。' : '每一份好物与每一次学习，都将在这里留下记录。'} actionLabel={state ? '查看全部状态' : undefined} onAction={state ? () => { setState(''); setPage(1); } : undefined} />}
    {data.items.map((order: Entry) => <View className='commerce__card commerce-tx__order-card' aria-label={`查看订单${order.order_no}`} key={`${order.legacy ? 'music' : 'commerce'}-${order.id}`} onClick={() => Taro.navigateTo({ url: `${shopPath}/order/index?id=${order.id}${order.legacy ? '&kind=music' : ''}` })}>
      <View className='commerce-tx__order-head'><Text className='commerce-tx__category'>{order.kind === 'music' ? '音乐会员' : order.kind === 'course' ? '在线课程' : '实物好物'}</Text><Text className='commerce-tx__status'>{label(order.status)}{order.fulfillment && order.status === 'paid' ? ` · ${label(order.fulfillment)}` : ''}</Text></View>
      {order.items.map((item: Entry, i: number) => <View className='commerce-tx__order-item' key={i}><View className='commerce-tx__item-mark'><Text>{order.kind === 'course' ? '课' : order.kind === 'music' ? '音' : '物'}</Text></View><View className='commerce-tx__product-copy'><Text className='commerce__name'>{item.title}</Text><Text className='commerce__muted'>{item.spec || (order.kind === 'course' ? '在线课程' : '订单商品')} · 数量 {item.quantity}</Text></View></View>)}
      <View className='commerce-tx__order-bottom'><View className='commerce-tx__product-copy'><Text className='commerce__muted'>订单金额</Text><Text className='commerce-tx__amount'>{money(order.amount_fen)}</Text></View><Text className='commerce-tx__order-link'>查看详情 →</Text></View><Text className='commerce-tx__order-number'>{order.order_no}</Text>
    </View>)}
    {(data.total > 0 || page > 1) && <View className='commerce-tx__pagination'><Button className='commerce__secondary' disabled={page === 1} onClick={() => setPage(page - 1)}>上一页</Button><Text>第 {page} 页 · 共 {data.total} 单</Text><Button className='commerce__secondary' disabled={page * 20 >= data.total} onClick={() => setPage(page + 1)}>下一页</Button></View>}
  </CommercePage>;
}

export default withTheme(Orders);
