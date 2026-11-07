// Preserve separate PDF artwork and text layers in a responsive original sheet.
import { bindReadingImageZoom } from './image-zoom.js';
export function mountReadingSourceSheets(container, bookId) {
  const imagePath = new RegExp(`^/api/books/${Number(bookId)}/reading-images/[a-f0-9]{64}\\.png$`);
  for (const sheet of container.querySelectorAll('figure.reading-source-sheet[data-source-width]')) {
    if (sheet.parentElement?.closest('figure.reading-source-sheet')) continue;
    sheet.replaceWith(copySourceSheet(sheet, container.ownerDocument, imagePath));
  }
  bindReadingImageZoom(container);
}

export function copySourceSheet(node, document, imagePath, { sectionLinks = true, depth = 0 } = {}) {
  if (depth > 1) throw new Error('Invalid source sheet nesting');
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
  attributes(node, ['class', 'data-source-width', 'data-source-height'], ['data-source-background', 'data-source-opacity', 'data-source-mask', ...(depth ? ['data-source-box'] : [])]);
  const background = node.getAttribute('data-source-background');
  if (background !== null && background !== 'transparent') throw new Error('Invalid source sheet background');
  const width = number(node.getAttribute('data-source-width'));
  const height = number(node.getAttribute('data-source-height'));
  if (width < 100 || width > 4000 || height < 100 || height > 4000) throw new Error('Invalid source sheet dimensions');
  const figure = document.createElement('figure');
  figure.className = 'reading-source-sheet';
  figure.setAttribute('style', `position:relative;width:100%;max-width:${width}px;aspect-ratio:${width}/${height};container-type:inline-size;overflow:hidden;background:${background || '#fff'};margin:1em auto`);
  // Apply PDF transparency to the complete image, keeping adjoining native bands
  // and differently sized source masks unchanged.
  const paintStyles = [];
  const opacity = node.getAttribute('data-source-opacity');
  if (opacity !== null) {
    const value = number(opacity);
    if (value > 1) throw new Error('Invalid source sheet opacity');
    paintStyles.push(`opacity:${value}`);
  }
  const sheetMask = node.getAttribute('data-source-mask');
  if (sheetMask !== null) {
    if (!imagePath.test(sheetMask)) throw new Error('Invalid source sheet mask');
    paintStyles.push(`mask-image:url("${sheetMask}");mask-mode:luminance;mask-size:100% 100%;mask-repeat:no-repeat`);
  }
  const paintGroup = paintStyles.length ? document.createElement('div') : figure;
  if (paintGroup !== figure) {
    paintGroup.setAttribute('style', `position:absolute;inset:0;${paintStyles.join(';')}`);
    figure.append(paintGroup);
  }
  const children = [...node.childNodes].filter(n => n.nodeType !== 3 || n.textContent.trim());
  if (!children.length || children.length > 200 || !children.some(n => n.tagName === 'IMG' || n.tagName === 'FIGURE')) throw new Error('Invalid source sheet content');
  for (const child of children) {
    if (child.tagName === 'IMG') attributes(child, ['src', 'data-source-box'], ['alt', 'loading', 'data-source-mask', 'data-source-affine']);
    else if (child.tagName === 'P') attributes(child, ['data-source-box', 'data-source-font', 'data-source-baseline', 'data-source-weight']);
    else if (child.tagName === 'A') attributes(child, ['href', 'data-source-box', 'aria-label']);
    else if (child.tagName === 'FIGURE' && child.getAttribute('class') === 'reading-source-sheet'
        && child.getAttribute('data-source-box') !== null) { /* Validated recursively below. */ }
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
      // Fractional responsive sizes can leave a white rasterization seam between
      // adjoining native strips. Extend only shared edges; terminal edges stay exact.
      const continues = children.some(next => {
        if (next === child || next.tagName !== 'IMG') return false;
        const [nx, ny, nr] = next.getAttribute('data-source-box').split(',').map(Number);
        return nx === x && ny === bottom && nr === right;
      });
      const imageHeight = `${100 * (bottom - y) / height}%`;
      const affine = child.getAttribute('data-source-affine');
      // Transformed strips need a full pixel to cover antialiased shared edges.
      const overlap = affine === null ? '.5' : '1';
      layer.setAttribute('style', `position:absolute;left:${100 * x / width}%;top:${100 * y / height}%;width:${100 * (right - x) / width}%;height:${continues ? `calc(${imageHeight} + ${overlap}px)` : imageHeight};max-width:none;margin:0`);
      const mask = child.getAttribute('data-source-mask');
      if (mask !== null) {
        if (!imagePath.test(mask)) throw new Error('Invalid source sheet mask');
        layer.setAttribute('style', layer.getAttribute('style') + `;mask-image:url("${mask}");mask-mode:luminance;mask-size:100% 100%;mask-repeat:no-repeat`);
      }
      if (affine !== null) {
        const values = affine.split(',');
        if (values.length !== 6 || values.some(v => !/^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(v) || Math.abs(Number(v)) > 2)) throw new Error('Invalid source sheet transform');
        const [a, b, c, d, e, f] = values.map(Number);
        if (Math.abs(a * d - b * c) < 1e-8 || [[0, 0], [1, 0], [0, 1], [1, 1]].some(([u, v]) => {
          const px = a * u + c * v + e, py = b * u + d * v + f;
          return px < -1e-6 || px > 1.000001 || py < -1e-6 || py > 1.000001;
        })) throw new Error('Invalid source sheet transform');
        const ratio = (bottom - y) / (right - x);
        layer.setAttribute('style', layer.getAttribute('style') + `;transform-origin:0 0;transform:translate(${100 * e}%,${100 * f}%) matrix(${a},${b * ratio},${c / ratio},${d},0,0)`);
      }
    } else if (child.tagName === 'FIGURE') {
      layer = copySourceSheet(child, document, imagePath, { sectionLinks, depth: depth + 1 });
      layer.setAttribute('style', layer.getAttribute('style') + `;position:absolute;left:${100 * x / width}%;top:${100 * y / height}%;width:${100 * (right - x) / width}%;height:${100 * (bottom - y) / height}%;max-width:none;margin:0`);
    } else if (child.tagName === 'A') {
      const href = child.getAttribute('href'), label = child.getAttribute('aria-label');
      if ((!/^#section-(?:[1-9]\d{0,5}[a-zA-Z]?|[a-zA-Z][a-zA-Z0-9_-]{0,63})$/.test(href)
          && !/^#map\d{1,6}$/.test(href))
          || !label.trim() || label.length > 2000 || child.childNodes.length) throw new Error('Invalid source sheet choice');
      layer = document.createElement(sectionLinks ? 'a' : 'span');
      if (sectionLinks) layer.setAttribute('href', href);
      layer.setAttribute('aria-label', label);
      layer.setAttribute('style', `position:absolute;left:${100 * x / width}%;top:${100 * y / height}%;width:${100 * (right - x) / width}%;height:${100 * (bottom - y) / height}%;display:block;background:transparent;z-index:1`);
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
    paintGroup.append(layer);
  }
  return figure;
}
