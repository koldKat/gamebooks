// Define saved node shapes and draw the shapes absent from vis-network.
export const NODE_SHAPES = Object.freeze(['circle', 'roundedSquare', 'hexagon', 'triangle', 'octagon', 'trapezoid']);
export function normalizeNodeShape(shape) {
  return NODE_SHAPES.includes(shape) ? shape : 'circle';
}

export function nodeShapeOptions(shape, renderer, portal = false) {
  shape = normalizeNodeShape(shape);
  return {
    shape: portal ? 'diamond' : shape === 'circle' ? 'dot'
      : ['roundedSquare', 'octagon', 'trapezoid'].includes(shape) ? 'custom' : shape,
    ctxRenderer: renderer,
    shapeProperties: { borderRadius: shape === 'roundedSquare' ? 5 : 0 },
  };
}

// One stable renderer per graph reads current node options. Changing between custom
// shapes must not depend on vis-network replacing its captured renderer callback.
export function createNodeShapeRenderer(getShape, getChoice) {
  return ({ctx, id, x, y, style, label, state}) => {
    const radius = style.size;
    const choice = normalizeNodeShape(getChoice(id));
    return {
      nodeDimensions: {width:radius * 2, height:radius * 2},
      drawNode() {
        ctx.beginPath();
        if (choice === 'roundedSquare') ctx.roundRect(x-radius, y-radius, radius*2, radius*2, Math.min(5, radius/3));
        else {
          const corner = radius * (Math.SQRT2 - 1);
          const points = choice === 'trapezoid'
            ? [[-radius*.55,-radius],[radius*.55,-radius],[radius,radius],[-radius,radius]]
            : [[-corner,-radius],[corner,-radius],[radius,-corner],[radius,corner],
            [corner,radius],[-corner,radius],[-radius,corner],[-radius,-corner]];
          points.forEach(([dx,dy],i) => i ? ctx.lineTo(x+dx,y+dy) : ctx.moveTo(x+dx,y+dy));
          ctx.closePath();
        }
        ctx.fillStyle = style.color;
        ctx.fill();
        const transform = ctx.getTransform();
        const scale = Math.hypot(transform.a, transform.b) / (globalThis.devicePixelRatio || 1);
        ctx.lineWidth = style.borderWidth / (scale || 1);
        ctx.strokeStyle = style.borderColor;
        ctx.setLineDash(Array.isArray(style.borderDashes) ? style.borderDashes : []);
        if (style.borderWidth > 0) ctx.stroke();
      },
      drawExternalLabel() {
        // The bundled custom-shape adapter omits the native shape's label/bounds
        // update. Reuse those methods so fit, selection and labels match dots.
        const shape = getShape(id);
        if (!shape) return;
        if (label !== undefined) {
          shape.labelModule.calculateLabelSize(ctx, state.selected, state.hover, x, y, 'hanging');
          shape.labelModule.draw(ctx, x, y + radius + .5 * shape.labelModule.size.height,
            state.selected, state.hover, 'hanging');
        }
        shape.updateBoundingBox(x, y);
      },
    };
  };
}
