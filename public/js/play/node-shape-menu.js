// Render and update the shared desktop/mobile node-shape picker.
import { NODE_SHAPES, normalizeNodeShape } from '../graph/node-shapes.js';
import { t } from '../i18n.js';

const icons = {
  circle:'<circle cx="12" cy="12" r="9"/>',
  roundedSquare:'<rect x="3" y="3" width="18" height="18" rx="4"/>',
  hexagon:'<path d="M7 3h10l5 9-5 9H7l-5-9Z"/>',
  triangle:'<path d="M12 2 23 21H1Z"/>',
  octagon:'<path d="M8 2h8l6 6v8l-6 6H8l-6-6V8Z"/>',
  trapezoid:'<path d="M7 3h10l5 18H2Z"/>',
};

export function initNodeShapePicker(container, onSelect) {
  container.classList.add('node-shape-grid');
  for (const shape of NODE_SHAPES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'node-shape-choice';
    button.dataset.shape = shape;
    const label = t('ctx.shape.'+shape);
    button.setAttribute('aria-label', label);
    button.setAttribute('data-tooltip', label);
    button.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">${icons[shape]}</svg>`;
    button.addEventListener('click', () => onSelect(shape));
    container.appendChild(button);
  }
}

export function updateNodeShapePicker(container, shape, disabled = false) {
  shape = normalizeNodeShape(shape);
  for (const button of container.querySelectorAll('[data-shape]')) {
    button.classList.toggle('active', button.dataset.shape === shape);
    button.setAttribute('aria-pressed', String(button.dataset.shape === shape));
    button.disabled = disabled;
  }
}
