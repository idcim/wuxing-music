import { Image } from '@tarojs/components';
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

// base64 编码（小程序无 btoa，手写 UTF-8 安全编码）
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function base64(input: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    if (c < 0x80) bytes.push(c);
    else if (c < 0x800) {
      bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    } else {
      bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
  }
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += B64[b0 >> 2];
    out += B64[((b0 & 3) << 4) | (b1 >> 4)];
    out += i + 1 < bytes.length ? B64[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    out += i + 2 < bytes.length ? B64[b2 & 63] : '=';
  }
  return out;
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
  const src = `data:image/svg+xml;base64,${base64(svg)}`;

  return (
    <Image
      src={src}
      className={className}
      style={{ width: `${size}rpx`, height: `${size}rpx`, ...style }}
      mode="aspectFit"
    />
  );
}
