// Keep mouse companions close to the pointer while their bodies fit the viewport.
export function cursorPosition(point, width, height, viewportWidth, viewportHeight) {
  const place = (pointer, size, limit) => Math.max(0, Math.min(limit - size,
    pointer + size + 14 > limit ? pointer - size - 6 : pointer + 14));
  return { x: place(point.x, width, viewportWidth), y: place(point.y, height, viewportHeight) };
}
