import { View } from '@tarojs/components';
import { rpx } from '@/utils/unit';
import { ICON_PATHS, type IconName } from './paths';

interface Props {
  name: IconName;
  size?: number;          // rpx
  color?: string;         // 描边色
  strokeWidth?: number;
  fill?: string;          // 填充色（如实心 Play/Pause）
  className?: string;
  style?: React.CSSProperties;
}

// 微信小程序 WXSS 的 background-image data-URI 需 URL 编码（非 base64）。
// 仅编码会破坏 url()/属性的字符，保留可读性。
function encodeSvg(svg: string): string {
  return svg
    .replace(/"/g, "'")
    .replace(/%/g, '%25')
    .replace(/#/g, '%23')
    .replace(/</g, '%3C')
    .replace(/>/g, '%3E')
    .replace(/&/g, '%26')
    .replace(/\s+/g, ' ');
}

export default function Icon({
  name,
  size = 40,
  color = '#e2e8f0',
  strokeWidth = 2,
  fill = 'none',
  className,
  style
}: Props) {
  const inner = ICON_PATHS[name] || '';
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" ` +
    `fill="${fill}" stroke="${color}" stroke-width="${strokeWidth}" ` +
    `stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  const bg = `url("data:image/svg+xml,${encodeSvg(svg)}")`;

  return (
    <View
      className={className}
      style={{
        width: rpx(size),
        height: rpx(size),
        backgroundImage: bg,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center',
        backgroundSize: 'contain',
        ...style
      }}
    />
  );
}
