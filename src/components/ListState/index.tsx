import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import Icon from '@/components/Icon';
import type { IconName } from '@/components/Icon/paths';
import './index.scss';

export type LoadState = 'loading' | 'error' | 'auth' | 'empty' | 'ready';

interface Props {
  state: LoadState;
  emptyText: string;
  emptyIcon?: IconName;
  onRetry: () => void;
}

/**
 * 列表页的加载 / 失败 / 未登录 / 空 四态占位。
 *
 * 之前各页都是 `.catch(() => setList([]))`，于是 401、断网、后端 500
 * 统统渲染成「还没有订单记录」——用户会以为自己没买过东西。
 * 请求失败必须和「确实没有数据」区分开，并且给得出下一步动作。
 */
export default function ListState({ state, emptyText, emptyIcon = 'receipt', onRetry }: Props) {
  if (state === 'ready') return null;

  if (state === 'loading') {
    return (
      <View className="list-state">
        <View className="list-state__spinner" />
        <Text className="list-state__text">加载中…</Text>
      </View>
    );
  }

  if (state === 'error') {
    return (
      <View className="list-state">
        <Icon name="x" size={64} color="#475569" strokeWidth={1.2} />
        <Text className="list-state__text">加载失败，请检查网络</Text>
        <View className="list-state__btn" onClick={onRetry}>
          <Text className="list-state__btn-text">重试</Text>
        </View>
      </View>
    );
  }

  if (state === 'auth') {
    return (
      <View className="list-state">
        <Icon name="user" size={64} color="#475569" strokeWidth={1.2} />
        <Text className="list-state__text">登录后可查看</Text>
        <View
          className="list-state__btn"
          onClick={() => Taro.navigateTo({ url: '/pages/login/index' })}
        >
          <Text className="list-state__btn-text">去登录</Text>
        </View>
      </View>
    );
  }

  return (
    <View className="list-state">
      <Icon name={emptyIcon} size={64} color="#334155" strokeWidth={1.2} />
      <Text className="list-state__text">{emptyText}</Text>
    </View>
  );
}
