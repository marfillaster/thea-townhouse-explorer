// One ceiling at a time: grow a conduit tree from the riser, adding the next
// light or switch drop by its cheapest straight run. Each wall crossed costs a
// fixed length penalty, so runs prefer to share a penetration or pass through
// a switch drop. Runs stay over slab regions so none crosses an open void.
import { distance, project, wallCrossings, withinRegions } from './conduit-geometry.mjs?v=conduit-routing-7';
export function planCeilingConduits({seeds,terminals,walls=[],regions=[],wallPenalty=3}){
 const segments=seeds.map(s=>s.length===1?[s[0],s[0]]:s),pending=new Map(terminals.map(t=>[t.id,t])),links=[];
 while(pending.size){
  let best;
  for(const terminal of pending.values())for(const [a,b] of segments)for(const from of [project(terminal.point,a,b),a,b]){
   if(!withinRegions(from,terminal.point,regions))continue;
   const crossings=wallCrossings(from,terminal.point,walls),length=distance(from,terminal.point),cost=length+wallPenalty*crossings;
   if(!best||cost<best.cost-1e-9)best={terminal,from,crossings,length,cost};
  }
  if(!best)throw new Error('No ceiling route within the slab regions for '+[...pending.keys()].join(', '));
  const {terminal,from,crossings,length}=best;
  links.push({id:terminal.id,from,to:terminal.point,crossings,length});
  segments.push([from,terminal.point]);pending.delete(terminal.id);
 }
 return {links,length:links.reduce((n,l)=>n+l.length,0),crossings:links.reduce((n,l)=>n+l.crossings,0)};
}
