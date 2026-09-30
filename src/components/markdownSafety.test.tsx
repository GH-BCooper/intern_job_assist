import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Markdown from './ui/Markdown';

const attributesOf = (html: string) => {
  const { container } = render(<Markdown text={html} />);
  return [...container.querySelectorAll('a')].map(a => a.getAttributeNames().sort());
};

describe('Markdown', () => {
  it('cannot be tricked into an event-handler attribute through a link URL', () => {
    // A double quote inside the URL used to close the href attribute and open a new one.
    const attrs = attributesOf('[click me](https://example.com/"onmouseover="alert(document.cookie))');
    expect(attrs).toHaveLength(1);
    expect(attrs[0]).toEqual(['href', 'rel', 'target']);
  });

  it('cannot inject through a single-quoted attribute or a broken-out tag', () => {
    const { container } = render(
      <Markdown text={"[a](https://x.example/'onfocus='alert(1)) and [b](https://y.example/><img src=x onerror=alert(1)>)"} />,
    );
    expect(container.querySelector('img')).toBeNull();
    container.querySelectorAll('*').forEach(el => {
      el.getAttributeNames().forEach(name => expect(name.startsWith('on')).toBe(false));
    });
  });

  it('still renders ordinary links, bold text and code', () => {
    const { container } = render(<Markdown text={'**bold** and `code` and [site](https://example.com/a?b=1&c=2)'} />);
    expect(container.querySelector('strong')?.textContent).toBe('bold');
    expect(container.querySelector('code')?.textContent).toBe('code');
    const link = container.querySelector('a');
    expect(link?.getAttribute('href')).toBe('https://example.com/a?b=1&c=2');
  });

  it('refuses javascript: links', () => {
    const { container } = render(<Markdown text={'[x](javascript:alert(1))'} />);
    expect(container.querySelector('a')).toBeNull();
  });
});
