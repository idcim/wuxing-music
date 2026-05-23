import { useState } from 'react';
import { View, Text } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { getMyOrders, type MyOrder } from '@/services/pay';
import { useUserStore } from '@/stores/user';
import Icon from '@/components/Icon';
import PosterShare from '@/components/PosterShare';
import { getNavTop } from '@/utils/nav';
import './index.scss';

const STATUS_TEXT: Record<string, string> = {
  pending: '待支付',
  paid: '已完成',
  refunding: '退款中',
  refunded: '已退款',
  failed: '已失败',
  closed: '已关闭'
};

function fmt(s: string | null): string {
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function Orders() {
  const [list, setList] = useState<MyOrder[]>([]);
  const [loaded, setLoaded] = useState(false);
  const element = useUserStore((s) => s.element);

  const [posterOpen, setPosterOpen] = useState(false);
  const [posterCode, setPosterCode] = useState('');
  const [posterTitle, setPosterTitle] = useState('');

  useDidShow(() => {
    getMyOrders()
      .then((d) => setList(d || []))
      .catch(() => setList([]))
      .finally(() => setLoaded(true));
  });

  const back = () => Taro.navigateBack();

  const copyCode = (code: string) => {
    Taro.setClipboardData({ data: code, success: () => Taro.showToast({ title: '已复制', icon: 'success' }) });
  };

  const sharePoster = (o: MyOrder) => {
    setPosterCode(o.giftCode);
    setPosterTitle(`${o.planName}礼物卡`);
    setPosterOpen(true);
  };

  return (
    <View className="orders">
      <View className="orders__nav" style={{ paddingTop: `${getNavTop()}px` }}>
        <Text className="orders__back" onClick={back}>‹</Text>
        <Text className="orders__nav-title">我的订单</Text>
        <View className="orders__nav-spacer" />
      </View>

      {loaded && list.length === 0 ? (
        <View className="orders__empty">
          <Text className="orders__empty-text">还没有订单记录</Text>
        </View>
      ) : (
        <View className="orders__list">
          {list.map((o) => (
            <View key={o.orderNo} className="orders__item">
              <View className="orders__item-head">
                <View className="orders__item-title">
                  {o.isGift && <Icon name="gift" size={26} color="#fde047" strokeWidth={1.5} />}
                  <Text className="orders__item-name">
                    {o.isGift ? `${o.planName}礼物卡` : o.planName}
                  </Text>
                </View>
                <Text className={`orders__item-status orders__item-status--${o.status}`}>
                  {STATUS_TEXT[o.status] || o.status}
                </Text>
              </View>

              <View className="orders__item-meta">
                <Text className="orders__item-amount">¥{o.amount}</Text>
                <Text className="orders__item-time">{fmt(o.paidAt || o.createdAt)}</Text>
              </View>

              {/* 礼物卡：显示兑换码 + 复制 + 分享海报 */}
              {o.isGift && o.giftCode && o.status === 'paid' && (
                <View className="orders__gift">
                  <View className="orders__gift-code">
                    <Text className="orders__gift-label">礼物兑换码</Text>
                    <Text className="orders__gift-value cormorant">{o.giftCode}</Text>
                  </View>
                  <View className="orders__gift-actions">
                    <View className="orders__gift-btn" onClick={() => copyCode(o.giftCode)}>
                      <Icon name="circleDot" size={24} color="#94a3b8" strokeWidth={1.6} />
                      <Text className="orders__gift-btn-text">复制</Text>
                    </View>
                    <View className="orders__gift-btn" onClick={() => sharePoster(o)}>
                      <Icon name="share2" size={24} color="#94a3b8" strokeWidth={1.6} />
                      <Text className="orders__gift-btn-text">海报</Text>
                    </View>
                  </View>
                </View>
              )}

              <Text className="orders__item-no">订单号 {o.orderNo}</Text>
            </View>
          ))}
        </View>
      )}

      <PosterShare
        open={posterOpen}
        onClose={() => setPosterOpen(false)}
        element={element}
        title={posterTitle}
        subtitle="送你一张律音会员礼物卡，扫码兑换"
        cdkey={posterCode || undefined}
        scene={`inv=${useUserStore.getState().user?.id || ''}`}
      />
    </View>
  );
}
