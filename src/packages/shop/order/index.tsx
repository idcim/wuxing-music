import { useRef, useState } from 'react';
import { View, Text, Button, Input, Textarea, Image } from '@tarojs/components';
import Taro, { useDidShow, useRouter } from '@tarojs/taro';
import { commerceApi, shopPath, coursePath, money, useCommerce, type Entry } from '@/services/commerce';
import { confirmCommerceReceipt, openCommerceLogistics, payCommerceOrder, refundWechatCode } from '@/services/commerce-payment';
import { uploadCommerceImage } from '@/services/commerce-upload';
import { action, CommercePage, CustomerService, Feedback, useData } from '@/features/commerce/common';

const labels: Record<string, string> = { pending: '待付款', closing: '取消确认中', paid: '已支付', refunded: '已退款', closed: '已关闭',
  refunding: '退款中', failed: '失败', unpaid: '待付款', unshipped: '待发货', shipped: '已发货', received: '已收货', ready: '可学习',
  requested: '售后待审核', awaiting_return: '等待寄回', returning: '退货待验收', rejected: '申请未通过' };
const label = (value: string) => labels[value] || value;

export default function OrderDetail() {
  const cfg = useCommerce(s => s.config);
  const id = Number(useRouter().params.id);
  const { data: order, loading, error, load } = useData<Entry>(`/orders/${id}`, {});
  const [busy, setBusy] = useState(false);
  const perform = async (fn: () => Promise<unknown>) => { if (busy) return; setBusy(true); await action(fn); await load(); setBusy(false); };
  const [returnId, setReturnId] = useState<number>();
  const [returnCarrier, setReturnCarrier] = useState('');
  const [returnNo, setReturnNo] = useState('');
  const receiptPending = useRef(false);
  useDidShow(() => {
    if (receiptPending.current) {
      receiptPending.current = false;
      commerceApi(`/orders/${id}/receive`, 'POST').catch(() => {}).finally(load);
    }
  });
  return <CommercePage title='订单详情'><Feedback loading={loading} error={error} retry={load} />
    {order.id && <>
      <Text className='commerce__name'>{label(order.status)} · {label(order.fulfillment)}</Text><Text className='commerce__muted'>{order.order_no}</Text>
      {order.items.map((item: Entry) => <View className='commerce__card commerce__card-body' key={item.id}>
        <Text className='commerce__name'>{item.title}</Text><Text className='commerce__muted'>{item.spec} × {item.quantity}</Text><Text>{money(item.price_fen * item.quantity)}</Text>
        {order.status === 'paid' && !order.refund_via_apple && item.quantity > item.refund_quantity && <Button className='commerce__secondary' onClick={() => Taro.navigateTo({ url: `${shopPath}/aftersale/index?order=${id}&item=${item.id}` })}>申请售后</Button>}
        {order.kind === 'course' && order.status === 'paid' && <Button onClick={() => Taro.navigateTo({ url: `${coursePath}/detail/index?id=${item.entity_id}` })}>进入课程</Button>}
      </View>)}
      <Text className='commerce__price'>实付 {money(order.amount_fen)}</Text><Text className='commerce__muted'>运费 {money(order.shipping_fen)} · 已退 {money(order.refund_fen)}</Text>
      {order.refund_via_apple && <Text className='commerce__muted'>此课程使用 Apple 渠道支付。退款请在 App Store 购买记录中申请，审核结果确认后更新课程权益。如需协助，请咨询客服。</Text>}
      {order.address?.name && <View className='commerce__card commerce__card-body'><Text>{order.address.name} {order.address.phone}</Text><Text className='commerce__muted'>{order.address.province}{order.address.city}{order.address.district}{order.address.detail}</Text></View>}
      {order.shipment && <View className='commerce__card commerce__card-body'><Text className='commerce__name'>发货信息</Text><Text>{order.shipment.carrier} {order.shipment.tracking_no}</Text>
        <Text className='commerce__muted'>已登记发货；揽收与运输进度请查看物流。</Text><View className='commerce__actions'><Button onClick={() => Taro.setClipboardData({ data: order.shipment.tracking_no })}>复制单号</Button><Button onClick={() => action(() => openCommerceLogistics(id))}>查看物流</Button></View></View>}
      {order.aftersales?.map((sale: Entry) => <View className='commerce__card commerce__card-body' key={sale.id}>
        <Text className='commerce__name'>{label(sale.state)} · {money(sale.amount_fen)}</Text><Text className='commerce__muted'>{sale.reason}{sale.remark ? ` · ${sale.remark}` : ''}</Text>
        {sale.return_tracking && <Text className='commerce__muted'>退货：{sale.return_carrier} {sale.return_tracking}</Text>}
        {order.kind === 'course' && !order.refund_via_apple && ['requested', 'refunding'].includes(sale.state) && <Button onClick={() => perform(async () => {
          await commerceApi(`/aftersales/${sale.id}/authorize`, 'POST', { code: await refundWechatCode() });
          Taro.showToast({ title: '退款授权已刷新', icon: 'success' });
        })}>刷新微信退款授权</Button>}
        {sale.state === 'awaiting_return' && <><Text className='commerce__muted'>退货地址：{cfg.return_address || '请先咨询客服确认退货地址'}</Text><Button onClick={() => setReturnId(sale.id)}>登记退货快递</Button></>}
      </View>)}
      {returnId && <View className='commerce__card commerce__card-body'>
        <Text className='commerce__name'>登记退货</Text>
        <Input value={returnCarrier} placeholder='退货快递公司' onInput={e => setReturnCarrier(e.detail.value)} />
        <Input value={returnNo} placeholder='退货单号' onInput={e => setReturnNo(e.detail.value)} />
        <Button onClick={() => perform(async () => { await commerceApi(`/aftersales/${returnId}/return`, 'POST', { carrier: returnCarrier, tracking_no: returnNo }); setReturnId(undefined); })}>提交退货单号</Button>
      </View>}
      <View className='commerce__actions'><CustomerService /><Button loading={busy} onClick={load}>刷新状态</Button></View>
      {order.status === 'pending' && <View className='commerce__actions'><Button disabled={busy} onClick={() => perform(() => commerceApi(`/orders/${id}/cancel`, 'POST'))}>取消订单</Button>
        <Button className='commerce__primary' loading={busy} onClick={() => perform(() => payCommerceOrder(id, order.kind))}>继续支付</Button>
        <Button onClick={() => perform(() => commerceApi(`/orders/${id}/sync`, 'POST'))}>同步支付结果</Button></View>}
      {order.fulfillment === 'shipped' && order.status === 'paid' && <Button className='commerce__primary' loading={busy} onClick={() => perform(async () => {
        const result = await Taro.showModal({ title: '确认收货', content: '请确认已收到商品，确认后仍可按规则申请售后。' });
        if (result.confirm) {
          receiptPending.current = true;
          await confirmCommerceReceipt(order.transaction_id);
          await commerceApi(`/orders/${id}/receive`, 'POST');
        }
      })}>确认收货</Button>}
    </>}
  </CommercePage>;
}
