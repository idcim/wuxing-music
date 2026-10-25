import { useRef, useState } from 'react';
import { View, Text, Button, Input, Textarea, Image } from '@tarojs/components';
import Taro, { useDidShow, useRouter } from '@tarojs/taro';
import { commerceApi, shopPath, coursePath, money, useCommerce, type Entry } from '@/services/commerce';
import { refundWechatCode } from '@/services/commerce-payment';
import { uploadCommerceImage } from '@/services/commerce-upload';
import { action, CommercePage, CustomerService, Feedback, useData } from '@/features/commerce/common';

const labels: Record<string, string> = { pending: '待付款', closing: '取消确认中', paid: '已支付', refunded: '已退款', closed: '已关闭',
  refunding: '退款中', failed: '失败', unpaid: '待付款', unshipped: '待发货', shipped: '已发货', received: '已收货', ready: '可学习',
  requested: '售后待审核', awaiting_return: '等待寄回', returning: '退货待验收', rejected: '申请未通过' };
const label = (value: string) => labels[value] || value;

export default function AfterSale() {
  const params = useRouter().params;
  const id = Number(params.order), itemId = Number(params.item);
  const { data: order, loading, error, load } = useData<Entry>(`/orders/${id}`, {});
  const item = order.items?.find((i: Entry) => i.id === itemId);
  const [kind, setKind] = useState('refund');
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const addImage = () => action(async () => {
    const selected = await Taro.chooseImage({ count: 6 - images.length, sizeType: ['compressed'], sourceType: ['album', 'camera'] });
    const uploaded: string[] = [];
    for (const path of selected.tempFilePaths) uploaded.push(await uploadCommerceImage(path));
    setImages([...images, ...uploaded]);
  });
  const submit = async () => {
    if (busy || !item) return;
    setBusy(true);
    await action(async () => { const code = order.kind === 'course' ? await refundWechatCode() : '';
      await commerceApi(`/orders/${id}/aftersales`, 'POST', { item_id: itemId, quantity, kind, reason, images, code });
      Taro.showToast({ title: '售后申请已提交', icon: 'success' }); Taro.navigateBack(); });
    setBusy(false);
  };
  return <CommercePage title='申请售后'><Feedback loading={loading} error={error} retry={load} />
    {item && <><Text className='commerce__name'>{item.title}</Text><Text className='commerce__muted'>可申请数量 {item.quantity - item.refund_quantity}；每件 {money(item.price_fen)}</Text>
      <View className='commerce__chips'>{['refund', ...(order.kind === 'physical' && order.fulfillment !== 'unshipped' ? ['return_refund'] : [])].map(value => <Text className={`commerce__chip ${kind === value ? 'commerce__chip--active' : ''}`} key={value} onClick={() => setKind(value)}>{value === 'refund' ? '退款' : '退货退款'}</Text>)}</View>
      <View className='commerce__field'><Text className='commerce__label'>数量</Text><Input type='number' value={String(quantity)} onInput={e => setQuantity(Math.max(1, Math.min(item.quantity - item.refund_quantity, Number(e.detail.value) || 1)))} /></View>
      <View className='commerce__field'><Text className='commerce__label'>申请原因</Text><Textarea value={reason} maxlength={255} onInput={e => setReason(e.detail.value)} placeholder='请说明具体情况，至少两个字' /></View>
      <View className='commerce__row'>{images.map(src => <Image className='commerce__cover' key={src} src={src} mode='aspectFill' />)}</View>
      {images.length < 6 && <Button className='commerce__secondary' onClick={addImage}>添加说明图片（最多 6 张）</Button>}
      <Text className='commerce__muted'>退款及退货需审核；课程退款按支付渠道规则处理。未发货商品全部退款后，运费会独立原路退回。</Text>
      <Button className='commerce__primary' loading={busy} disabled={reason.trim().length < 2} onClick={submit}>提交售后申请</Button>
    </>}
  </CommercePage>;
}
