import { rectangularRegions } from './measurements.mjs';

export function wallFootprint(wall,start=0,end=Math.hypot(wall.b[0]-wall.a[0],wall.b[1]-wall.a[1])){
 const length=Math.hypot(wall.b[0]-wall.a[0],wall.b[1]-wall.a[1]),dx=(wall.b[0]-wall.a[0])/length,dz=(wall.b[1]-wall.a[1])/length;
 const x0=wall.a[0]+dx*start,x1=wall.a[0]+dx*end,z0=wall.a[1]+dz*start,z1=wall.a[1]+dz*end;
 return {x0:Math.min(x0,x1)-(dx===0?.075:0),x1:Math.max(x0,x1)+(dx===0?.075:0),z0:Math.min(z0,z1)-(dz===0?.075:0),z1:Math.max(z0,z1)+(dz===0?.075:0)};
}

// Room extents come from room-facing wall-code spans. Open-plan limits (for
// example LR/DR) use those same span divisions, with no invented partition.
// The union of all floor surfaces supplies coverage, independent of slab seams.
export function buildRoomFloorPlans(walls,faces,surfaces){
 const groups=new Map();
 for(const face of faces.filter(f=>f.type==='I'&&!f.extension&&f.room!=='ST')){
  const key=`${face.floor}:${face.room}`;
  if(!groups.has(key))groups.set(key,{code:face.room,floor:face.floor,points:[]});
  const wall=walls.find(w=>w.id===face.wallId),length=Math.hypot(wall.b[0]-wall.a[0],wall.b[1]-wall.a[1]);
  for(const along of [face.start,face.end])groups.get(key).points.push([wall.a[0]+(wall.b[0]-wall.a[0])*along/length,wall.a[1]+(wall.b[1]-wall.a[1])*along/length]);
 }
 return [...groups.values()].map(({points,...room})=>{
  const bounds={x0:Math.min(...points.map(p=>p[0])),x1:Math.max(...points.map(p=>p[0])),z0:Math.min(...points.map(p=>p[1])),z1:Math.max(...points.map(p=>p[1]))};
  const regions=rectangularRegions([bounds],walls.filter(w=>w.floor===room.floor).map(w=>wallFootprint(w)),surfaces.filter(s=>s.floor===room.floor));
  return {...room,bounds,regions};
 }).filter(room=>room.regions.length);
}
export function roomAtPoint(rooms,floor,x,z){
 const inside=r=>x>=r.x0-1e-6&&x<=r.x1+1e-6&&z>=r.z0-1e-6&&z<=r.z1+1e-6;
 return rooms.find(r=>r.floor===floor&&r.regions.some(inside))??rooms.find(r=>r.floor===floor&&inside(r.bounds));
}
