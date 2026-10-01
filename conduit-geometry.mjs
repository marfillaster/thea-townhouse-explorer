// Plan-view checks shared by the ceiling and floor conduit planners.
const EPS=1e-6;
export const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
export function project(p,a,b){
 const dx=b[0]-a[0],dz=b[1]-a[1],length2=dx*dx+dz*dz;
 const t=length2?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/length2)):0;
 return [a[0]+dx*t,a[1]+dz*t];
}
// Proper crossings only. A run that starts or ends on a wall line, or in the
// chase on one face, does not penetrate that wall; leaving a face chase toward
// the far side does.
export function wallCrossings(a,b,walls){
 let count=0;
 const ux=b[0]-a[0],uz=b[1]-a[1],runLength=Math.hypot(ux,uz);
 if(runLength<EPS)return 0;
 for(const wall of walls){
  const vx=wall.b[0]-wall.a[0],vz=wall.b[1]-wall.a[1],wallLength=Math.hypot(vx,vz),cross=ux*vz-uz*vx;
  if(Math.abs(cross)<EPS)continue;
  const dx=wall.a[0]-a[0],dz=wall.a[1]-a[1],t=(dx*vz-dz*vx)/cross,s=(dx*uz-dz*ux)/cross;
  const margin=(wall.thickness??.15)/2/wallLength,end=.01/runLength;
  if(t>end&&t<1-end&&s>=-margin&&s<=1+margin)count++;
 }
 return count;
}
// At floor level a doorway has no wall, so a floor channel passes under it
// freely. Split each wall into the solid spans either side of its doors.
export function wallsWithoutDoors(walls,openings){
 const spans=[];
 for(const wall of walls){
  const length=distance(wall.a,wall.b),dir=[(wall.b[0]-wall.a[0])/length,(wall.b[1]-wall.a[1])/length];
  const gaps=openings.filter(o=>o.wall===wall.id&&o.code?.startsWith('D')).map(o=>{const c=(o.x-wall.a[0])*dir[0]+(o.z-wall.a[1])*dir[1];return [c-o.w/2,c+o.w/2];}).sort((a,b)=>a[0]-b[0]);
  let start=0;
  for(const [g0,g1] of [...gaps,[length,length]]){
   if(g0>start+EPS)spans.push({...wall,id:wall.id+(gaps.length?':'+start.toFixed(3):''),a:[wall.a[0]+dir[0]*start,wall.a[1]+dir[1]*start],b:[wall.a[0]+dir[0]*g0,wall.a[1]+dir[1]*g0],wallId:wall.id});
   start=Math.max(start,g1);
  }
 }
 return spans;
}
// Regions are slab edges at wall centerlines; drops sit inside the wall, so
// allow half a wall thickness.
const inside=(p,r,t)=>p[0]>=r.x0-t&&p[0]<=r.x1+t&&p[1]>=r.z0-t&&p[1]<=r.z1+t;
export function withinRegions(a,b,regions,tolerance=.075,step=.02){
 if(!regions?.length)return true;
 const n=Math.max(1,Math.ceil(distance(a,b)/step));
 for(let i=0;i<=n;i++){const p=[a[0]+(b[0]-a[0])*i/n,a[1]+(b[1]-a[1])*i/n];if(!regions.some(r=>inside(p,r,tolerance)))return false;}
 return true;
}
