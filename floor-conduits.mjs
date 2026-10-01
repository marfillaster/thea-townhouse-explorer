// One circuit at a time: share a floor channel beside each physical wall,
// then connect those channels with the cheapest available straight links. Each
// wall crossed costs a fixed length penalty and links stay over the floor slab.
// Doorways are open at floor level: a link may pass under one, straight or with
// a single turn at the doorway centre. A link may also turn once just past a
// wall end to clear it. Turns never exceed 90°.
import { distance, project, wallCrossings, withinRegions } from './conduit-geometry.mjs?v=conduit-routing-7';
function candidatePairs(a,b,c,d){
 const pairs=[[a,project(a,c,d)],[b,project(b,c,d)],[project(c,a,b),c],[project(d,a,b),d]];
 const ux=b[0]-a[0],uz=b[1]-a[1],vx=d[0]-c[0],vz=d[1]-c[1],cross=ux*vz-uz*vx;
 if(Math.abs(cross)>1e-9){
  const dx=c[0]-a[0],dz=c[1]-a[1],t=(dx*vz-dz*vx)/cross,s=(dx*uz-dz*ux)/cross;
  if(t>=0&&t<=1&&s>=0&&s<=1){const p=[a[0]+ux*t,a[1]+uz*t];pairs.push([p,p]);}
 }
 return pairs.map(([from,to])=>({from,to,length:distance(from,to)}));
}
export function planFloorConduits(start,outlets,wallClearance=.104,{walls=[],regions=[],doorways=[],wallPenalty=3}={}){
 // Turning points just beyond each free wall end, on the wall's own line.
 const clear=.12,corners=walls.flatMap(w=>{const length=distance(w.a,w.b),u=[(w.b[0]-w.a[0])/length,(w.b[1]-w.a[1])/length];return [[w.a[0]-u[0]*clear,w.a[1]-u[1]*clear],[w.b[0]+u[0]*clear,w.b[1]+u[1]*clear]];})
  .filter(p=>withinRegions(p,p,regions)&&!walls.some(w=>distance(project(p,w.a,w.b),p)<clear-1e-6));
 const byWall=new Map();
 for(const outlet of outlets){
  const key=outlet.wall.id;
  if(!byWall.has(key))byWall.set(key,[]);
  byWall.get(key).push(outlet);
 }
 const groups=[...byWall].map(([wallId,members])=>{
  const wall=members[0].wall,length=distance(wall.a,wall.b),direction=[(wall.b[0]-wall.a[0])/length,(wall.b[1]-wall.a[1])/length];
  // Prefer a room-facing side over an exterior face; on a partition use the
  // side with more outlets. Both faces still share the same buried channel.
  const sides=new Map();
  for(const m of members){const key=m.normal.join(',');if(!sides.has(key))sides.set(key,{normal:m.normal,score:0});sides.get(key).score+=m.exterior?1:2;}
  // An exterior-only wall is still fed from the room side.
  if(members.every(m=>m.exterior))for(const side of sides.values())side.normal=side.normal.map(v=>-v||0);
  const layout=normal=>{
   const taps=members.map(m=>{
    const along=(m.point[0]-wall.a[0])*direction[0]+(m.point[1]-wall.a[1])*direction[1];
    const wallPoint=[wall.a[0]+direction[0]*along,wall.a[1]+direction[1]*along];
    return {id:m.id,wallCode:m.wallCode,wallPoint,point:[wallPoint[0]+normal[0]*wallClearance,wallPoint[1]+normal[1]*wallClearance],along};
   }).sort((a,b)=>a.along-b.along);
   const points=[taps[0].point,taps.at(-1).point],fits=withinRegions(...points,regions)&&!wallCrossings(...points,walls);
   return {wallId,normal,taps,points,fits};
  };
  // The channel itself must stay on slab and clear of other walls.
  const options=[...sides.values()].sort((a,b)=>b.score-a.score).map(side=>layout(side.normal));
  const opposite=layout(options[0].normal.map(v=>-v||0));
  return options.find(o=>o.fits)??(opposite.fits?opposite:options[0]);
 });
 const pending=new Set(groups),connected=[[start,start]],links=[];
 while(pending.size){
  let best;
  const consider=(group,points)=>{
   // A turn may deflect the run by at most 90°, so it never doubles back.
   if(points.length===3){const [a,m,b]=points;if((m[0]-a[0])*(b[0]-m[0])+(m[1]-a[1])*(b[1]-m[1])<0)return;}
   let length=0,crossings=0;
   for(let i=1;i<points.length;i++){
    if(!withinRegions(points[i-1],points[i],regions))return;
    length+=distance(points[i-1],points[i]);crossings+=wallCrossings(points[i-1],points[i],walls);
   }
   const cost=length+wallPenalty*crossings;
   if(!best||cost<best.cost-1e-9)best={group,points,length,crossings,cost};
  };
  for(const group of pending)for(const segment of connected){
   for(const pair of candidatePairs(...segment,...group.points))consider(group,[pair.from,pair.to]);
   for(const corner of corners)consider(group,[project(corner,...segment),corner,project(corner,...group.points)]);
   for(const door of doorways){
    // Only a path that actually passes through the doorway, side to side.
    const from=project(door.point,...segment),to=project(door.point,...group.points);
    const side=p=>(p[0]-door.point[0])*door.along[1]-(p[1]-door.point[1])*door.along[0];
    if(side(from)*side(to)<0)consider(group,[from,door.point,to]);
   }
  }
  if(!best)throw new Error('No floor link within the slab regions for '+[...pending].map(g=>g.wallId).join(', '));
  const {group,points,length,crossings}=best;
  if(length>1e-6)links.push({wallId:group.wallId,points:points.filter((p,i)=>!i||distance(p,points[i-1])>1e-6),crossings});
  connected.push(group.points);pending.delete(group);
 }
 return {groups,links};
}
