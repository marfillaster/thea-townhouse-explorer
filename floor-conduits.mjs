// One circuit at a time: share a floor channel beside each physical wall,
// then connect those channels with the shortest available straight links.
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const project=(p,a,b)=>{
 const dx=b[0]-a[0],dz=b[1]-a[1],length2=dx*dx+dz*dz;
 const t=length2?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/length2)):0;
 return [a[0]+dx*t,a[1]+dz*t];
};
function closestPair(a,b,c,d){
 const pairs=[[a,project(a,c,d)],[b,project(b,c,d)],[project(c,a,b),c],[project(d,a,b),d]];
 const ux=b[0]-a[0],uz=b[1]-a[1],vx=d[0]-c[0],vz=d[1]-c[1],cross=ux*vz-uz*vx;
 if(Math.abs(cross)>1e-9){
  const dx=c[0]-a[0],dz=c[1]-a[1],t=(dx*vz-dz*vx)/cross,s=(dx*uz-dz*ux)/cross;
  if(t>=0&&t<=1&&s>=0&&s<=1){const p=[a[0]+ux*t,a[1]+uz*t];pairs.push([p,p]);}
 }
 return pairs.map(([from,to])=>({from,to,length:distance(from,to)})).sort((a,b)=>a.length-b.length)[0];
}
export function planFloorConduits(start,outlets,wallClearance=.104){
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
  const normal=[...sides.values()].sort((a,b)=>b.score-a.score)[0].normal;
  const taps=members.map(m=>{
   const along=(m.point[0]-wall.a[0])*direction[0]+(m.point[1]-wall.a[1])*direction[1];
   const wallPoint=[wall.a[0]+direction[0]*along,wall.a[1]+direction[1]*along];
   return {id:m.id,wallCode:m.wallCode,wallPoint,point:[wallPoint[0]+normal[0]*wallClearance,wallPoint[1]+normal[1]*wallClearance],along};
  }).sort((a,b)=>a.along-b.along);
  return {wallId,normal,taps,points:[taps[0].point,taps.at(-1).point]};
 });
 const pending=new Set(groups),connected=[[start,start]],links=[];
 while(pending.size){
  let best;
  for(const group of pending)for(const segment of connected){
   const pair=closestPair(...segment,...group.points);
   if(!best||pair.length<best.length-1e-9)best={...pair,group};
  }
  const {group,from,to,length}=best;
  if(length>1e-6)links.push({wallId:group.wallId,points:[from,to]});
  connected.push(group.points);pending.delete(group);
 }
 return {groups,links};
}
