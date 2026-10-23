import { View } from '@tarojs/components';
import type { ReactNode } from 'react';

interface Props {
  className?: string;
  children: ReactNode;
}

export default function ScrollArea({ className, children }: Props) {
  return <View className={className}>{children}</View>;
}
