import { RichText } from '@tarojs/components';
import { renderMarkdown } from '@/utils/markdown';
import './index.scss';

interface Props {
  source: string;
  className?: string;
}

export default function MarkdownView({ source, className = '' }: Props) {
  const nodes = renderMarkdown(source);
  if (!nodes) return null;
  return <RichText className={`markdown-view ${className}`} nodes={nodes} />;
}
