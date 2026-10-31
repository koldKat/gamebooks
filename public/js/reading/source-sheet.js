// Preserve separate PDF artwork and text layers in a responsive, inert original sheet.
export function copySourceSheet(node, document, imagePath) {
  const attributes = (element, required, optional = []) => {
    if (required.some(name => element.getAttribute(name) === null)
        || [...element.attributes].some(a => !required.includes(a.name) && !optional.includes(a.name))) {
      throw new Error('Invalid source sheet attributes');
    }
  };
  const number = value => {
    if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(value)) throw new Error('Invalid source sheet number');
    return Number(value);
  };
  attributes(node, ['class', 'data-source-width', 'data-source-height']);
  const width = number(node.getAttribute('data-source-width'));
  const height = number(node.getAttribute('data-source-height'));
  if (width < 100 || width > 4000 || height < 100 || height > 4000) throw new Error('Invalid source sheet dimensions');
  const figure = document.createElement('figure');
  figure.setAttribute('style', `position:relative;width:100%;max-width:${width}px;aspect-ratio:${width}/${height};container-type:inline-size;overflow:hidden;background:#fff;margin:1em auto`);
  const children = [...node.childNodes].filter(n => n.nodeType !== 3 || n.textContent.trim());
  if (!children.length || children.length > 200 || !children.some(n => n.tagName === 'IMG')) throw new Error('Invalid source sheet content');
  for (const child of children) {
    if (child.tagName === 'IMG') attributes(child, ['src', 'data-source-box'], ['alt', 'loading']);
    else if (child.tagName === 'P') attributes(child, ['data-source-box', 'data-source-font', 'data-source-baseline', 'data-source-weight']);
    else throw new Error('Invalid source sheet layer');
    const box = child.getAttribute('data-source-box').split(',').map(number);
    const [x, y, right, bottom] = box;
    if (box.length !== 4 || !(x < right && y < bottom && right <= width && bottom <= height)) throw new Error('Invalid source sheet box');
    let layer;
    if (child.tagName === 'IMG') {
      const src = child.getAttribute('src');
      if (!imagePath.test(src) || child.childNodes.length) throw new Error('Invalid source sheet image');
      layer = document.createElement('img');
      layer.src = src; layer.alt = child.getAttribute('alt') || ''; layer.loading = 'lazy';
      layer.setAttribute('style', `position:absolute;left:${100 * x / width}%;top:${100 * y / height}%;width:${100 * (right - x) / width}%;height:${100 * (bottom - y) / height}%;max-width:none;margin:0`);
    } else {
      const font = number(child.getAttribute('data-source-font'));
      const baseline = number(child.getAttribute('data-source-baseline'));
      const weight = child.getAttribute('data-source-weight');
      if (font < 8 || font > 100 || baseline < y || baseline > bottom || !['normal', 'bold'].includes(weight)
          || [...child.childNodes].some(n => n.nodeType !== 3)) throw new Error('Invalid source sheet text');
      layer = document.createElement('p');
      layer.append(document.createTextNode(child.textContent));
      layer.setAttribute('style', `position:absolute;left:${100 * x / width}%;top:${100 * (baseline - .8 * font) / height}%;margin:0;padding:0;color:#111;font-family:"Times New Roman",serif;font-size:${100 * font / width}cqw;font-weight:${weight};line-height:1;white-space:pre;text-align:left`);
    }
    figure.append(layer);
  }
  return figure;
}
