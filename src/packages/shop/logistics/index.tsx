import { withTheme } from '@/theme/withTheme';
import { View, Text, Button } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import { type Entry } from '@/services/commerce';
import { CommercePage, CustomerService, EmptyState, Feedback, Section, useData } from '@/features/commerce/common';
import '@/features/commerce/transactions.scss';

function OrderLogistics() {
  const id = Number(useRouter().params.id);
  const { data, loading, error, load } = useData<Entry>(`/orders/${id}/logistics`, {});
  const trace = data.trace;
  return <CommercePage title='物流进度'>
    <Feedback loading={loading} error={error} retry={load} />
    {data.tracking_no && <Section title={data.carrier || '配送信息'} eyebrow='ON THE WAY'>
      <Text className='commerce-tx__tracking-number'>{data.tracking_no}</Text><Text className='commerce__muted'>运单号</Text>
      <Button className='commerce__secondary' onClick={() => Taro.setClipboardData({ data: data.tracking_no })}>复制运单号</Button>
    </Section>}
    {trace && <>
      <Section title={trace.state_label || '查询中'} eyebrow='DELIVERY TIMELINE'>
        {trace.message && <Text className='commerce-tx__intro'>{trace.message}</Text>}
        {trace.error && <View className='commerce-tx__notice'><Text>{trace.error}{trace.events?.length ? '，以下为上次查询结果。' : ''}</Text></View>}
        <View className='commerce-tx__timeline'>{trace.events?.map((event: Entry, index: number) => <View className={`commerce-tx__timeline-event ${index === 0 ? 'commerce-tx__timeline-event--latest' : ''}`} key={`${event.time}:${index}`}><View className='commerce-tx__timeline-dot' /><View className='commerce-tx__timeline-copy'><Text className='commerce__muted'>{event.time}</Text><Text>{event.context}</Text></View></View>)}</View>
        {!trace.events?.length && <EmptyState title='等待物流更新' description='暂无物流轨迹，登记发货不代表快递已揽收。' />}
        {trace.queried_at && <Text className='commerce-tx__queried-at'>查询时间：{new Date(trace.queried_at).toLocaleString()}</Text>}
      </Section><View className='commerce-tx__notice'><Text>物流数据由快递100提供，同一运单至少间隔 30 分钟查询；间隔内刷新展示已保存结果。快递签收状态不替代订单确认收货。</Text></View>
    </>}
    <View className='commerce__actions'><Button className='commerce__secondary' loading={loading} disabled={loading} onClick={load}>刷新物流</Button><CustomerService /></View>
  </CommercePage>;
}

export default withTheme(OrderLogistics);
