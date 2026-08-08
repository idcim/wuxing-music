// 应用版本信息。发布时手动 bump，并与根目录 version.json、package.json 对齐。
// 用途：关于/设置页展示、埋点上报、以及未来 APP 更新接口做版本比对。
export const APP_VERSION = '1.7.0';

// 后端接口契约版本（大版本不兼容时 +1，供后端灰度/兼容判断）。
// 1.2.0：bind-phone 强制短信校验（v1.2.0 漏改此处，现补齐）。
// v1.3.0 未改动小程序/H5 契约（profile 仅新增可选字段），故维持 1.2.0。
// 1.3.0（v1.6.0）：代理分成出参变更——/agent/me 去掉 upline、
//   /agent/commissions 去掉 baseAmount，且 level=2 行的 rate 语义改为「订单额的加成比例」。
//   旧包读到 undefined 会静默隐藏对应文案（不会报错），但显示口径已不对，需重传。
export const API_VERSION = '1.3.0';

// 构建渠道：weapp | h5 | rn（未来 APP）。android/ios 的细分在 APP 阶段区分。
export const BUILD_CHANNEL = (process.env.TARO_ENV as string) || 'unknown';
