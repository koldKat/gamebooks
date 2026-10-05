const ELEMENTS = new Set(['P', 'H2', 'H3', 'H4', 'OL', 'UL', 'LI', 'STRONG', 'EM', 'BR', 'FIGURE', 'FIGCAPTION', 'IMG']);

// Copy only inert prose and this book's protected images into the live DOM.
export function renderReadingMatter(mount, bookId, text, document) {
  if (!/^\s*<(?:p|h[2-4]|ol|ul|figure)[\s>]/i.test(text)) return false;
  const template = document.createElement('template');
  template.innerHTML = text;
  const imagePath = new RegExp(`^/api/books/${Number(bookId)}/reading-images/[a-f0-9]{64}\\.png$`);
  function copy(node) {
    if (node.nodeType === 3) return document.createTextNode(node.textContent);
    if (node.nodeType !== 1 || !ELEMENTS.has(node.tagName)) throw new Error('Unsupported reading markup');
    const target = document.createElement(node.tagName.toLowerCase());
    for (const attr of node.attributes) {
      if (node.tagName === 'IMG' && ['src', 'alt', 'loading'].includes(attr.name)) continue;
      if (['OL', 'LI'].includes(node.tagName) && attr.name === (node.tagName === 'OL' ? 'start' : 'value') && /^\d+$/.test(attr.value)) {
        target.setAttribute(attr.name, attr.value);
        continue;
      }
      throw new Error('Unsupported reading attribute');
    }
    if (node.tagName === 'IMG') {
      const src = node.getAttribute('src');
      if (!imagePath.test(src)) throw new Error('Unprotected reading image');
      target.src = src;
      target.alt = node.getAttribute('alt') || '';
      target.loading = 'lazy';
    }
    for (const child of node.childNodes) target.append(copy(child));
    return target;
  }
  try {
    const nodes = [...template.content.childNodes].map(copy);
    mount.append(...nodes);
    mount.className += ' reading-frontmatter--structured';
    return true;
  } catch {
    return false;
  }
}
