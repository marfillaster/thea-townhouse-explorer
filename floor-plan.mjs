import { wallFootprint } from './room-floors.mjs';

// 2D floor plan in canonical plan space (x, z), with dimension projections in
// two modes: "overall" measures to wall centrelines and outer faces, so wall
// thickness is included; "clear" measures between wall faces only.
const HALF=.075,EPS=1e-6;
const length=w=>Math.hypot(w.b[0]-w.a[0],w.b[1]-w.a[1]);
const pointAlong=(w,t)=>{const l=length(w);return [w.a[0]+(w.b[0]-w.a[0])*t/l,w.a[1]+(w.b[1]-w.a[1])*t/l];};
const unique=values=>values.sort((a,b)=>a-b).filter((v,i,a)=>!i||v-a[i-1]>EPS);
export const formatMetres=value=>value.toFixed(3).replace(/0+$/,'').replace(/\.$/,'');

// Wall solids split at openings. Ends extend half a thickness so corners close.
export function planWallSolids(walls,openings,floor){
 const solids=[];
 for(const wall of walls.filter(w=>w.floor===floor)){
  const l=length(wall),cuts=openings.filter(o=>o.wall===wall.id).map(o=>[o.at-o.w/2,o.at+o.w/2]).sort((a,b)=>a[0]-b[0]);
  let cursor=-HALF;
  for(const [start,end] of [...cuts,[l+HALF,l+HALF]]){if(start-cursor>EPS)solids.push({wallId:wall.id,...wallFootprint(wall,cursor,start)});cursor=end;}
 }
 return solids;
}

// Doors swing into the more private room, or inward on exterior walls, unless
// the placement marks them swing:'out'.
const swingPriority=['MB','R1','GR','B0','B1','KT','LR','DR','LD','CP','BL'];
export function planOpenings(walls,faces,openings,floor){
 return openings.filter(o=>o.floor===floor).map(o=>{
  const wall=walls.find(w=>w.id===o.wall),l=length(wall),dx=(wall.b[0]-wall.a[0])/l,dz=(wall.b[1]-wall.a[1])/l;
  const sides=faces.filter(f=>f.wallId===wall.id&&!f.extension&&f.type==='I'&&o.at>=f.start-EPS&&o.at<=f.end+EPS);
  sides.sort((a,b)=>swingPriority.indexOf(a.room)-swingPriority.indexOf(b.room));
  const side=(sides[0]?.normal??1)*(o.swing==='out'?-1:1),normal=dx===0?[side,0]:[0,side];
  // The hinge sits at start; hinge:'end' moves it to the jamb farther from wall.a.
  const [start,end]=[pointAlong(wall,o.at-o.w/2),pointAlong(wall,o.at+o.w/2)],flip=o.hinge==='end';
  return {id:o.id,code:o.code,kind:o.system==='doors'?'door':'window',width:o.w,start:flip?end:start,end:flip?start:end,direction:flip?[-dx,-dz]:[dx,dz],normal};
 });
}

// Rooms: "overall" spans wall centrelines (half of each bounding wall included);
// "clear" is the union of floor regions between wall faces.
export function planRooms(rooms,floor){
 return rooms.filter(r=>r.floor===floor).map(r=>{
  const clear={x0:Math.min(...r.regions.map(g=>g.x0)),x1:Math.max(...r.regions.map(g=>g.x1)),z0:Math.min(...r.regions.map(g=>g.z0)),z1:Math.max(...r.regions.map(g=>g.z1))};
  return {code:r.code,name:r.name,regions:r.regions,overall:r.bounds??clear,clear,secondary:r.secondary,area:r.regions.reduce((s,g)=>s+(g.x1-g.x0)*(g.z1-g.z0),0)};
 });
}

// Exterior dimension chains for each side. Positions are centrelines of the
// exterior walls on that side and of the walls meeting them.
const sides={north:{axis:'z',sign:-1},south:{axis:'z',sign:1},west:{axis:'x',sign:-1},east:{axis:'x',sign:1}};
export function exteriorChains(walls,faces,floor){
 const floorWalls=walls.filter(w=>w.floor===floor),chains=[];
 for(const [side,{axis,sign}] of Object.entries(sides)){
  // face.axis 'z' = wall at constant z; the exterior face normal points outward.
  const exterior=[...new Set(faces.filter(f=>f.floor===floor&&f.type==='E'&&!f.extension&&f.axis===axis&&f.normal===sign).map(f=>f.wallId))].map(id=>floorWalls.find(w=>w.id===id));
  if(!exterior.length)continue;
  const [u,v]=axis==='z'?[0,1]:[1,0];// u runs along the side, v across it
  const positions=[];
  for(const wall of exterior){
   const line=wall.a[v],lo=Math.min(wall.a[u],wall.b[u]),hi=Math.max(wall.a[u],wall.b[u]);positions.push(lo,hi);
   for(const other of floorWalls)if(other!==wall&&other.a[u]===other.b[u])for(const end of [other.a,other.b])if(Math.abs(end[v]-line)<EPS&&end[u]>lo-EPS&&end[u]<hi+EPS)positions.push(end[u]);
  }
  const p=unique(positions),edge=sign<0?Math.min(...exterior.map(w=>w.a[v]))-HALF:Math.max(...exterior.map(w=>w.a[v]))+HALF;
  const overall=[p[0]-HALF,...p.slice(1,-1),p.at(-1)+HALF];
  const bands=p.map(x=>[x-HALF,x+HALF]),faceStops=unique(bands.flat());
  const clear=faceStops.slice(1).map((b,i)=>{const a=faceStops[i];return {a,b,wall:bands.some(([s,e])=>a>=s-EPS&&b<=e+EPS)};});
  chains.push({side,axis,sign,edge,
   overall:overall.slice(1).map((b,i)=>({a:overall[i],b})),
   clear,
   total:{overall:{a:p[0]-HALF,b:p.at(-1)+HALF},clear:{a:p[0]+HALF,b:p.at(-1)-HALF}}});
 }
 return chains;
}

// Covers are built-out boxes on a wall face (a service-panel cover, a riser
// chase). They take floor area from the room they stand in.
export function buildFloorPlan({walls,faces,openings,rooms,fixtures=[],stairs=[],covers=[],floor}){
 const floorCovers=covers.filter(c=>c.floor===floor),planned=planRooms(rooms,floor);
 for(const c of floorCovers){
  const cx=(c.x0+c.x1)/2,cz=(c.z0+c.z1)/2,room=planned.find(r=>r.regions.some(g=>cx>g.x0&&cx<g.x1&&cz>g.z0&&cz<g.z1));
  if(room){room.area-=(c.x1-c.x0)*(c.z1-c.z0);(room.covers??=[]).push(c.label);}
 }
 return {floor,fixtures:fixtures.filter(f=>f.floor===floor),stairs:stairs.filter(t=>t.floor===floor),covers:floorCovers,walls:planWallSolids(walls,openings,floor),openings:planOpenings(walls,faces,openings,floor),rooms:planned,chains:exteriorChains(walls,faces,floor)};
}

// Plan styles live with the renderer so exported files carry them.
export const planStyles=`.plan-caption{fill:#98a8ba;font-size:.2px}
.plan-cover{fill:#5d6c7c;stroke:#c3cdd8;stroke-width:1;vector-effect:non-scaling-stroke}
.dim-cover path{stroke:#c3cdd8}.dim-cover .dim-text{fill:#c3cdd8;font-size:.1px}
.plan-fixture{fill:#3a4a5c;stroke:#c3cdd8;stroke-width:1;vector-effect:non-scaling-stroke}
.plan-sink{fill:#2a3a4c;stroke:#65bafa;stroke-width:1;vector-effect:non-scaling-stroke}
.plan-tread{fill:#2b3b4d;stroke:#c3cdd8;stroke-width:1;vector-effect:non-scaling-stroke}
.plan-tread.above-cut{fill:none;stroke:#7d8c9c;stroke-dasharray:3 2}
.plan-break{fill:none;stroke:#e7eef5;stroke-width:1.2;vector-effect:non-scaling-stroke}
.plan-walk{fill:none;stroke:#e7eef5;stroke-width:1;vector-effect:non-scaling-stroke}
.plan-walk-head,.plan-walk-start{fill:#e7eef5}
.stair-label{fill:#e7eef5;font-size:.12px;font-weight:600;text-anchor:middle;dominant-baseline:middle;paint-order:stroke;stroke:#0d1724;stroke-width:.04px}
.stair-note{fill:#98a8ba;font-size:.1px;text-anchor:middle;dominant-baseline:middle;paint-order:stroke;stroke:#0d1724;stroke-width:.04px}
.room-secondary{fill:none;stroke:#76dfca;stroke-width:1;stroke-dasharray:2 3;vector-effect:non-scaling-stroke;opacity:.6;pointer-events:none}
.dim-secondary path{stroke-dasharray:4 2}.dim-secondary .dim-text{font-style:italic}
.dim-door path{stroke:#dfa886}.dim-door .dim-text{fill:#dfa886}
.dim-stair path{stroke:#c3cdd8}.dim-stair .dim-text{fill:#c3cdd8}
.fixture-label{fill:#c3cdd8;font-size:.11px;text-anchor:middle;dominant-baseline:middle;pointer-events:none}
.plan-title{fill:#e7eef5;font-size:.42px;font-weight:600;letter-spacing:.02em}
.plan-wall{fill:#7d8c9c;stroke:none}
.plan-room .room-fill polygon{fill:#1a2a3b;stroke:none;transition:fill .15s}
.plan-room{cursor:pointer;outline:none}
.plan-room:hover .room-fill polygon,.plan-room:focus-visible .room-fill polygon{fill:#22374b}
.plan-room.selected .room-fill polygon{fill:#2a3a2c}
.plan-room.selected .room-fill{outline:none}
.room-overall{fill:none;stroke:#ffcc80;stroke-width:1;stroke-dasharray:4 3;vector-effect:non-scaling-stroke;opacity:.55;pointer-events:none}
.room-label{text-anchor:middle;dominant-baseline:middle;pointer-events:none;paint-order:stroke;stroke:#0d1724;stroke-width:.05px}
.room-name{fill:#e7eef5;font-size:.19px;font-weight:600}
.room-size{fill:#acbaca;font-size:.12px}
.plan-window{stroke:#73d5d5;stroke-width:1.2;vector-effect:non-scaling-stroke}
.plan-door{stroke:#dfa886;stroke-width:1.5;vector-effect:non-scaling-stroke}
.plan-swing{fill:none;stroke:#dfa886;stroke-width:1;stroke-dasharray:3 3;vector-effect:non-scaling-stroke;opacity:.7}
.dim{pointer-events:none}
.dim path{fill:none;stroke-width:1;vector-effect:non-scaling-stroke}
.dim-ext{opacity:.45}
.dim-overall path{stroke:#ffcc80}.dim-overall .dim-text{fill:#ffcc80}
.dim-clear path{stroke:#76dfca}.dim-clear .dim-text{fill:#76dfca}
.dim-wall path{stroke:#7d8c9c}
.dim-total .dim-text{font-weight:600}
.dim-text{font-size:.14px;text-anchor:middle;dominant-baseline:middle;paint-order:stroke;stroke:#0d1724;stroke-width:.04px;font-variant-numeric:tabular-nums}`;

// Standalone SVG at 1:50 (1 m = 20 mm) with the plan's own styles.
export function exportFloorPlanSvg({svg,viewBox},caption,scale=50){
 const [x,y,w,h]=viewBox,mm=1000/scale;
 return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(w*mm)}mm" height="${fmt(h*mm)}mm" viewBox="${[x,y,w,h].map(fmt).join(' ')}" font-family="Inter, system-ui, sans-serif"><style>${planStyles}</style><rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(w)}" height="${fmt(h)}" fill="#0d1724"/>${svg.replace(/ (?:tabindex|role)="[^"]*"/g,'').replace(/plan-room selected/g,'plan-room')}<text class="plan-caption" x="${fmt(x+.4)}" y="${fmt(y+h-.4)}">${esc(caption)}</text></svg>`;
}

// SVG rendering. project maps canonical [x,z] to plan [x,y] in world metres,
// north up, so mirrored and rotated units read as they sit on the lot.
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]);
const fmt=n=>+n.toFixed(4);
export function renderFloorPlans(entries,project,mode='both'){
 const show={overall:mode!=='clear',clear:mode!=='overall'},parts=[],layout=[];let shift=0;
 for(const {title,plan} of entries){
  const corners=plan.walls.flatMap(r=>[[r.x0,r.z0],[r.x1,r.z1]]).map(project);
  const box={x0:Math.min(...corners.map(c=>c[0])),x1:Math.max(...corners.map(c=>c[0])),y0:Math.min(...corners.map(c=>c[1])),y1:Math.max(...corners.map(c=>c[1]))};
  const dx=shift-box.x0;shift+=box.x1-box.x0+6;
  const P=p=>{const [x,y]=project(p);return [x+dx,y];};
  layout.push({floor:plan.floor,x0:box.x0+dx,x1:box.x1+dx,y0:box.y0,y1:box.y1});
  const dims=[];
  // Fixture zones cover a fixture, its clearance outline and its dimension rows.
  const zones=[...plan.fixtures.map(f=>{const o=f.clearance?.outline;return {x0:Math.min(f.x0,o?.x0??f.x0)-.05,x1:Math.max(f.x1,o?.x1??f.x1,f.clearance?.x1??f.x1)+.05,z0:Math.min(f.z0,o?.z0??f.z0)-.05,z1:Math.max(f.z1,o?.z1??f.z1)+.65};}),
   // Doors: the leaf's sweep on one side, the opening dimension on the other.
   ...plan.openings.filter(o=>o.kind==='door').map(o=>{const pts=[o.start,o.end].flatMap(p=>[[p[0]-o.normal[0]*(HALF+.4),p[1]-o.normal[1]*(HALF+.4)],[p[0]+o.normal[0]*(HALF+o.width),p[1]+o.normal[1]*(HALF+o.width)]]);return {x0:Math.min(...pts.map(p=>p[0])),x1:Math.max(...pts.map(p=>p[0])),z0:Math.min(...pts.map(p=>p[1])),z1:Math.max(...pts.map(p=>p[1])),weight:2};}),
   ...(plan.covers??[]).map(c=>({x0:c.x0-.25,x1:c.x1+.25,z0:c.z0-.25,z1:c.z1+.25,weight:2})),
   ...plan.stairs.map(t=>{const pts=t.treads.flatMap(r=>r.polygon);return {x0:Math.min(...pts.map(p=>p[0]))-.05,x1:Math.max(...pts.map(p=>p[0]))+.05,z0:Math.min(...pts.map(p=>p[1]))-.05,z1:Math.max(...pts.map(p=>p[1]))+.05,weight:2};})];
  parts.push(`<g class="plan-floor" data-floor="${plan.floor}">`);
  parts.push(`<text class="plan-title" x="${fmt(box.x0+dx)}" y="${fmt(box.y0-2.75)}">${esc(title)}</text>`);
  for(const room of plan.rooms){
   const polys=room.regions.map(g=>polygon([[g.x0,g.z0],[g.x1,g.z0],[g.x1,g.z1],[g.x0,g.z1]].map(P))).join('');
   parts.push(`<g class="plan-room" data-room="${room.code}" tabindex="0" role="button" aria-label="${esc(room.code+' '+room.name)}"><g class="room-fill">${polys}</g>`);
   if(show.overall&&!(show.clear&&['x0','x1','z0','z1'].every(k=>Math.abs(room.overall[k]-room.clear[k])<EPS)))parts.push(rect(room.overall,P,'room-overall'));
   const big=room.regions.reduce((a,b)=>(b.x1-b.x0)*(b.z1-b.z0)>(a.x1-a.x0)*(a.z1-a.z0)?b:a);
   const [cx,cy]=P([(big.x0+big.x1)/2,(big.z0+big.z1)/2]),area=`${room.area.toFixed(2)} m² clear`;
   // Room dimension text sits 0.06-0.20 m inside its line. Pull the lines toward
   // the walls so that text clears the centred label; small rooms show only
   // their code (the area stays in the selection card).
   const c=room.clear,o=room.overall,width=c.x1-c.x0,depth=c.z1-c.z0,fits=(w,h)=>Math.min((big.x1-big.x0-w)/2,(big.z1-big.z0-h)/2)>=.31;
   const full=fits(Math.max(room.code.length*.12,area.length*.068),.46),label=full?{w:Math.max(room.code.length*.12,area.length*.068),h:.46}:{w:room.code.length*.12,h:.22};
   const insetX=Math.max(.1,Math.min(.3,(width-label.w)/2-.23)),insetZ=Math.max(.1,Math.min(.3,(depth-label.h)/2-.23));
   parts.push(full?`<text class="room-label" x="${fmt(cx)}" y="${fmt(cy)}"><tspan x="${fmt(cx)}" dy="-.09" class="room-name">${esc(room.code)}</tspan><tspan x="${fmt(cx)}" dy=".24" class="room-size">${area}</tspan></text></g>`:`<text class="room-label" x="${fmt(cx)}" y="${fmt(cy)}"><tspan class="room-name">${esc(room.code)}</tspan></text></g>`);
   // Clear dimensions run along the north and east inner faces; overall
   // (centreline) dimensions along the south and west, over the walls.
   // Place each room dimension line where it crosses the least fixture or
   // stair area, preferring its usual spot and keeping lines apart.
   // The room's own label counts as an obstacle, padded for dimension text.
   const bx=(big.x0+big.x1)/2,bz=(big.z0+big.z1)/2,obstacles=[...zones,{x0:bx-label.w/2-.22,x1:bx+label.w/2+.22,z0:bz-label.h/2-.22,z1:bz+label.h/2+.22,weight:8,core:{x0:bx-label.w/2,x1:bx+label.w/2,z0:bz-label.h/2,z1:bz+label.h/2}}];
   const taken={x:[],z:[]},place=(axis,pref,lo,hi)=>{
    const other=axis==='x'?'z':'x',min=c[axis+'0']+.1,max=c[axis+'1']-.1;let best=pref,cost=Infinity;
    for(let v=min;v<=max+EPS;v+=.05){
     let blocked=0;for(const z of obstacles)if(v>z[axis+'0']&&v<z[axis+'1'])blocked+=(z.weight??1)*Math.max(0,Math.min(hi,z[other+'1'])-Math.max(lo,z[other+'0']));
     const k=blocked+.02*Math.abs(v-pref)+(taken[axis].some(t=>Math.abs(t-v)<.5)?50:0);if(k<cost-EPS){cost=k;best=v;}
    }
    taken[axis].push(best);return best;
   };
   // Centre the label in the longest stretch of the line free of obstacles.
   // side is the direction the text sits from its line (+1 or -1 on axis).
   const textT=(axis,v,a,b,side)=>{
    const t0=Math.min(v+side*.06,v+side*.2),t1=Math.max(v+side*.06,v+side*.2);
    const other=axis==='x'?'z':'x',lo=Math.min(a,b),hi=Math.max(a,b),cuts=obstacles.map(z=>z.core??z).filter(z=>t1>z[axis+'0']&&t0<z[axis+'1']).map(z=>[Math.max(lo,z[other+'0']-.05),Math.min(hi,z[other+'1']+.05)]).filter(([p,q])=>q>p).sort((p,q)=>p[0]-q[0]);
    let start=lo,best=[lo,hi],size=-1;for(const [p,q] of [...cuts,[hi,hi]]){if(p-start>size){size=p-start;best=[start,p];}start=Math.max(start,q);}
    return size<.35?.5:((best[0]+best[1])/2-a)/(b-a);
   };
   // Horizontal lines go first; their labels then become obstacles for the
   // vertical lines and labels.
   const labelBox=(z,x,dir)=>obstacles.push({x0:x-.3,x1:x+.3,z0:Math.min(z,z+dir*.25),z1:Math.max(z,z+dir*.25),weight:4});
   const north=place('z',c.z0+insetZ,c.x0,c.x1),tNorth=textT('z',north,c.x0,c.x1,1);labelBox(north,c.x0+(c.x1-c.x0)*tNorth,1);
   const south=place('z',c.z1-insetZ,c.x0,c.x1),tSouth=textT('z',south,o.x0,o.x1,-1);labelBox(south,o.x0+(o.x1-o.x0)*tSouth,-1);
   const east=place('x',c.x1-insetX,c.z0,c.z1),tEast=textT('x',east,c.z0,c.z1,-1),ez=c.z0+(c.z1-c.z0)*tEast;
   obstacles.push({x0:east-.25,x1:east,z0:ez-.3,z1:ez+.3,weight:4});
   const west=place('x',c.x0+insetX,c.z0,c.z1);
   // A secondary clear extent (e.g. the carport including its inner footing)
   // gets its own outline and width/depth lines where they differ from clear.
   const sec=room.secondary;
   if(show.clear&&sec){
    parts.push(rect(sec,P,'room-secondary'));
    if(Math.abs(sec.x1-sec.x0-width)>EPS){const z=place('z',north+.35,sec.x0,sec.x1),t=textT('z',z,sec.x0,sec.x1,1),x=sec.x0+(sec.x1-sec.x0)*t;obstacles.push({x0:x-.6,x1:x+.6,z0:z,z1:z+.25,weight:4});dims.push(dimension([sec.x0,z],[sec.x1,z],[0,1],0,P,'dim-clear dim-secondary',false,true,' '+sec.label,t));}
    if(Math.abs(sec.z1-sec.z0-depth)>EPS){const x=place('x',east-.35,sec.z0,sec.z1);dims.push(dimension([x,sec.z0],[x,sec.z1],[-1,0],0,P,'dim-clear dim-secondary',false,true,' '+sec.label));}
   }
   if(show.clear)dims.push(dimension([c.x0,north],[c.x1,north],[0,1],0,P,'dim-clear',false,true,'',tNorth),dimension([east,c.z0],[east,c.z1],[-1,0],0,P,'dim-clear',false,true,'',tEast));
   // Skip an overall dimension that repeats the clear one (no bounding walls).
   const same=(a0,a1,b0,b1)=>show.clear&&Math.abs(a0-b0)<EPS&&Math.abs(a1-b1)<EPS;
   if(show.overall&&!same(o.x0,o.x1,c.x0,c.x1))dims.push(dimension([o.x0,south],[o.x1,south],[0,-1],0,P,'dim-overall',false,true,'',tSouth));
   if(show.overall&&!same(o.z0,o.z1,c.z0,c.z1))dims.push(dimension([west,o.z0],[west,o.z1],[1,0],0,P,'dim-overall',false,true,'',textT('x',west,o.z0,o.z1,1)));
  }
  for(const w of plan.walls)parts.push(rect(w,P,'plan-wall'));
  // Covers: the box itself, its size, and how far it sets a door jamb off the wall.
  for(const c of plan.covers??[]){
   parts.push(rect(c,P,'plan-cover').replace('/>',`><title>${esc(c.label)}</title></polygon>`));
   for(const d of c.dims??[])dims.push(dimension(d.a,d.b,d.out,0,P,d.door?'dim-door':'dim-cover',false,true,d.suffix??'',d.t??.5));
  }
  for(const o of plan.openings){
   const [a,b]=[o.start,o.end],n=o.normal;
   if(o.kind==='window'){
    for(const t of [-.03,.03])parts.push(line([a[0]+n[0]*t,a[1]+n[1]*t],[b[0]+n[0]*t,b[1]+n[1]*t],P,'plan-window'));
    parts.push(line([a[0]-n[0]*HALF,a[1]-n[1]*HALF],[a[0]+n[0]*HALF,a[1]+n[1]*HALF],P,'plan-window'),line([b[0]-n[0]*HALF,b[1]-n[1]*HALF],[b[0]+n[0]*HALF,b[1]+n[1]*HALF],P,'plan-window'));
   }else{
    const hinge=[a[0]+n[0]*HALF,a[1]+n[1]*HALF],leaf=[hinge[0]+n[0]*o.width,hinge[1]+n[1]*o.width],arc=[];
    for(let i=0;i<=12;i++){const t=i/12*Math.PI/2,c=Math.cos(t),s=Math.sin(t);arc.push(P([hinge[0]+(n[0]*c+o.direction[0]*s)*o.width,hinge[1]+(n[1]*c+o.direction[1]*s)*o.width]));}
    parts.push(line(hinge,leaf,P,'plan-door'),`<polyline class="plan-swing" points="${arc.map(p=>p.map(fmt).join(',')).join(' ')}"/>`);
    // Clear opening width, jamb to jamb, on the side away from the swing.
    const off=HALF+.2;dims.push(dimension([a[0]-n[0]*off,a[1]-n[1]*off],[b[0]-n[0]*off,b[1]-n[1]*off],[-n[0],-n[1]],0,P,'dim-door',false));
   }
  }
  // Fixtures: a counter (with sink) and the clearance it keeps. Clear
  // dimensions start at the wall face it stands on; overall ones at the wall
  // centreline. Length and the clearance gap share a row along the front edge.
  for(const f of plan.fixtures){
   parts.push(rect(f,P,'plan-fixture'));
   if(f.sink)parts.push(rect(f.sink,P,'plan-sink'));
   const [lx,ly]=P([(f.x0+f.x1)/2,(f.z0+f.z1)/2]);parts.push(`<text class="fixture-label" x="${fmt(lx)}" y="${fmt(ly)}">${esc(f.label)}</text>`);
   const overall={x0:f.x0-(f.walls?.x0?HALF:0),z0:f.z0-(f.walls?.z0?HALF:0)},rows=[];
   if(show.clear)rows.push({cls:'dim-clear',x0:f.x0,z0:f.z0,gap:true});
   if(show.overall&&!(show.clear&&overall.x0===f.x0&&overall.z0===f.z0))rows.push({cls:'dim-overall',...overall});
   rows.forEach((row,k)=>{
    const z=f.z1+.18+k*.3,x=f.x1+.12+k*.2;
    dims.push(dimension([row.x0,z],[f.x1,z],[0,1],0,P,row.cls,false));
    if(row.gap&&f.clearance)dims.push(dimension([f.x1,z],[f.clearance.x1,z],[0,1],0,P,row.cls,false));
    dims.push(dimension([x,row.z0],[x,f.z1],[1,0],0,P,row.cls,false));
   });
  }
  // Stairs: treads past the cut plane are dashed behind a break line; the
  // walking line runs from the first tread with UP, or from the top with DN.
  for(const t of plan.stairs){
   const cut=t.cut??Infinity;
   for(const r of t.treads)parts.push(`<polygon class="plan-tread${r.number>cut?' above-cut':''}" points="${r.polygon.map(P).map(p=>p.map(fmt).join(',')).join(' ')}"/>`);
   if(Number.isFinite(cut)){const r=t.treads.find(r=>r.number===cut+1);if(r){const xs=r.polygon.map(p=>p[0]),zs=r.polygon.map(p=>p[1]),[x0,x1,z0,z1]=[Math.min(...xs),Math.max(...xs),Math.min(...zs),Math.max(...zs)],m=[(x0+x1)/2,(z0+z1)/2];
    const zig=[[x0,z1],[m[0]-.06,m[1]+.02],[m[0]+.04,m[1]+.12],[m[0]-.04,m[1]-.12],[m[0]+.06,m[1]-.02],[x1,z0]].map(P);parts.push(`<polyline class="plan-break" points="${zig.map(p=>p.map(fmt).join(',')).join(' ')}"/>`);}}
   const centroid=poly=>[poly.reduce((s,p)=>s+p[0],0)/poly.length,poly.reduce((s,p)=>s+p[1],0)/poly.length];
   let walk=t.treads.filter(r=>r.number<=cut+(Number.isFinite(cut)?.5:0)).map(r=>centroid(r.polygon));if(t.direction==='down')walk=walk.reverse();
   if(walk.length>1){
    const pts=walk.map(P),[p,q]=[pts.at(-2),pts.at(-1)],l=Math.hypot(q[0]-p[0],q[1]-p[1]),u=[(q[0]-p[0])/l,(q[1]-p[1])/l],h=.12;
    parts.push(`<polyline class="plan-walk" points="${pts.map(p=>p.map(fmt).join(',')).join(' ')}"/><polygon class="plan-walk-head" points="${[q,[q[0]-u[0]*h-u[1]*h*.5,q[1]-u[1]*h+u[0]*h*.5],[q[0]-u[0]*h+u[1]*h*.5,q[1]-u[1]*h-u[0]*h*.5]].map(p=>p.map(fmt).join(',')).join(' ')}"/>`);
    parts.push(`<circle class="plan-walk-start" cx="${fmt(pts[0][0])}" cy="${fmt(pts[0][1])}" r=".04"/><text class="stair-label" x="${fmt(pts[0][0])}" y="${fmt(pts[0][1]+.17)}">${t.direction==='down'?'DN':'UP'}</text>`);
   }
   if(t.note){const [x,y]=P(t.note.at),[x2,y2]=P([t.note.at[0]+(t.note.along?.[0]??1),t.note.at[1]+(t.note.along?.[1]??0)]);let angle=Math.atan2(y2-y,x2-x)*180/Math.PI;if(angle>90.01)angle-=180;if(angle<=-90.01)angle+=180;
    parts.push(`<text class="stair-note" transform="translate(${fmt(x)} ${fmt(y)}) rotate(${fmt(angle)})">${esc(t.note.text)}</text>`);}
   for(const d of t.dims??[])dims.push(dimension(d.a,d.b,d.out,0,P,'dim-stair',false));
  }
  parts.push(`<g class="room-dims">${dims.join('')}</g>`);
  // Exterior chains: rows step outward; the clear row sits nearest the walls.
  for(const chain of plan.chains){
   const out=chain.axis==='z'?[0,chain.sign]:[chain.sign,0],rows=[];
   if(show.clear)rows.push({segments:chain.clear,cls:'dim-clear'});
   if(show.overall)rows.push({segments:chain.overall,cls:'dim-overall'});
   if(show.clear)rows.push({segments:[chain.total.clear],cls:'dim-clear dim-total'});
   if(show.overall)rows.push({segments:[chain.total.overall],cls:'dim-overall dim-total'});
   // Drop a row that repeats the labels of a nearer row, e.g. a total equal
   // to a chain's only clear span.
   const seen=new Set(),labelled=rows.filter(row=>{const key=row.cls.split(' ')[0]+':'+row.segments.filter(s=>!s.wall).map(s=>formatMetres(s.b-s.a)).join(',');if(seen.has(key))return false;seen.add(key);return true;});
   labelled.forEach((row,k)=>{
    const offset=.55+k*.5;
    for(const s of row.segments){
     const at=(t)=>chain.axis==='z'?[t,chain.edge]:[chain.edge,t];
     parts.push(dimension(at(s.a),at(s.b),out,offset,P,row.cls+(s.wall?' dim-wall':''),true,!s.wall));
    }
   });
  }
  parts.push('</g>');
 }
 const x0=Math.min(...layout.map(l=>l.x0))-3.2,x1=Math.max(...layout.map(l=>l.x1))+3.2,y0=Math.min(...layout.map(l=>l.y0))-3.4,y1=Math.max(...layout.map(l=>l.y1))+3.2;
 return {svg:parts.join(''),viewBox:[x0,y0,x1-x0,y1-y0],layout};
}
function polygon(points){return `<polygon points="${points.map(p=>p.map(fmt).join(',')).join(' ')}"/>`;}
function rect(r,P,cls){return `<polygon class="${cls}" points="${[[r.x0,r.z0],[r.x1,r.z0],[r.x1,r.z1],[r.x0,r.z1]].map(P).map(p=>p.map(fmt).join(',')).join(' ')}"/>`;}
function line(a,b,P,cls){const [p,q]=[P(a),P(b)];return `<line class="${cls}" x1="${fmt(p[0])}" y1="${fmt(p[1])}" x2="${fmt(q[0])}" y2="${fmt(q[1])}"/>`;}
// A dimension from a to b, displaced by offset along the outward unit vector.
// Lengths are measured after projection, so they match the 3D model's units.
function dimension(a,b,out,offset,P,cls,extensions=true,label=true,suffix='',t=.5){
 const pa=[a[0]+out[0]*offset,a[1]+out[1]*offset],pb=[b[0]+out[0]*offset,b[1]+out[1]*offset];
 const [p,q]=[P(pa),P(pb)],len=Math.hypot(q[0]-p[0],q[1]-p[1]);if(len<1e-4)return '';
 const ux=(q[0]-p[0])/len,uy=(q[1]-p[1])/len,o=P([pa[0]+out[0],pa[1]+out[1]]),ox=o[0]-p[0],oy=o[1]-p[1];
 const tick=.07,tx=(ux+ox)*tick,ty=(uy+oy)*tick,parts=[`<g class="dim ${cls}">`];
 if(extensions){const [ea,eb]=[P([a[0]+out[0]*.12,a[1]+out[1]*.12]),P([b[0]+out[0]*.12,b[1]+out[1]*.12])];parts.push(`<path class="dim-ext" d="M${fmt(ea[0])} ${fmt(ea[1])}L${fmt(p[0]+ox*.08)} ${fmt(p[1]+oy*.08)}M${fmt(eb[0])} ${fmt(eb[1])}L${fmt(q[0]+ox*.08)} ${fmt(q[1]+oy*.08)}"/>`);}
 parts.push(`<path class="dim-line" d="M${fmt(p[0])} ${fmt(p[1])}L${fmt(q[0])} ${fmt(q[1])}M${fmt(p[0]-tx)} ${fmt(p[1]-ty)}L${fmt(p[0]+tx)} ${fmt(p[1]+ty)}M${fmt(q[0]-tx)} ${fmt(q[1]-ty)}L${fmt(q[0]+tx)} ${fmt(q[1]+ty)}"/>`);
 if(label){
  let angle=Math.atan2(uy,ux)*180/Math.PI;if(angle>89.99)angle-=180;if(angle<=-90.01)angle+=180;
  // Labels sit on the outward side: away from the walls, or into the room.
  const side=.13,mx=p[0]+(q[0]-p[0])*t+ox*side,my=p[1]+(q[1]-p[1])*t+oy*side;
  parts.push(`<text class="dim-text" transform="translate(${fmt(mx)} ${fmt(my)}) rotate(${fmt(angle)})">${formatMetres(len)}${esc(suffix)}</text>`);
 }
 parts.push('</g>');return parts.join('');
}
