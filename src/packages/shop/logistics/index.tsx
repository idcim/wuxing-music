import { View, Text, Button } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import { type Entry } from '@/services/commerce';
import { CommercePage, CustomerService, Feedback, useData } from '@/features/commerce/common';

export default function OrderLogistics() {
  const id = Number(useRouter().params.id);
  const { data, loading, error, load } = useData<Entry>(`/orders/${id}/logistics`, {});
  const trace = data.trace;
  return <CommercePage title='物流进度'>
    <Feedback loading={loading} error={error} retry={load} />
    {data.tracking_no && <View className='commerce__card commerce__card-body'>
      <Text className='commerce__name'>{data.carrier} · {data.tracking_no}</Text>
      <Button className='commerce__secondary' onClick={() => Taro.setClipboardData({ data: data.tracking_no })}>复制运单号</Button>
    </View>}
    {trace && <>
      <Text className='commerce__name'>{trace.state_label || '查询中'}</Text>
      {trace.message && <Text className='commerce__muted'>{trace.message}</Text>}
      {trace.error && <Text className='commerce__muted'>{trace.error}{trace.events?.length ? '，以下为上次查询结果。' : ''}</Text>}
      {trace.events?.map((event: Entry, index: number) => <View className='commerce__card commerce__card-body' key={`${event.time}:${index}`}>
        <Text className='commerce__muted'>{event.time}</Text><Text>{event.context}</Text>
      </View>)}
      {!trace.events?.length && <Text className='commerce__empty'>暂无物流轨迹，登记发货不代表快递已揽收。</Text>}
      {trace.queried_at && <Text className='commerce__muted'>查询时间：{new Date(trace.queried_at).toLocaleString()}</Text>}
      <Text className='commerce__muted'>物流数据由快递100提供，同一运单至少间隔 30 分钟向服务商查询；间隔内刷新展示已保存结果。快递签收状态不替代订单确认收货。</Text>
    </>}
    <View className='commerce__actions'><Button className='commerce__secondary' loading={loading} disabled={loading} onClick={load}>刷新物流</Button><CustomerService /></View>
  </CommercePage>;
}
