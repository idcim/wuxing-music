export async function payCommerceOrder(_id: number, _kind: string): Promise<void> {
  throw new Error('课程与商城首期仅在微信小程序开放');
}
export async function openCommerceLogistics(_id: number): Promise<void> {
  throw new Error('请在微信小程序查看物流');
}
export async function confirmCommerceReceipt(_transactionId: string): Promise<void> {
  throw new Error('请在微信小程序中确认收货');
}
export async function refundWechatCode(): Promise<string> {
  throw new Error('请在微信小程序申请课程退款');
}
