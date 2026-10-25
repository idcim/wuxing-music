import { useEffect, useRef, useState } from 'react';
import { View, Text, Button, Input, Picker } from '@tarojs/components';
import Taro, { useDidShow, useRouter } from '@tarojs/taro';
import { commerceApi, shopPath, money, type Entry } from '@/services/commerce';
import { payCommerceOrder } from '@/services/commerce-payment';
import { action, CommercePage, Feedback, useData } from '@/features/commerce/common';

const emptyAddress = { name: '', phone: '', province: '', city: '', district: '', detail: '' };
export default function Addresses() {
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
    {data.map(a => <View className='commerce__card commerce__card-body' key={a.id}><Text>{a.name} {a.phone}</Text><Text className='commerce__muted'>{a.province}{a.city}{a.district}{a.detail}</Text>
      <View className='commerce__actions'><Button onClick={() => { setEditing(a.id); setForm(Object.fromEntries(Object.keys(emptyAddress).map(k => [k, a[k]])) as typeof emptyAddress); }}>编辑</Button>
        <Button onClick={() => action(async () => { const yes = await Taro.showModal({ title: '删除地址', content: '删除后不影响历史订单地址。' }); if (yes.confirm) { await commerceApi(`/addresses/${a.id}`, 'DELETE'); await load(); } })}>删除</Button></View></View>)}
    <Text className='commerce__name'>{editing ? '编辑地址' : '新增地址'}</Text>
    {(['name', 'phone'] as const).map((key, i) => <View className='commerce__field' key={key}><Text className='commerce__label'>{i ? '手机号' : '收货人'}</Text><Input value={form[key]} onInput={e => setForm({ ...form, [key]: e.detail.value })} /></View>)}
    <Picker mode='region' value={[form.province, form.city, form.district]} onChange={e => { const [province, city, district] = e.detail.value; setForm({ ...form, province, city, district }); }}><View className='commerce__chip'>{form.province ? `${form.province} ${form.city} ${form.district}` : '选择省 / 市 / 区'}</View></Picker>
    <View className='commerce__field'><Text className='commerce__label'>详细地址</Text><Input value={form.detail} onInput={e => setForm({ ...form, detail: e.detail.value })} /></View>
    <View className='commerce__actions'><Button className='commerce__primary' loading={busy} onClick={save}>保存地址</Button>{!!editing && <Button onClick={() => { setEditing(0); setForm({ ...emptyAddress }); }}>取消编辑</Button>}</View>
  </CommercePage>;
}
