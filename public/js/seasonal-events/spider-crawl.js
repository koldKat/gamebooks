// Move free-standing spiders slowly through clear gaps, turning away from obstacles.
export function createSpiderCrawl({nodes,getObstacles,random=Math.random}) {
  const spiders=nodes.filter(n=>n.dataset.kind==='7').map(node=>({node,x:0,y:0,size:0,angle:random()*Math.PI*2,turnAt:0}));
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  let frame=null,last=0,visible=true,disposed=false,obstacles=[];
  const reduced=()=>motion.matches||document.body.classList.contains('reduce-motion');
  const blocked=(body,x,y)=>{
    // Reserve the rotated square's full diagonal so legs cannot enter adjacent panels.
    const padding=body.size*(Math.SQRT2-1)/2+2,left=x-padding,top=y-padding,right=x+body.size+padding,bottom=y+body.size+padding;
    return left<0||top<0||right>innerWidth||bottom>innerHeight
    ||obstacles.some(r=>left<r.right+3&&right>r.left-3&&top<r.bottom+3&&bottom>r.top-3)
    ||nodes.some(n=>{
      if(n===body.node||n.hidden||!n.isConnected)return false;
      const other=spiders.find(s=>s.node===n),size=parseFloat(n.style.width)||0;
      const left=other?other.x:parseFloat(n.style.left),top=other?other.y:parseFloat(n.style.top);
      return x<left+size*.85&&x+body.size>left+size*.15&&y<top+size*.85&&y+body.size>top+size*.15;
    });
  };
  function paint(body){
    body.node.style.translate=(body.x-parseFloat(body.node.style.left)).toFixed(2)+'px '+(body.y-parseFloat(body.node.style.top)).toFixed(2)+'px';
    // The head points down in the original pixel drawing. Account for horizontal mirroring.
    body.node.style.rotate=(body.angle*180/Math.PI-90).toFixed(1)+'deg';
  }
  function wake(){if(frame===null&&!disposed&&visible&&!document.hidden&&!reduced()&&spiders.some(b=>b.node.isConnected&&!b.node.hidden)){last=0;frame=requestAnimationFrame(tick);}}
  function tick(now){
    frame=null;if(disposed||!visible||document.hidden||reduced())return;
    if(last&&now-last<80){frame=requestAnimationFrame(tick);return;}
    const dt=last?Math.min(.18,(now-last)/1000):.08;last=now;
    for(const body of spiders){
      if(body.node.hidden||!body.node.isConnected)continue;
      if(now>=body.turnAt){body.angle+=(random()-.5)*1.2;body.turnAt=now+7000+random()*11000;}
      const speed=4.5,x=body.x+Math.cos(body.angle)*speed*dt,y=body.y+Math.sin(body.angle)*speed*dt;
      if(blocked(body,x,y)){
        for(let tries=0;tries<12;tries++){
          body.angle+=Math.PI*(.35+random()*.7);
          const tx=body.x+Math.cos(body.angle)*2,ty=body.y+Math.sin(body.angle)*2;
          if(!blocked(body,tx,ty))break;
        }
        body.turnAt=now+5000+random()*8000;
      }else{body.x=x;body.y=y;}
      paint(body);
    }
    frame=requestAnimationFrame(tick);
  }
  function sync(){cancelAnimationFrame(frame);frame=null;wake();}
  document.addEventListener('visibilitychange',sync);motion.addEventListener('change',sync);
  return {
    visible(value){visible=value;sync();},
    layout(){
      obstacles=getObstacles();
      for(const body of spiders){body.x=parseFloat(body.node.style.left)||0;body.y=parseFloat(body.node.style.top)||0;body.size=parseFloat(body.node.style.width)||0;body.node.style.translate='';body.node.style.rotate='';}
      sync();
    },
    dispose(){disposed=true;cancelAnimationFrame(frame);document.removeEventListener('visibilitychange',sync);motion.removeEventListener('change',sync);}
  };
}
