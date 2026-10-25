import req from './request';
const base = '/api/admin/commerce';
export const commerce = {
  get: <T = any>(path: string) => req.get<T>(base + path),
  post: <T = any>(path: string, data: any = {}) => req.post<T>(base + path, data),
};
export const yuan = (fen: number) => `¥${((fen || 0) / 100).toFixed(2)}`;
export const stateLabel = (value: string) => ({ draft: '草稿', published: '已上架', offline: '已下架', uploading: '待完成上传', processing: '处理中', ready: '已就绪',
  pending: '待处理', initiating: '发起中', issued: '已发起', paid: '已支付', closed: '已关闭', closing: '关单确认中', unshipped: '待发货', shipped: '已发货', received: '已收货',
  requested: '待审核', awaiting_return: '待寄回', returning: '待验收', refunding: '退款中', refunded: '已退款', rejected: '未通过', failed: '失败', running: '处理中', done: '已完成', synced: '已同步', unpaid: '待付款',
} as Record<string, string>)[value] || value;
