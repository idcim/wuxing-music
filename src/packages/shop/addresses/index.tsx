import { withTheme } from '@/theme/withTheme';
import { useState } from 'react';
import { View, Text, Button, Input, Picker } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { commerceApi, type Entry } from '@/services/commerce';
import { action, CommercePage, EmptyState, Feedback, Section, useData } from '@/features/commerce/common';
import '@/features/commerce/transactions.scss';

const emptyAddress = { name: '', phone: '', province: '', city: '', district: '', detail: '' };
function Addresses() {
  const { data, loading, error, load } = useData<Entry[]>('/addresses', []);
  const [editing, setEditing] = useState(0);
  const [form, setForm] = useState({ ...emptyAddress });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (busy) return;
    setBusy(true);
    await action(async () => { await commerceApi(editing ? `/addresses/${editing}` : '/addresses', 'POST', form); setEditing(0); setForm({ ...emptyAddress }); await load(); });
    setBusy(false);
  };
  return <CommercePage title='收货地址'><Feedback loading={loading} error={error} retry={load} />
    {!loading && !error && !data.length && <EmptyState title='让好物准确抵达' description='添加收货地址，结算时即可选择配送地点。' />}
    {data.map((a, index) => <View className='commerce__card commerce__card-body commerce-tx__saved-address' key={a.id}><View className='commerce-tx__between'><Text className='commerce-tx__category'>收货地址 {String(index + 1).padStart(2, '0')}</Text><Text className='commerce__muted'>{a.phone}</Text></View><Text className='commerce__name'>{a.name}</Text><Text className='commerce__muted'>{a.province}{a.city}{a.district}{a.detail}</Text>
      <View className='commerce-tx__address-actions'><Button className='commerce__secondary' onClick={() => { setEditing(a.id); setForm(Object.fromEntries(Object.keys(emptyAddress).map(k => [k, a[k]])) as typeof emptyAddress); }}>编辑地址</Button>
        <Button className='commerce-tx__text-button' onClick={() => action(async () => { const yes = await Taro.showModal({ title: '删除地址', content: '删除后不影响历史订单地址。' }); if (yes.confirm) { await commerceApi(`/addresses/${a.id}`, 'DELETE'); await load(); } })}>删除</Button></View></View>)}
    <Section title={editing ? '编辑收货地址' : '新增收货地址'} eyebrow='ADDRESS BOOK'>
      <Text className='commerce-tx__intro'>请填写完整信息，便于配送时与您联系。</Text>
      {(['name', 'phone'] as const).map((key, i) => <View className='commerce__field' key={key}><Text className='commerce__label'>{i ? '联系电话' : '收货人'}</Text><Input value={form[key]} placeholder={i ? '填写手机号' : '填写收货人姓名'} onInput={e => setForm({ ...form, [key]: e.detail.value })} /></View>)}
      <View className='commerce__field'><Text className='commerce__label'>所在地区</Text><Picker mode='region' value={[form.province, form.city, form.district]} onChange={e => { const [province, city, district] = e.detail.value; setForm({ ...form, province, city, district }); }}><View className='commerce-tx__region'><Text>{form.province ? `${form.province} ${form.city} ${form.district}` : '选择省 / 市 / 区'}</Text><Text>›</Text></View></Picker></View>
      <View className='commerce__field'><Text className='commerce__label'>详细地址</Text><Input value={form.detail} placeholder='街道、门牌号等' onInput={e => setForm({ ...form, detail: e.detail.value })} /></View>
      <View className='commerce__actions'><Button className='commerce__primary' loading={busy} onClick={save}>保存收货地址</Button>{!!editing && <Button className='commerce__secondary' onClick={() => { setEditing(0); setForm({ ...emptyAddress }); }}>取消编辑</Button>}</View>
    </Section>
  </CommercePage>;
}

export default withTheme(Addresses);
