import { isH5 } from './platform';

// H5 下 1rem = 40rpx：Taro 注入的根字号脚本把 html font-size 设为
// 40 * 屏宽 / 750(designWidth) px，与 postcss-pxtransform 对样式表的换算口径一致
// （样式表里 28rpx 编译产物为 .7rem）。
const H5_RPX_PER_REM = 40;

/**
 * 行内样式的 rpx 换算。
 *
 * 样式表里的 rpx 由 postcss-pxtransform 在构建期换算；但写在 .tsx 行内 style 上的
 * rpx 不经过 postcss——H5 下浏览器判定为非法值并丢弃整条声明（元素塌成 0×0、
 * border / box-shadow 直接失效）。因此行内样式的尺寸一律经本函数产出当前端合法单位。
 *
 * 不直接用 Taro.pxTransform：其内部对入参做了 ~~ 取整，splash 星点这类
 * 1~4rpx 的小数尺寸会被截断。
 *
 * TODO: RN 端需返回 number（px），待 .rn 分端时补。
 */
export function rpx(size: number): string {
  if (!isH5) return `${size}rpx`;
  return `${Number((size / H5_RPX_PER_REM).toFixed(5))}rem`;
}
