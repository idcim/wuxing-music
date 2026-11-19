import { withTheme } from '@/theme/withTheme';
import { useState } from 'react';
import { View, Text, Button, Textarea, Image } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import { commerceApi, money, type Entry } from '@/services/commerce';
import { refundWechatCode } from '@/services/commerce-payment';
import { uploadCommerceImage } from '@/services/commerce-upload';
import { action, CommercePage, EmptyState, Feedback, QuantityStepper, Section, useData } from '@/features/commerce/common';
import '@/features/commerce/transactions.scss';

function AfterSale() {
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
  return <CommercePage title='申请售后' footer={item && <Button className='commerce__primary' loading={busy} disabled={reason.trim().length < 2} onClick={submit}>提交售后申请</Button>}><Feedback loading={loading} error={error} retry={load} />
    {!loading && !error && !item && <EmptyState title='暂未找到这件商品' description='请返回订单详情，选择需要申请售后的商品。' actionLabel='返回订单' onAction={() => Taro.navigateBack()} />}
    {item && <><View className='commerce-tx__steps'><Text className='commerce-tx__step commerce-tx__step--active'>01 提交申请</Text><Text className='commerce-tx__step'>02 等待审核</Text><Text className='commerce-tx__step'>03 处理完成</Text></View><Section title='售后商品' eyebrow='AFTER-SALES'><Text className='commerce__name'>{item.title}</Text><Text className='commerce__muted'>{item.spec || '订单商品'} · 每件 {money(item.price_fen)}</Text><View className='commerce-tx__detail-row'><View className='commerce-tx__product-copy'><Text>申请数量</Text><Text className='commerce__muted'>可申请 {item.quantity - item.refund_quantity} 件</Text></View><QuantityStepper value={quantity} max={item.quantity - item.refund_quantity} onChange={value => setQuantity(Math.max(1, Math.min(item.quantity - item.refund_quantity, value)))} /></View></Section>
      <Section title='填写申请' eyebrow='YOUR REQUEST'><Text className='commerce__label'>售后类型</Text><View className='commerce__chips'>{['refund', ...(order.kind === 'physical' && order.fulfillment !== 'unshipped' ? ['return_refund'] : [])].map(value => <Text className={`commerce__chip ${kind === value ? 'commerce__chip--active' : ''}`} key={value} onClick={() => setKind(value)}>{value === 'refund' ? '仅退款' : '退货退款'}</Text>)}</View>
        <View className='commerce__field'><Text className='commerce__label'>申请原因</Text><Textarea value={reason} maxlength={255} onInput={e => setReason(e.detail.value)} placeholder='请说明具体情况，至少两个字' /><Text className='commerce-tx__character-count'>{reason.length}/255</Text></View>
        <View className='commerce-tx__between'><Text className='commerce__label'>补充图片</Text><Text className='commerce__muted'>{images.length}/6</Text></View><View className='commerce-tx__evidence'>{images.map(src => <Image className='commerce-tx__evidence-image' key={src} src={src} mode='aspectFill' />)}</View>
        {images.length < 6 && <Button className='commerce__secondary' onClick={addImage}>＋ 添加说明图片</Button>}
      </Section><View className='commerce-tx__notice'><Text>退款及退货需审核；课程退款按支付渠道规则处理。未发货商品全部退款后，运费会独立原路退回。</Text></View>
    </>}
  </CommercePage>;
}

export default withTheme(AfterSale);
