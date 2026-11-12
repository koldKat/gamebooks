// Persist only this simulator's fight, setup and one outcome per completed fight.
export function createState(getContext) {
  const read=()=>{
    const c=getContext();return Number(c.bookId)===3196?c.run()?.sim3196??null:null;
  };
  function change(update) {
    const c=getContext(),run=c.run();
    if(Number(c.bookId)!==3196||!run)return false;
    const before=run.sim3196,next=structuredClone(before??{schemaVersion:1,hp:12,modifier:0,unarmed:false,setup:null,fight:null,history:[],log:[]});
    if(next.schemaVersion!==1)throw new RangeError('Unsupported saved fight');
    update(next);
    if(next.fight){
      next.hp=next.fight.hp;
      if(next.fight.outcome&&!next.fight.recorded){
        next.fight.recorded=true;
        next.history.push({enemy:next.fight.enemies.map(e=>e.name).join(', '),outcome:next.fight.outcome,
          ts:Math.max(Date.now(),(next.history.at(-1)?.ts??0)+1)});
      }
    }
    next.log=next.log.slice(-100);
    const live=getContext();
    if(Number(live.bookId)!==3196||live.run()!==run||run.sim3196!==before)return false;
    run.sim3196=next;live.save();return true;
  }
  return {read,change};
}
