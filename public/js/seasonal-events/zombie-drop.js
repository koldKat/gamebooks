// Run the optional clicked-zombie fall, sprite collisions and persistent pixel splat.
const clamp=(value,min,max)=>Math.max(min,Math.min(Math.max(min,max),value));
export function createZombieDrop({layer,nodes,getColumns}) {
  const heads=new Map(),bumps=new Map(),motion=matchMedia('(prefers-reduced-motion: reduce)');
  let frame=null,last=0,disposed=false,visible=true;
  const reduced=()=>motion.matches||document.body.classList.contains('reduce-motion');
  const base=node=>({x:parseFloat(node.style.left)||0,y:parseFloat(node.style.top)||0,size:parseFloat(node.style.width)||40});
  function corridor(node){
    const b=base(node),center=b.x+b.size/2,columns=getColumns();
    return {left:Math.max(0,...columns.filter(c=>c.right<=center).map(c=>c.right)),right:Math.min(innerWidth,...columns.filter(c=>c.left>=center).map(c=>c.left))};
  }
  function position(body){
    const b=base(body.node),bounds=corridor(body.node),padding=b.size*.12;
    body.x=clamp(body.x,bounds.left+padding,bounds.right-b.size-padding);
    body.node.style.translate=(body.x-b.x).toFixed(2)+'px '+(body.y-b.y).toFixed(2)+'px';
  }
  function splat(body){
    const {node}=body,b=base(node);body.landed=true;body.y=innerHeight-b.size;
    // Read the SVG DOM: browsers serialize rects with closing tags, not source self-closing tags.
    const skull=[...node.querySelectorAll('rect')].filter(rect=>Number(rect.getAttribute('y'))<24).map(rect=>{
      const bone=rect.cloneNode(true);
      if(['#7c9566','#a0ae7c','#4b6048'].includes(bone.getAttribute('fill')))bone.setAttribute('fill','#e1d8ba');
      return bone.outerHTML;
    }).join('');
    node.innerHTML='<svg viewBox="0 0 48 48" focusable="false" aria-hidden="true" shape-rendering="crispEdges"><g class="halloween-splat__blood" fill="#731f32"><path d="M8 36h30v4h6v4h4v4H0v-4h4v-4h4z"/><rect x="2" y="38" width="4" height="2"/><rect x="40" y="34" width="4" height="2"/><rect x="10" y="46" width="28" height="2" fill="#a23a42"/></g><g class="halloween-splat__skull" transform="translate(0 12)">'+skull+'</g></svg>';
    node.dataset.dropState='splat';node.style.rotate='0deg';node.removeAttribute('role');node.removeAttribute('tabindex');node.removeAttribute('aria-label');node.setAttribute('aria-hidden','true');
    if(document.activeElement===node)node.blur();position(body);
  }
  function wake(){if(!disposed&&visible&&frame===null){last=0;frame=requestAnimationFrame(tick);}}
  function drop(node){
    if(heads.has(node)||node.hidden||!node.isConnected)return;
    const rect=node.getBoundingClientRect(),body={node,x:rect.left,y:rect.top,vx:0,vy:0,angle:0,landed:false,original:node.innerHTML,hits:new Map()};
    heads.set(node,body);node.dataset.dropState='falling';
    if(reduced())splat(body);else wake();
  }
  function collide(body,now){
    const b=base(body.node),radius=b.size*.37;
    for(const node of nodes){
      if(node===body.node||node.hidden||!node.isConnected||heads.has(node)||now-(body.hits.get(node)??-1000)<220)continue;
      const rect=node.getBoundingClientRect(),otherRadius=rect.width*.35;
      const dx=body.x+b.size/2-(rect.left+rect.width/2),dy=body.y+b.size/2-(rect.top+rect.height/2),distance=Math.hypot(dx,dy),reach=radius+otherRadius;
      if(distance>=reach||!distance)continue;
      const nx=dx/distance,ny=dy/distance,speed=body.vx*nx+body.vy*ny;
      if(speed>=0)continue;
      body.x+=nx*(reach-distance+1);body.y+=ny*(reach-distance+1);
      body.vx-=1.45*speed*nx;body.vy-=1.45*speed*ny;
      if(Math.abs(body.vx)<40)body.vx=nodes.indexOf(node)%2?75:-75;
      const bump=bumps.get(node)??{node,dx:0,dy:0,vx:0,vy:0};bump.vx-=nx*130;bump.vy-=ny*130;bumps.set(node,bump);
      body.hits.set(node,now);body.node.dataset.collisions=String(Number(body.node.dataset.collisions??0)+1);
    }
  }
  function tick(now){
    frame=null;if(disposed||!visible)return;
    const dt=last?Math.min(.035,(now-last)/1000):1/60;last=now;
    let falling=false;
    for(const body of heads.values()){
      if(body.landed)continue;
      if(reduced()){splat(body);continue;}
      const b=base(body.node),bounds=corridor(body.node);
      body.vy=Math.min(760,body.vy+900*dt);body.x+=body.vx*dt;body.y+=body.vy*dt;
      if(body.x<bounds.left+b.size*.12||body.x+b.size>bounds.right-b.size*.12)body.vx*=-.55;
      collide(body,now);
      if(body.y+b.size>=innerHeight){splat(body);continue;}
      body.angle+=body.vx*dt*.45;body.node.style.rotate=body.angle.toFixed(1)+'deg';position(body);falling=true;
    }
    for(const [node,bump]of bumps){
      bump.vx+=(-56*bump.dx-10*bump.vx)*dt;bump.vy+=(-56*bump.dy-10*bump.vy)*dt;
      bump.dx+=bump.vx*dt;bump.dy+=bump.vy*dt;
      const b=base(node),bounds=corridor(node);
      bump.dx=clamp(bump.dx,Math.max(-14,bounds.left-b.x+1),Math.min(14,bounds.right-b.x-b.size-1));bump.dy=clamp(bump.dy,-14,14);
      if(reduced()||!node.isConnected||Math.abs(bump.dx)+Math.abs(bump.dy)+Math.abs(bump.vx)+Math.abs(bump.vy)<.3){node.style.translate='';bumps.delete(node);}
      else node.style.translate=bump.dx.toFixed(2)+'px '+bump.dy.toFixed(2)+'px';
    }
    if(falling||bumps.size)frame=requestAnimationFrame(tick);
  }
  const click=event=>{const node=event.target.closest('[data-artwork="16"]');if(node&&layer.contains(node)){event.stopPropagation();drop(node);}};
  const keydown=event=>{if(['Enter',' '].includes(event.key)&&event.target.matches('[data-artwork="16"]')){event.preventDefault();drop(event.target);}};
  for(const node of nodes.filter(node=>node.dataset.artwork==='16')){
    node.dataset.interactive='zombie';node.setAttribute('role','button');node.tabIndex=0;node.setAttribute('aria-label','Drop the zombie head');node.removeAttribute('aria-hidden');
  }
  layer.addEventListener('click',click);layer.addEventListener('keydown',keydown);
  return {
    visible(value){visible=value;if(!value){cancelAnimationFrame(frame);frame=null;}else if([...heads.values()].some(h=>!h.landed)||bumps.size)wake();},
    layout(){for(const body of heads.values()){if(body.landed)body.y=innerHeight-base(body.node).size;position(body);}},
    dispose(){disposed=true;cancelAnimationFrame(frame);layer.removeEventListener('click',click);layer.removeEventListener('keydown',keydown);heads.clear();bumps.clear();}
  };
}
