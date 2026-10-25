import Taro from '@tarojs/taro';
import { commerceApi } from './commerce';

interface NativeCommerce {
  requestVirtualPayment: (options: Record<string, unknown>) => void;
  openBusinessView: (options: Record<string, unknown>) => void;
}
const native = () => (globalThis as unknown as { wx: NativeCommerce }).wx;

export async function payCommerceOrder(id: number, kind: string): Promise<void> {
  const platform = Taro.getDeviceInfo().platform;
  let code = '';
  if (kind === 'course') {
    if (!Taro.canIUse('requestVirtualPayment')) throw new Error('当前微信版本暂不支持课程支付，请更新微信');
    const version = (Taro.getAppBaseInfo().version || '0.0.0').split('.').map(Number);
    if (platform === 'ios' && (version[0] < 8 || (version[0] === 8 && version[1] === 0 && (version[2] || 0) < 68))) {
      throw new Error('iOS 课程支付需要微信 8.0.68 或更新版本');
    }
    code = (await Taro.login()).code;
  }
  const result = await commerceApi(`/orders/${id}/pay`, 'POST', { code, platform: platform === 'ios' ? 'ios' : platform === 'android' ? 'android' : 'other' });
  if (result.provider === 'virtual') {
    await new Promise<void>((resolve, reject) => native().requestVirtualPayment({ ...result.payParams, success: () => resolve(), fail: reject }));
  } else {
    await Taro.requestPayment(result.payParams);
  }
  for (let i = 0; i < 6; i++) {
    const order = await commerceApi(`/orders/${id}/sync`, 'POST');
    if (order.status === 'paid') return;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error('支付结果确认中，请稍后在订单中查看');
}

export async function openCommerceLogistics(id: number): Promise<void> {
  const data = await commerceApi(`/orders/${id}/logistics`);
  const token = data.trace?.waybill_token;
  if (!token) throw new Error('物流信息暂未就绪，请稍后重试');
  const plugin = Taro.requirePlugin('logisticsPlugin') as {
    openWaybillTracking?: (options: { waybillToken: string }) => void | Promise<void>;
  };
  if (typeof plugin?.openWaybillTracking !== 'function') throw new Error('物流查询暂不可用，请稍后重试或联系客服');
  await plugin.openWaybillTracking({ waybillToken: token });
}

export async function confirmCommerceReceipt(transactionId: string): Promise<void> {
  if (!Taro.canIUse('openBusinessView')) throw new Error('请更新微信后确认收货');
  await new Promise<void>((resolve, reject) => native().openBusinessView({ businessType: 'weappOrderConfirm',
    extraData: { transaction_id: transactionId }, success: () => resolve(), fail: reject }));
}

export async function refundWechatCode(): Promise<string> {
  return (await Taro.login()).code;
}
