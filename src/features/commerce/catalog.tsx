import { View, Text, Image, Button } from '@tarojs/components';
import type { ReactNode } from 'react';
import './catalog.scss';

export function CatalogHero({ image, eyebrow, title, description, onClick }: { image: string; eyebrow: string; title: string; description: string; onClick?: () => void }) {
  return <View className='catalog-hero' onClick={onClick}>
    <Image className='catalog-hero__image' src={image} mode='aspectFill' />
    <View className='catalog-hero__shade' />
    <View className='catalog-hero__copy'><Text className='catalog-hero__eyebrow'>{eyebrow}</Text><Text className='catalog-hero__title serif'>{title}</Text><Text className='catalog-hero__description'>{description}</Text>{onClick && <Text className='catalog-hero__link'>探索更多 ↗</Text>}</View>
  </View>;
}

export function QuickEntry({ label, description, mark, onClick }: { label: string; description: string; mark: string; onClick: () => void }) {
  return <Button className='catalog-quick' onClick={onClick}><Text className='catalog-quick__mark serif'>{mark}</Text><View className='catalog-quick__copy'><Text className='catalog-quick__label'>{label}</Text><Text className='catalog-quick__description'>{description}</Text></View><Text className='catalog-quick__arrow'>›</Text></Button>;
}

export function DetailFacts({ children }: { children: ReactNode }) {
  return <View className='catalog-facts'>{children}</View>;
}
