// 与 admin/src/utils/markdown.ts 保持一致；两侧改动必须同步。
const CODE_TOKEN = '\u0000CODE';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeHref(value: string): string {
  const href = value.trim();
  if (/^(https?:|mailto:|tel:)/i.test(href)) return href;
  if ((href.startsWith('/') && !href.startsWith('//')) || href.startsWith('#')) return href;
  return '#';
}

function renderInline(source: string): string {
  const codes: string[] = [];
  let text = source.replace(/`([^`]+)`/g, (_, code: string) => {
    codes.push(code);
    return `${CODE_TOKEN}${codes.length - 1}${CODE_TOKEN}`;
  });
  text = text.replace(/\[([^\]]+)]\(([^)\s]+)\)/g, (_, label: string, href: string) =>
    `<a href="${sanitizeHref(href)}">${label}</a>`
  );
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  codes.forEach((code, index) => {
    text = text.replace(`${CODE_TOKEN}${index}${CODE_TOKEN}`, () => `<code>${code}</code>`);
  });
  return text;
}

export function renderMarkdown(source: string): string {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const html: string[] = [];
  let paragraph: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let listItems: string[] = [];
  let quote: string[] = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    html.push(`<p>${renderInline(paragraph.join('\n')).replace(/\n/g, '<br/>')}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (!listType) return;
    html.push(`<${listType}>${listItems.map((item) => `<li>${renderInline(item)}</li>`).join('')}</${listType}>`);
    listType = null;
    listItems = [];
  };
  const flushQuote = () => {
    if (!quote.length) return;
    html.push(`<blockquote>${renderInline(quote.join('\n')).replace(/\n/g, '<br/>')}</blockquote>`);
    quote = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      flushList();
      flushQuote();
      continue;
    }

    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      flushQuote();
      html.push(`<h${heading[1].length}>${renderInline(escapeHtml(heading[2]))}</h${heading[1].length}>`);
      continue;
    }

    if (trimmed.startsWith('>')) {
      flushParagraph();
      flushList();
      quote.push(escapeHtml(trimmed.replace(/^>\s?/, '')));
      continue;
    }

    const unordered = trimmed.match(/^[-*]\s+(.+)$/);
    const ordered = trimmed.match(/^\d+\.\s+(.+)$/);
    if (unordered || ordered) {
      flushParagraph();
      flushQuote();
      const nextType = unordered ? 'ul' : 'ol';
      if (listType && listType !== nextType) flushList();
      listType = nextType;
      listItems.push(escapeHtml((unordered || ordered)![1]));
      continue;
    }

    flushList();
    flushQuote();
    paragraph.push(escapeHtml(trimmed));
  }

  flushParagraph();
  flushList();
  flushQuote();
  return html.join('\n');
}
