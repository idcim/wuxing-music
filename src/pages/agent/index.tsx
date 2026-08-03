import { useState } from 'react';
import { View, Text } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import {
  getAgentMe,
  getCommissions,
  getDownline,
  getWithdrawals,
  requestWithdraw
} from '@/services/agent';
import { useUserStore } from '@/stores/user';
import Icon from '@/components/Icon';
import PosterShare from '@/components/PosterShare';
import ListState, { type LoadState } from '@/components/ListState';
import { navTopStyle, goBack } from '@/utils/nav';
import { isWeapp } from '@/utils/platform';
import type { AgentDownline, AgentMe, CommissionItem, WithdrawalItem } from '@/types';
import './index.scss';

const COMMISSION_TEXT: Record<string, string> = {
  pending: '冻结中',
  available: '可提现',
  withdrawing: '提现处理中',
  paid: '已到账',
  void: '已作废'
};

const WITHDRAW_TEXT: Record<string, string> = {
  pending: '待审核',
  approved: '待打款',
  paid: '已到账',
  rejected: '已驳回',
  failed: '打款失败'
};

function fmt(s: string | null): string {
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const money = (v: number | undefined) => Number(v || 0).toFixed(2);

export default function AgentCenter() {
  const [me, setMe] = useState<AgentMe>({ isAgent: false });
  const [rows, setRows] = useState<CommissionItem[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalItem[]>([]);
  const [downline, setDownline] = useState<AgentDownline>({ subAgents: [], subAgentCount: 0, userCount: 0 });
  const [state, setState] = useState<LoadState>('loading');
  const [tab, setTab] = useState<'commission' | 'withdraw'>('commission');
  const [posterOpen, setPosterOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const element = useUserStore((s) => s.element);

  const load = () => {
    setState('loading');
    getAgentMe()
      .then(async (d) => {
        setMe(d);
        if (!d.isAgent) {
          setState('empty');
          return;
        }
        const [c, w, dl] = await Promise.all([
          getCommissions(1, 30),
          getWithdrawals(),
          getDownline()
        ]);
        setRows(c.items || []);
        setWithdrawals(w || []);
        setDownline(dl);
        setState('ready');
      })
      .catch((e: any) => {
        setState(e?.code === 401 ? 'auth' : 'error');
      });
  };

  useDidShow(load);

  const copyCode = (code: string) => {
    // H5 端 Taro 的 shim 自带一次「内容已复制」提示，再补一条会叠两个 toast
    Taro.setClipboardData({
      data: code,
      success: () => {
        if (isWeapp) Taro.showToast({ title: '已复制', icon: 'success' });
      }
    });
  };

  const onWithdraw = async () => {
    const avail = me.balance?.available || 0;
    const min = me.minWithdraw || 0;
    if (avail < min) {
      Taro.showToast({ title: `满 ${money(min)} 元可提现`, icon: 'none' });
      return;
    }
    const res = await Taro.showModal({
      title: '申请提现',
      content: `将提现 ¥${money(avail)}，提交后由平台审核打款。`,
      confirmText: '确认提现'
    });
    if (!res.confirm) return;

    setSubmitting(true);
    try {
      await requestWithdraw(avail);
      Taro.showToast({ title: '已提交，等待审核', icon: 'none' });
      load();
    } catch (e: any) {
      Taro.showToast({ title: e?.message || '提现失败', icon: 'none' });
    } finally {
      setSubmitting(false);
    }
  };

  const agent = me.agent;

  return (
    <View className="agent">
      <View className="agent__nav" style={navTopStyle()}>
        <Text className="agent__back" onClick={() => goBack()}>‹</Text>
        <Text className="agent__nav-title">代理中心</Text>
        <View className="agent__nav-spacer" />
      </View>

      <ListState
        state={state}
        emptyText="您还不是代理，如需合作请联系平台"
        emptyIcon="award"
        onRetry={load}
      />

      {state === 'ready' && agent && (
        <View className="agent__body">
          {/* 余额卡 */}
          <View className="agent__card fade-up">
            <Text className="agent__card-label">可提现（元）</Text>
            <Text className="agent__card-amount cormorant">{money(me.balance?.available)}</Text>
            <View className="agent__card-sub">
              <View className="agent__card-sub-item">
                <Text className="agent__card-sub-num">{money(me.balance?.frozen)}</Text>
                <Text className="agent__card-sub-label">冻结中</Text>
              </View>
              <View className="agent__card-sub-item">
                <Text className="agent__card-sub-num">{money(me.balance?.withdrawing)}</Text>
                <Text className="agent__card-sub-label">处理中</Text>
              </View>
              <View className="agent__card-sub-item">
                <Text className="agent__card-sub-num">{money(me.balance?.paid)}</Text>
                <Text className="agent__card-sub-label">已到账</Text>
              </View>
            </View>
            <View
              className={`agent__withdraw ${submitting ? 'agent__withdraw--busy' : ''}`}
              onClick={submitting ? undefined : onWithdraw}
            >
              <Text className="agent__withdraw-text">{submitting ? '提交中…' : '申请提现'}</Text>
            </View>
            {!!me.freezeDays && (
              <Text className="agent__card-tip">
                成交后冻结 {me.freezeDays} 天转为可提现{me.minWithdraw ? `，满 ${money(me.minWithdraw)} 元可提` : ''}
              </Text>
            )}
            {/* 有上级就把规则摆明，别让代理自己去猜为什么金额对不上 */}
            {!!me.upline && (
              <Text className="agent__card-tip">
                你的上级为「{me.upline.name}」，每笔直推分成中有
                {(me.upline.cutRate * 100).toFixed(0)}% 归上级
              </Text>
            )}
          </View>

          {/* 本月业绩 */}
          <View className="agent__stats fade-up">
            <View className="agent__stat">
              <Text className="agent__stat-num cormorant">{me.month?.count ?? 0}</Text>
              <Text className="agent__stat-label">本月成交</Text>
            </View>
            <View className="agent__stat">
              <Text className="agent__stat-num cormorant">{money(me.month?.amount)}</Text>
              <Text className="agent__stat-label">本月分成</Text>
            </View>
            <View className="agent__stat">
              <Text className="agent__stat-num cormorant">
                {agent.effectiveRate != null ? `${(agent.effectiveRate * 100).toFixed(0)}%` : '—'}
              </Text>
              <Text className="agent__stat-label">分成比例</Text>
            </View>
          </View>

          {/* 我的下级：只有一层，下级的下级与我无关 */}
          {(downline.subAgentCount > 0 || downline.userCount > 0) && (
            <View className="agent__team fade-up">
              <View className="agent__team-head">
                <Text className="agent__team-title">我的下级</Text>
                <Text className="agent__team-count">
                  {downline.subAgentCount} 位代理 · {downline.userCount} 位用户
                </Text>
              </View>
              {downline.subAgents.map((s) => (
                <View key={s.id} className="agent__team-item">
                  <View className="agent__team-item-left">
                    <Text className="agent__team-name">{s.name}</Text>
                    <Text className="agent__team-meta">
                      {s.type === 'store' ? '实体店' : '网络推手'} · {s.userCount} 位用户
                    </Text>
                  </View>
                  <View className="agent__team-item-right">
                    <Text className="agent__team-amount">+{money(s.contributed)}</Text>
                    <Text className="agent__team-label">累计抽成</Text>
                  </View>
                </View>
              ))}
              {downline.subAgentCount === 0 && (
                <Text className="agent__team-empty">
                  还没有下级代理。你推广来的用户成为代理后会自动成为你的下级
                </Text>
              )}
            </View>
          )}

          {/* 推广码 */}
          <View className="agent__promo fade-up">
            <View className="agent__promo-head">
              <Text className="agent__promo-title">我的推广码</Text>
              <Text className="agent__promo-type">
                {agent.type === 'store' ? '实体店' : '网络推手'}
              </Text>
            </View>
            <Text className="agent__promo-code cormorant" onClick={() => copyCode(agent.code)}>
              {agent.code}
            </Text>
            <Text className="agent__promo-tip">
              {agent.type === 'store'
                ? '把海报打印出来贴在店里，顾客扫码后成交即计入你的分成'
                : '分享海报给好友，对方扫码后成交即计入你的分成'}
            </Text>
            <View className="agent__promo-actions">
              <View className="agent__promo-btn" onClick={() => copyCode(agent.code)}>
                <Icon name="circleDot" size={24} color="#94a3b8" strokeWidth={1.6} />
                <Text className="agent__promo-btn-text">复制码</Text>
              </View>
              <View className="agent__promo-btn" onClick={() => setPosterOpen(true)}>
                <Icon name="share2" size={24} color="#94a3b8" strokeWidth={1.6} />
                <Text className="agent__promo-btn-text">推广海报</Text>
              </View>
            </View>
          </View>

          {/* 明细 */}
          <View className="agent__tabs">
            <Text
              className={`agent__tab ${tab === 'commission' ? 'agent__tab--on' : ''}`}
              onClick={() => setTab('commission')}
            >
              分成明细
            </Text>
            <Text
              className={`agent__tab ${tab === 'withdraw' ? 'agent__tab--on' : ''}`}
              onClick={() => setTab('withdraw')}
            >
              提现记录
            </Text>
          </View>

          {tab === 'commission' && (
            <View className="agent__list">
              {rows.length === 0 && <Text className="agent__none">还没有分成记录</Text>}
              {rows.map((r) => (
                <View key={r.id} className="agent__item">
                  <View className="agent__item-main">
                    <Text className="agent__item-amount">+{money(r.amount)}</Text>
                    <View className="agent__item-tags">
                      {r.level === 2 && <Text className="agent__item-level">下级抽成</Text>}
                      <Text className={`agent__item-status agent__item-status--${r.status}`}>
                        {COMMISSION_TEXT[r.status] || r.status}
                      </Text>
                    </View>
                  </View>
                  <View className="agent__item-meta">
                    <Text className="agent__item-desc">
                      {r.level === 2
                        ? `${r.sourceAgentName || '下级'}的成交 · 抽成 ${(Number(r.rate || 0) * 100).toFixed(0)}%`
                        : `订单 ¥${money(r.orderAmount)} · ${(Number(r.rate || 0) * 100).toFixed(0)}%`}
                    </Text>
                    <Text className="agent__item-time">{fmt(r.createdAt)}</Text>
                  </View>
                  {/* 直推被上级抽走过就说明白，否则「怎么不是 20 块」会被反复问 */}
                  {r.level === 1 && r.baseAmount > r.amount && (
                    <Text className="agent__item-note">
                      本单分成 ¥{money(r.baseAmount)}，上级抽 ¥{money(r.baseAmount - r.amount)}
                    </Text>
                  )}
                </View>
              ))}
            </View>
          )}

          {tab === 'withdraw' && (
            <View className="agent__list">
              {withdrawals.length === 0 && <Text className="agent__none">还没有提现记录</Text>}
              {withdrawals.map((w) => (
                <View key={w.id} className="agent__item">
                  <View className="agent__item-main">
                    <Text className="agent__item-amount">¥{money(w.amount)}</Text>
                    <Text className={`agent__item-status agent__item-status--${w.status}`}>
                      {WITHDRAW_TEXT[w.status] || w.status}
                    </Text>
                  </View>
                  <View className="agent__item-meta">
                    <Text className="agent__item-desc">
                      {w.failReason || (w.status === 'paid' ? '已打款' : '申请提现')}
                    </Text>
                    <Text className="agent__item-time">{fmt(w.paidAt || w.createdAt)}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {/* 推广海报：scene 里带 a=<推广码>，扫码进来即绑定归因 */}
      <PosterShare
        open={posterOpen}
        onClose={() => setPosterOpen(false)}
        element={element}
        title="五行律音"
        subtitle="按体质定制的助眠音律 · 扫码开启"
        scene={agent ? `a=${agent.code}` : ''}
      />
    </View>
  );
}
