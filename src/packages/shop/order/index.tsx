import { withTheme } from '@/theme/withTheme';
import { useRef, useState } from 'react';
import { View, Text, Button, Input } from '@tarojs/components';
import Taro, { useDidShow, useRouter } from '@tarojs/taro';
import { commerceApi, shopPath, coursePath, money, useCommerce, type Entry } from '@/services/commerce';
import { confirmCommerceReceipt, openCommerceLogistics, payCommerceOrder, refundWechatCode } from '@/services/commerce-payment';
import { action, CommercePage, CustomerService, Feedback, Section, useData } from '@/features/commerce/common';
import '@/features/commerce/transactions.scss';

const labels: Record<string, string> = { pending: '待付款', closing: '取消确认中', paid: '已支付', refunded: '已退款', closed: '已关闭',
  refunding: '退款中', failed: '失败', unpaid: '待付款', unshipped: '待发货', shipped: '已发货', received: '已收货', ready: '可学习',
  requested: '售后待审核', awaiting_return: '等待寄回', returning: '退货待验收', rejected: '申请未通过' };
const label = (value: string) => labels[value] || value;

function OrderDetail() {
  const cfg = useCommerce(s => s.config);
  const params = useRouter().params;
  const id = Number(params.id);
  const legacy = params.kind === 'music';
  const { data: order, loading, error, load } = useData<Entry>(legacy ? `/orders/music/${id}` : `/orders/${id}`, {});
  const [busy, setBusy] = useState(false);
  const perform = async (fn: () => Promise<unknown>) => { if (busy) return; setBusy(true); await action(fn); await load(); setBusy(false); };
  const [returnId, setReturnId] = useState<number>();
  const [returnCarrier, setReturnCarrier] = useState('');
  const [returnNo, setReturnNo] = useState('');
  const receiptPending = useRef(false);
  const receiptSyncing = useRef(false);
  const syncReceipt = async () => {
    if (receiptSyncing.current) return;
    receiptSyncing.current = true;
    try {
      await commerceApi(`/orders/${id}/receive`, 'POST');
      receiptPending.current = false;
    } finally {
      receiptSyncing.current = false;
    }
  };
  useDidShow(() => {
    if (receiptPending.current && !receiptSyncing.current) {
      void syncReceipt().catch(() => {}).finally(load);
    }
  });
  if (legacy) return <CommercePage title='音乐会员订单'>
    <Feedback loading={loading} error={error} retry={load} />
    {order.id && <Section title={label(order.status)} eyebrow='MEMBERSHIP ORDER'>
      <Text className='commerce__name'>{order.items?.[0]?.title || order.plan_name}</Text>
      <View className='commerce-tx__detail-row'><Text className='commerce__muted'>订单金额</Text><Text className='commerce__price'>{money(order.amount_fen)}</Text></View>
      <View className='commerce-tx__detail-row'><Text className='commerce__muted'>订单号</Text><Text className='commerce-tx__mono'>{order.order_no}</Text></View>
      {order.refund_fen > 0 && <View className='commerce-tx__detail-row'><Text className='commerce__muted'>已退款</Text><Text>{money(order.refund_fen)}</Text></View>}
      {order.is_gift && order.gift_code && order.status === 'paid' && <>
        <View className='commerce-tx__gift-code'><Text className='commerce__muted'>礼物兑换码</Text><Text className='commerce__name'>{order.gift_code}</Text></View>
        <Button className='commerce__secondary' onClick={() => Taro.setClipboardData({ data: order.gift_code })}>复制兑换码</Button>
      </>}
    </Section>}
    <View className='commerce__actions'><CustomerService /><Button loading={loading} onClick={load}>刷新状态</Button></View>
  </CommercePage>;
  return <CommercePage title='订单详情' footer={order.id && (order.status === 'pending' ? <>
    <View className='commerce-tx__footer-total'><Text className='commerce__muted'>待支付</Text><Text className='commerce__price'>{money(order.amount_fen)}</Text></View><Button className='commerce__primary' loading={busy} onClick={() => perform(() => payCommerceOrder(id, order.kind))}>继续支付</Button>
  </> : order.fulfillment === 'shipped' && order.status === 'paid' && <Button className='commerce__primary' loading={busy} onClick={() => perform(async () => {
    const result = await Taro.showModal({ title: '确认收货', content: '请确认已收到商品，确认后仍可按规则申请售后。' });
    if (result.confirm) {
      await confirmCommerceReceipt(order.transaction_id);
      receiptPending.current = true;
      await syncReceipt();
    }
  })}>确认收货</Button>)}><Feedback loading={loading} error={error} retry={load} />
    {order.id && <>
      <View className='commerce-tx__status-hero'><Text className='commerce-tx__category'>ORDER STATUS</Text><Text className='commerce-tx__status-title'>{label(order.status)}</Text>{order.fulfillment && <Text className='commerce-tx__status-subtitle'>{label(order.fulfillment)}</Text>}<Text className='commerce__muted'>{order.status === 'pending' ? '请在订单有效期内完成付款。' : order.fulfillment === 'shipped' ? '好物已登记发货，运输进度请查看物流。' : order.kind === 'course' && order.status === 'paid' ? '课程已准备好，按自己的节奏开始学习。' : '订单与售后进度以当前状态为准。'}</Text></View>
      <Section title={order.kind === 'course' ? '课程信息' : '商品信息'} eyebrow='YOUR ORDER'>{order.items.map((item: Entry) => <View className='commerce-tx__line-item' key={item.id}>
        <View className='commerce-tx__between'><Text className='commerce__name'>{item.title}</Text><Text className='commerce-tx__amount'>{money(item.price_fen * item.quantity)}</Text></View><Text className='commerce__muted'>{item.spec} × {item.quantity}</Text>
        <View className='commerce-tx__item-actions'>{order.status === 'paid' && !order.refund_via_apple && item.quantity > item.refund_quantity && <Button className='commerce__secondary' onClick={() => Taro.navigateTo({ url: `${shopPath}/aftersale/index?order=${id}&item=${item.id}` })}>申请售后</Button>}
        {order.kind === 'course' && order.status === 'paid' && <Button className='commerce__primary' onClick={() => Taro.navigateTo({ url: `${coursePath}/detail/index?id=${item.entity_id}` })}>进入课程</Button>}</View>
      </View>)}</Section>
      {order.address?.name && <Section title='收货信息' eyebrow='DELIVERY ADDRESS'><View className='commerce-tx__between'><Text className='commerce__name'>{order.address.name}</Text><Text>{order.address.phone}</Text></View><Text className='commerce__muted'>{order.address.province}{order.address.city}{order.address.district}{order.address.detail}</Text></Section>}
      {order.shipment && <Section title='配送动态' eyebrow='SHIPMENT'><Text className='commerce__name'>{order.shipment.carrier}</Text><Text className='commerce-tx__tracking-number'>{order.shipment.tracking_no}</Text>
        <Text className='commerce__muted'>已登记发货；揽收与运输进度请查看物流。</Text><View className='commerce__actions'><Button className='commerce__secondary' onClick={() => Taro.setClipboardData({ data: order.shipment.tracking_no })}>复制单号</Button><Button className='commerce__secondary' onClick={() => action(() => openCommerceLogistics(id))}>查看物流</Button></View></Section>}
      <Section title='订单明细' eyebrow='ORDER DETAILS'><View className='commerce-tx__detail-row'><Text className='commerce__muted'>订单号</Text><Text className='commerce-tx__mono'>{order.order_no}</Text></View><View className='commerce-tx__detail-row'><Text className='commerce__muted'>运费</Text><Text>{money(order.shipping_fen)}</Text></View><View className='commerce-tx__detail-row'><Text className='commerce__muted'>已退款</Text><Text>{money(order.refund_fen)}</Text></View><View className='commerce-tx__detail-row commerce-tx__detail-row--total'><Text>{['pending', 'closing', 'closed'].includes(order.status) ? '订单金额' : '实付金额'}</Text><Text className='commerce__price'>{money(order.amount_fen)}</Text></View></Section>
      {order.refund_via_apple && <View className='commerce-tx__notice'><Text>此课程使用 Apple 渠道支付。退款请在 App Store 购买记录中申请，审核结果确认后更新课程权益。如需协助，请咨询客服。</Text></View>}
      {order.aftersales?.map((sale: Entry) => <Section title={label(sale.state)} eyebrow='AFTER-SALES' key={sale.id}>
        <View className='commerce-tx__detail-row'><Text className='commerce__muted'>申请金额</Text><Text className='commerce-tx__amount'>{money(sale.amount_fen)}</Text></View><Text>{sale.reason}</Text>{sale.remark && <View className='commerce-tx__notice'><Text>{sale.remark}</Text></View>}
        {sale.return_tracking && <Text className='commerce__muted'>退货：{sale.return_carrier} {sale.return_tracking}</Text>}
        {order.kind === 'course' && !order.refund_via_apple && ['requested', 'refunding'].includes(sale.state) && <Button onClick={() => perform(async () => {
          await commerceApi(`/aftersales/${sale.id}/authorize`, 'POST', { code: await refundWechatCode() });
          Taro.showToast({ title: '退款授权已刷新', icon: 'success' });
        })}>刷新微信退款授权</Button>}
        {sale.state === 'awaiting_return' && <><Text className='commerce__muted'>退货地址：{cfg.return_address || '请先咨询客服确认退货地址'}</Text><Button onClick={() => setReturnId(sale.id)}>登记退货快递</Button></>}
      </Section>)}
      {returnId && <Section title='登记退货快递' eyebrow='RETURN DELIVERY'>
        <View className='commerce__field'><Text className='commerce__label'>快递公司</Text><Input value={returnCarrier} placeholder='填写退货快递公司' onInput={e => setReturnCarrier(e.detail.value)} /></View>
        <View className='commerce__field'><Text className='commerce__label'>退货单号</Text><Input value={returnNo} placeholder='填写退货运单号' onInput={e => setReturnNo(e.detail.value)} /></View>
        <Button className='commerce__primary' onClick={() => perform(async () => { await commerceApi(`/aftersales/${returnId}/return`, 'POST', { carrier: returnCarrier, tracking_no: returnNo }); setReturnId(undefined); })}>提交退货单号</Button>
      </Section>}
      <View className='commerce__actions'><CustomerService /><Button loading={busy} onClick={load}>刷新状态</Button></View>
      {order.status === 'pending' && <View className='commerce__actions'><Button className='commerce__secondary' disabled={busy} onClick={() => perform(() => commerceApi(`/orders/${id}/cancel`, 'POST'))}>取消订单</Button>
        <Button className='commerce__secondary' onClick={() => perform(() => commerceApi(`/orders/${id}/sync`, 'POST'))}>同步支付结果</Button></View>}
    </>}
  </CommercePage>;
}

export default withTheme(OrderDetail);
