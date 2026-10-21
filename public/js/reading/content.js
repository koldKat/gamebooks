const ELEMENTS = new Set(['P', 'H2', 'H3', 'H4', 'OL', 'UL', 'LI', 'STRONG', 'EM', 'U', 'BR', 'HR', 'FIGURE', 'FIGCAPTION', 'IMG',
  'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TH', 'TD', 'CAPTION']);

function proseStyle(tag, input) {
  if (!['P', 'H2', 'H3', 'H4', 'HR'].includes(tag)) throw new Error('Unsupported reading style');
  const length = (value, negative = false) => {
    const match = /^(-?(?:\d+(?:\.\d+)?|\.\d+))(em)?$/.exec(value);
    if (!match) return false;
    const number = Number(match[1]);
    return (match[2] || number === 0) && number >= (negative ? -8 : 0) && number <= 8;
  };
  const seen = new Set();
  const result = input.split(';').map(part => part.trim()).filter(Boolean).map(part => {
    const colon = part.indexOf(':');
    const property = part.slice(0, colon).trim().toLowerCase();
    let value = part.slice(colon + 1).trim().replace(/\s+/g, ' ').toLowerCase();
    if (colon < 1 || seen.has(property)) throw new Error('Invalid reading style');
    seen.add(property);
    if (property === 'margin' && value.split(' ').length <= 4 && value.split(' ').every(v => length(v))) {
      return `${property}:${value}`;
    }
    if (tag === 'HR') {
      if (property === 'border' && value === '0') return 'border:0';
      if (property === 'border-top' && value === '1px solid currentcolor') return 'border-top:1px solid currentColor';
    } else {
      if (property === 'text-align' && /^(left|center|right|justify)$/.test(value)) return `${property}:${value}`;
      if (property === 'text-indent' && length(value, true)) return `${property}:${value}`;
      if (/^margin-(top|bottom|left|right)$/.test(property) && length(value)) return `${property}:${value}`;
      if (property === 'font-size' && /^(?:\d+(?:\.\d+)?|\.\d+)em$/.test(value)) {
        const size = Number(value.slice(0, -2));
        if (size >= 0.8 && size <= 1.1) return `${property}:${value}`;
      }
    }
    throw new Error('Unsupported reading style');
  });
  if (!result.length) throw new Error('Empty reading style');
  return result.join(';');
}

// Copy only inert prose and this book's protected images into the live DOM.
export function renderReadingMatter(mount, bookId, text, document) {
  if (!/^\s*<(?:p|h[2-4]|ol|ul|figure|table)[\s>]/i.test(text)) return false;
  const template = document.createElement('template');
  template.innerHTML = text;
  const imagePath = new RegExp(`^/api/books/${Number(bookId)}/reading-images/[a-f0-9]{64}\\.png$`);
  function copy(node) {
    if (node.nodeType === 3) return document.createTextNode(node.textContent);
    if (node.nodeType !== 1 || !ELEMENTS.has(node.tagName)) throw new Error('Unsupported reading markup');
    const target = document.createElement(node.tagName.toLowerCase());
    for (const attr of node.attributes) {
      if (node.tagName === 'IMG' && ['src', 'alt', 'loading'].includes(attr.name)) continue;
      if (node.tagName === 'P' && attr.name === 'class' && ['reading-hanging', 'reading-hanging-wide', 'reading-indented'].includes(attr.value)) {
        target.setAttribute('class', attr.value);
        continue;
      }
      if (node.tagName === 'FIGURE' && attr.name === 'class' && attr.value === 'reading-art-parts') {
        target.setAttribute('class', 'reading-art-parts');
        continue;
      }
      if (attr.name === 'style') {
        target.setAttribute('style', proseStyle(node.tagName, attr.value));
        continue;
      }
      if (node.tagName === 'TH' && attr.name === 'scope' && ['row', 'col'].includes(attr.value)) {
        target.setAttribute(attr.name, attr.value);
        continue;
      }
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
