// Merge same-color pixel rectangles into compact SVG paths inside each animation group.
export function compactPixelSvg(svg) {
  return svg.replace(/(?:<rect x="[\d.]+" y="[\d.]+" width="[\d.]+" height="[\d.]+" fill="[^"]+"\/>)+/g,run=>{
    const colors=new Map();
    for(const m of run.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)" fill="([^"]+)"\/>/g)){
      const [,x,y,w,h,fill]=m;
      colors.set(fill,(colors.get(fill)||'')+`M${x} ${y}h${w}v${h}h-${w}z`);
    }
    return [...colors].map(([fill,d])=>`<path fill="${fill}" d="${d}"/>`).join('');
  });
}
