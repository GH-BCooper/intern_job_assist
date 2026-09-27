import { useMemo } from 'react';

/**
 * Minimal, dependency-free markdown renderer for assistant replies.
 * Escapes HTML first, then applies a small safe subset of markdown.
 */

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inline(s: string) {
  return s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer noopener">$1</a>');
}

function render(markdown: string): string {
  const lines = escapeHtml(markdown.replace(/\r\n/g, '\n')).split('\n');
  const out: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let inCode = false;
  let para: string[] = [];

  const flushPara = () => {
    if (para.length) {
      out.push(`<p>${inline(para.join(' '))}</p>`);
      para = [];
    }
  };
  const closeList = () => {
    if (listType) {
      out.push(`</${listType}>`);
      listType = null;
    }
  };

  lines.forEach(raw => {
    const line = raw.trimEnd();

    if (/^```/.test(line.trim())) {
      flushPara();
      closeList();
      out.push(inCode ? '</code></pre>' : '<pre><code>');
      inCode = !inCode;
      return;
    }
    if (inCode) {
      out.push(`${line}\n`);
      return;
    }

    if (!line.trim()) {
      flushPara();
      closeList();
      return;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      flushPara();
      closeList();
      const level = Math.min(heading[1].length + 1, 4);
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      return;
    }

    if (/^(-|\*|•)\s+/.test(line.trim())) {
      flushPara();
      if (listType !== 'ul') {
        closeList();
        out.push('<ul>');
        listType = 'ul';
      }
      out.push(`<li>${inline(line.trim().replace(/^(-|\*|•)\s+/, ''))}</li>`);
      return;
    }

    if (/^\d+[.)]\s+/.test(line.trim())) {
      flushPara();
      if (listType !== 'ol') {
        closeList();
        out.push('<ol>');
        listType = 'ol';
      }
      out.push(`<li>${inline(line.trim().replace(/^\d+[.)]\s+/, ''))}</li>`);
      return;
    }

    if (/^&gt;\s?/.test(line.trim())) {
      flushPara();
      closeList();
      out.push(`<p class="border-l-2 border-primary-400 pl-3 italic">${inline(line.trim().replace(/^&gt;\s?/, ''))}</p>`);
      return;
    }

    if (/^(---|\*\*\*)$/.test(line.trim())) {
      flushPara();
      closeList();
      out.push('<hr class="my-3 border-light-300 dark:border-dark-700" />');
      return;
    }

    closeList();
    para.push(line.trim());
  });

  flushPara();
  closeList();
  if (inCode) out.push('</code></pre>');
  return out.join('');
}

export default function Markdown({ text, className = '' }: { text: string; className?: string }) {
  const html = useMemo(() => render(text || ''), [text]);
  return <div className={`prose-chat ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
