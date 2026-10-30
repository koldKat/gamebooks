const ELEMENTS = new Set(['P', 'H2', 'H3', 'H4', 'OL', 'UL', 'LI', 'STRONG', 'EM', 'U', 'BR', 'HR', 'FIGURE', 'FIGCAPTION', 'IMG',
  'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TH', 'TD', 'CAPTION', 'A']);

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
export function renderReadingMatter(mount, bookId, text, document, { sectionLinks = true } = {}) {
  if (!/^\s*<(?:p|h[2-4]|ol|ul|figure|table)[\s>]/i.test(text)) return false;
  const template = document.createElement('template');
  template.innerHTML = text;
  const imagePath = new RegExp(`^/api/books/${Number(bookId)}/reading-images/[a-f0-9]{64}\\.png$`);
  function copySourceFrame(node) {
    const names = ['class', 'data-source-width', 'data-source-height', 'data-heading-box', 'data-body-box', 'data-font-size', 'data-line-height'];
    if (node.attributes.length !== names.length || [...node.attributes].some(a => !names.includes(a.name))) throw new Error('Invalid source frame');
    const number = name => {
      const value = node.getAttribute(name);
      if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(value)) throw new Error('Invalid source geometry');
      return Number(value);
    };
    const width = number('data-source-width'), height = number('data-source-height');
    const font = number('data-font-size'), line = number('data-line-height');
    if (width < 100 || width > 4000 || height < 100 || height > 4000 || font < 10 || font > 24 || line < font || line > 36) throw new Error('Source geometry out of range');
    const box = name => {
      const values = node.getAttribute(name).split(',');
      if (values.length !== 4 || values.some(v => !/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(v))) throw new Error('Invalid source box');
      const [x, y, right, bottom] = values.map(Number);
      if (!(x >= 0 && y >= 0 && x < right && y < bottom && right <= width && bottom <= height)) throw new Error('Source box out of range');
      return { x, y, width: right - x };
    };
    const headingBox = box('data-heading-box'), bodyBox = box('data-body-box');
    const children = [...node.childNodes].filter(n => n.nodeType !== 3 || n.textContent.trim());
    if (children.length !== 2 || children[0].tagName !== 'IMG' || children[1].tagName !== 'FIGCAPTION' || children[1].attributes.length) throw new Error('Invalid source frame content');
    const prose = [...children[1].childNodes].filter(n => n.nodeType !== 3 || n.textContent.trim());
    if (prose.length < 2 || prose[0].tagName !== 'H3' || prose.slice(1).some(n => n.tagName !== 'P')) throw new Error('Invalid framed prose');
    const figure = document.createElement('figure'), canvas = document.createElement('div');
    figure.setAttribute('style', 'max-width:100%;overflow-x:auto;margin:1em 0');
    canvas.setAttribute('style', `position:relative;width:${width}px;height:${height}px`);
    const image = copy(children[0]);
    image.setAttribute('style', `position:absolute;left:0;top:0;width:${width}px;height:${height}px;max-width:none;margin:0`);
    const heading = copy(prose[0]), body = document.createElement('div');
    heading.setAttribute('style', `${heading.getAttribute('style') || ''};position:absolute;left:${headingBox.x}px;top:${headingBox.y}px;width:${headingBox.width}px;font-size:${font + 4}px;line-height:${line + 4}px;color:#111;margin:0;text-align:center`);
    body.setAttribute('style', `position:absolute;left:${bodyBox.x}px;top:${bodyBox.y}px;width:${bodyBox.width}px;font-size:${font}px;line-height:${line}px;color:#111`);
    body.append(...prose.slice(1).map(copy));
    canvas.append(image, heading, body); figure.append(canvas);
    return figure;
  }
  function copy(node) {
    if (node.nodeType === 3) return document.createTextNode(node.textContent);
    if (node.nodeType !== 1 || !ELEMENTS.has(node.tagName)) throw new Error('Unsupported reading markup');
    if (node.tagName === 'FIGURE' && node.getAttribute('class') === 'reading-source-frame') return copySourceFrame(node);
    const target = document.createElement(node.tagName === 'A' && !sectionLinks ? 'span' : node.tagName.toLowerCase());
    for (const attr of node.attributes) {
      if (node.tagName === 'IMG' && ['src', 'alt', 'loading'].includes(attr.name)) continue;
      if (node.tagName === 'A' && attr.name === 'href' && /^#section-[1-9]\d{0,5}$/.test(attr.value)) {
        if (sectionLinks) target.setAttribute('href', attr.value);
        continue;
      }
      if (node.tagName === 'TABLE' && attr.name === 'class' && ['reading-encounter-table', 'reading-wide-table'].includes(attr.value)) {
        target.setAttribute('class', attr.value);
        continue;
      }
      if (node.tagName === 'IMG' && attr.name === 'class' && attr.value === 'reading-inline-symbol') {
        target.setAttribute('class', attr.value);
        continue;
      }
      if (node.tagName === 'P' && attr.name === 'class' && ['reading-hanging', 'reading-hanging-wide', 'reading-indented'].includes(attr.value)) {
        target.setAttribute('class', attr.value);
        continue;
      }
      if (node.tagName === 'FIGURE' && attr.name === 'class' && ['reading-art-parts', 'reading-art-stack', 'reading-table-scroll'].includes(attr.value)) {
        target.setAttribute('class', attr.value);
        continue;
      }
      if (node.tagName === 'FIGURE' && node.getAttribute('class') === 'reading-table-scroll'
          && ((attr.name === 'tabindex' && attr.value === '0')
            || (attr.name === 'aria-label' && attr.value === 'Wide table: scroll horizontally'))) {
        target.setAttribute(attr.name, attr.value);
        continue;
      }
      if (node.tagName === 'FIGURE' && attr.name === 'data-source-width-percent' && node.getAttribute('class') === 'reading-art-stack') {
        if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(attr.value) || Number(attr.value) <= 0 || Number(attr.value) > 100) throw new Error('Invalid image width');
        target.setAttribute('style', `width:${Number(attr.value)}%`);
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
