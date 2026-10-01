import * as THREE from 'three';
import { defaultLots, minimumLots, validateLot, layoutBlock, restoreLots, orientWallCode } from './lot-block.mjs?v=fixed-inner-width-1';
import { createBlockView } from './block-view.mjs?v=block-controls-rear-row-1';
import { walls, reviewedOpenings } from './openings.mjs';
import { planFloorConduits } from './floor-conduits.mjs?v=conduit-routing-7';
import { planCeilingConduits } from './ceiling-conduits.mjs?v=conduit-routing-7';
import { wallsWithoutDoors } from './conduit-geometry.mjs?v=conduit-routing-7';
import { roomNames,buildWallSurfaces,buildWallExtensions,surfaceCodes } from './wall-surfaces.mjs';
import { buildRoomFloorPlans, roomAtPoint, wallFootprint } from './room-floors.mjs';
import { loopSegments, regionBoundary } from './selection-outlines.mjs';
import { createMeasurements, surfaceDimensions, transformDimensions, rectangularRegions, regionProjection } from './measurements.mjs';
import { buildFloorPlan, renderFloorPlans, formatMetres } from './floor-plan.mjs?v=floor-plan-6';
import { OrbitControls } from 'three/addons/OrbitControls.js';
const viewport=document.querySelector('#viewport');
const sidebarToggle=document.querySelector('#sidebar-toggle'),sidebar=document.querySelector('#sidebar');
function setSidebarCollapsed(collapsed){
 sidebar.hidden=collapsed;document.querySelector('main').classList.toggle('sidebar-collapsed',collapsed);
 sidebarToggle.setAttribute('aria-expanded',String(!collapsed));
 sidebarToggle.setAttribute('aria-label',collapsed?'Expand sidebar':'Collapse sidebar');sidebarToggle.title=collapsed?'Expand sidebar':'Collapse sidebar';
}
try{setSidebarCollapsed(localStorage.getItem('thea-sidebar-collapsed')==='true');}catch{setSidebarCollapsed(false);}
sidebarToggle.onclick=()=>{const collapsed=!sidebar.hidden;setSidebarCollapsed(collapsed);requestAnimationFrame(resize);try{localStorage.setItem('thea-sidebar-collapsed',String(collapsed));}catch{}};

const defs=[['structure','Structural','#c3cdd8','▧'],['roof','Roof framing','#8cd0aa','⌂'],['electrical','Electrical','#f4bd61','ϟ'],['data','Data lines','#b89aff','⌘'],['plumbing','Plumbing','#65bafa','⌁'],['doors','Doors','#dfa886','▯'],['windows','Windows','#73d5d5','⊞']];
const state={scope:'block',showRearUnits:true,unitId:4,end:'right',layers:Object.fromEntries(defs.map(d=>[d[0],true])),level:'all',opacity:.3,explode:0,roofskin:true,labels:true,wallLabels:true,carportArea:false,view:'iso',plan:false,planMode:'both'};
const scene=new THREE.Scene();scene.background=new THREE.Color('#101c2c');scene.fog=new THREE.Fog('#101c2c',90,250);
const perspectiveCamera=new THREE.PerspectiveCamera(39,1,.1,2000),planCamera=new THREE.OrthographicCamera(-10,10,8,-8,.1,2000);let camera=perspectiveCamera;camera.position.set(-14,12,17);
let renderer;try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});}catch(e){document.querySelector('#error').hidden=false;document.querySelector('#status').textContent='WebGL 2 unavailable';throw e;}
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.localClippingEnabled=true;renderer.setClearColor('#101c2c');viewport.appendChild(renderer.domElement);
const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,2.8,0);controls.enableDamping=true;controls.minDistance=4;controls.maxDistance=1500;controls.maxPolarAngle=Math.PI*.92;controls.update();
scene.add(new THREE.HemisphereLight(0xdbeaff,0x32465c,2.8));const sun=new THREE.DirectionalLight(0xffffff,3.2);sun.position.set(-8,15,12);scene.add(sun);const fill=new THREE.DirectionalLight(0x90b8f4,1.8);fill.position.set(9,8,-10);scene.add(fill);
const grid=new THREE.GridHelper(120,120,0x415469,0x26374a);grid.position.y=-.38;grid.material.transparent=true;grid.material.opacity=.5;scene.add(grid);
const root=new THREE.Group();root.position.x=-2.525;scene.add(root);
const systems={};for(const [id] of defs){systems[id]=[new THREE.Group(),new THREE.Group(),new THREE.Group()];systems[id].forEach((g,i)=>{g.userData={system:id,floor:i};root.add(g);});}
const mats={concrete:new THREE.MeshStandardMaterial({color:0xc5cdd6,roughness:.9}),wall:new THREE.MeshStandardMaterial({color:0xcbd8e5,transparent:true,opacity:.3,depthWrite:false,roughness:.85}),beam:new THREE.MeshStandardMaterial({color:0x94a9bd,roughness:.8}),roof:new THREE.MeshStandardMaterial({color:0x82c5a0,metalness:.3,roughness:.5}),door:new THREE.MeshStandardMaterial({color:0xc89b7e,roughness:.7}),glass:new THREE.MeshStandardMaterial({color:0x66c4cf,metalness:.25,roughness:.2,transparent:true,opacity:.55})};
const objects=[];
const photoOnly=[];
const photoLowerWall=mats.wall.clone();photoLowerWall.color.set(0xd5b660);
const photoUpperWall=mats.wall.clone();photoUpperWall.color.set(0xe8e5d8);
const photoTrim=mats.wall.clone();photoTrim.color.set(0xe8e7df);
const wallMaterials=[mats.wall,photoLowerWall,photoUpperWall,photoTrim];
function part(geo,mat,sys,floor,pos,name,source,detail,edge=true){const m=new THREE.Mesh(geo,mat);m.position.set(...pos);m.userData={system:sys,floor,name,source,detail:detail||'Simplified townhouse model geometry.'};systems[sys][floor].add(m);objects.push(m);if(edge){const e=new THREE.LineSegments(new THREE.EdgesGeometry(geo),new THREE.LineBasicMaterial({color:sys==='structure'?0x668099:0x243a49,transparent:true,opacity:.48}));m.add(e);}return m;}
function box(sys,floor,x,y,z,w,h,d,mat,name,source,detail){return part(new THREE.BoxGeometry(w,h,d),mat,sys,floor,[x,y,z],name,source,detail);}
function slab(f,x,z,w,d,y,name){const m=box('structure',f,x,y-.075,z,w,.15,d,mats.concrete,name,'S-1','Floor slab represented as 150 mm thick. Local reinforcement remains schematic.');m.userData.measurementKind='floor';return m;}

// Coordinates in metres: left building edge x=0; front z=+3.825.
// Source A-2: building width 2.55+2.50; depth 7.65; floor datums +0.25/+3.10.
slab(0,3.8,1.355,2.5,4.94,.25,'Living and dining floor slab');
slab(0,3.55,-2.47,3,2.71,.25,'Kitchen floor slab');
slab(0,1.275,.005,2.55,2.24,.25,'Guest room slab');
slab(0,1.025,-1.7,2.05,1.16,.15,'Ground bathroom slab');
slab(1,1.275,.775,2.55,6.1,3.1,'Master bedroom and balcony slab');
slab(1,3.8,1.55,2.5,4.55,3.1,'Bedroom 1 slab');
slab(1,3.05,-2.275,2,3.1,3.1,'Upper bathroom and landing slab');
// The as-built carport surface is gravel.
// Interior foundation envelopes remain schematic. There is no strip footing
// on CP-WI; the continuous exposed east-side footing is modeled below.
for(const [x,z,w,d] of [[3.8,1.355,2.5,4.94],[3.55,-2.47,3,2.71],[1.025,-.575,2.2,3.5]])box('structure',0,x,-.20,z,w,.25,d,mats.beam,'Mat foundation / footing band','S-1','Simplified foundation envelope; footing tie beams and reinforcement remain schematic.');
// Both cutouts and inserts use the same reviewed schedule / placement record.
const rightRoofSpec={x0:2.6,x1:5.22,z0:-3.98,z1:3.98,y0:6.02,y1:6.8};
const leftRoofProfile={eastX:-.40,referenceZ:-2.45,referenceY:6.35,pitch:.43/6.65};
const leftRoofNorthZ=walls.find(w=>w.id==='u-master-rear').a[1]+leftRoofProfile.eastX;
const roofApexHeight=leftRoofProfile.referenceY-leftRoofProfile.pitch*(leftRoofNorthZ-leftRoofProfile.referenceZ)+.14+.035/2/Math.sqrt(1+leftRoofProfile.pitch**2);
const extendedWallIncrease=.13;
const firewallApexHeight=roofApexHeight+extendedWallIncrease; // Raised masonry datum; coping follows.
const copingHeight=.15;
// Clip at the inner firewall faces while preserving the original roof pitch.
const westRoofHeightAt=z=>6.02+(z+3.98)*(.78/7.96);
rightRoofSpec.x1=walls.find(w=>w.id==='u-party').a[0]-.075;
rightRoofSpec.z0=walls.find(w=>w.id==='u-rear').a[1]+.075+.003;
rightRoofSpec.y0=westRoofHeightAt(rightRoofSpec.z0);
const bathSouthExtraHeight=0,bathSouthTop=firewallApexHeight+bathSouthExtraHeight;
const westFirewallEndZ=walls.find(w=>w.id==='u-balcony').a[1];
const frontParapet={wallY:6.37,wallHeight:1.04,capY:6.91,capHeight:.07};
const southWallTop=frontParapet.wallY+frontParapet.wallHeight/2;
const rightRoofCut={x:walls.find(w=>w.id==='u-stair').a[0]+.075,z:walls.find(w=>w.id==='u-bath-south').a[1]+.075};
const westRoofPitch=.78/7.96;
const innerRoofUndersideAt=z=>westRoofHeightAt(z)+.14-.035/2*Math.sqrt(1+westRoofPitch**2);
// Match the finished Bedroom 1 front parapet top, including the inner 150 mm coping.
const innerParapetHeight=frontParapet.capY+frontParapet.capHeight/2-copingHeight;
const raisedWallNote='Extended masonry is 130 mm above the east roof apex. The existing 150 mm coping moves up with it.';
const southWallNote=raisedWallNote;
for(const id of ['u-bath-side','u-rear']){const wall=walls.find(w=>w.id===id);wall.top=firewallApexHeight;wall.roofHeightCorrection=true;}
// Recessed electrical cabinets leave a solid back in the 150 mm wall.
const panelMountWall=walls.find(w=>w.id==='g-bath-south'),frontMountWall=walls.find(w=>w.id==='g-front');
const frontMountWindow=reviewedOpenings.find(o=>o.id==='living-front');
const utilityBoxSize={width:.1016,height:.0508,depth:.0508,coverOverlap:.01,coverDepth:.002,coverGap:.001};
// Wall conduits sit in a narrow chase cut into the wall surface and covered by
// the finish: 10 mm behind the 75 mm masonry face, never in the wall core.
const wallChaseOffset=.065;
const embeddedMounts={
 panel:{wallId:panelMountWall.id,wallCode:'KT-SI',normal:-1,x:(walls.find(w=>w.id==='g-bath-door').a[0]+panelMountWall.b[0])/2,y:1.8,z:panelMountWall.a[1]-.075+.13/2,w:.30,h:.42,d:.13},
 pullBox:{wallId:frontMountWall.id,wallCode:'LR-SE',normal:1,x:frontMountWindow.x,y:.55,z:frontMountWall.a[1]+.075-utilityBoxSize.depth/2,w:utilityBoxSize.width,h:utilityBoxSize.height,d:utilityBoxSize.depth}
};
const electricalRecesses=Object.values(embeddedMounts).map(m=>{const wall=walls.find(w=>w.id===m.wallId),along=m.x-wall.a[0];return {...m,a:along-m.w/2,b:along+m.w/2,low:m.y-m.h/2,high:m.y+m.h/2};});
const wallPieces=[];
function buildWall(wall){
 const {floor:f,a:[x1,z1],b:[x2,z2],bottom,top,name,id}=wall;
 const len=Math.hypot(x2-x1,z2-z1),dx=(x2-x1)/len,dz=(z2-z1)/len;
 function piece(a,b,low,high,depth=.15,normalOffset=0,skipped=[]){
  if(b-a<.0001||high-low<.0001||depth<.0001)return;
  const depthLow=normalOffset-depth/2,depthHigh=normalOffset+depth/2;
  const cavity=r=>r.normal>0?[.075-r.d,.075]:[-.075,-.075+r.d];
  const recess=electricalRecesses.find(r=>r.wallId===id&&!skipped.includes(r)&&a<r.b-.0001&&b>r.a+.0001&&low<r.high-.0001&&high>r.low+.0001&&Math.min(depthHigh,cavity(r)[1])-Math.max(depthLow,cavity(r)[0])>.0001);
  if(recess){
   const left=Math.max(a,recess.a),right=Math.min(b,recess.b),bottom=Math.max(low,recess.low),top=Math.min(high,recess.high);
   piece(a,left,low,high,depth,normalOffset,skipped);piece(right,b,low,high,depth,normalOffset,skipped);
   piece(left,right,low,bottom,depth,normalOffset,skipped);piece(left,right,top,high,depth,normalOffset,skipped);
   const [cutLow,cutHigh]=cavity(recess),next=[...skipped,recess];
   const backLow=Math.min(depthHigh,cutLow),backHigh=Math.max(depthLow,cutHigh);
   piece(left,right,bottom,top,backLow-depthLow,(backLow+depthLow)/2,next);
   piece(left,right,bottom,top,depthHigh-backHigh,(depthHigh+backHigh)/2,next);return;
  }
  const m=box('structure',f,x1+dx*(a+b)/2-dz*normalOffset,(low+high)/2,z1+dz*(a+b)/2+dx*normalOffset,b-a,high-low,depth,mats.wall,name,'A-2 · S-1','Wall openings use the modeled sizes. Center offsets remain approximate.');
  m.rotation.y=-Math.atan2(dz,dx);m.userData.wallId=id;m.userData.isWall=true;m.userData.baseWall=true;if(depth<.15)m.userData.electricalRecessBack=true;
  if(wall.roofHeightCorrection){Object.assign(m.userData,{roofApexWall:true,detail:raisedWallNote});}
  wallPieces.push({wall:id,a,b,low,high,baseWall:true});
 }
 let cursor=0;
 for(const o of reviewedOpenings.filter(o=>o.wall===id).sort((a,b)=>a.at-b.at)){
  const a=o.at-o.w/2,b=o.at+o.w/2,low=o.base+o.sill;
  if(a<cursor-.0001||b>len+.0001||low<bottom-.0001||low+o.h>top+.0001)throw new Error('Opening does not fit wall: '+o.id);
  piece(cursor,a,bottom,top);piece(a,b,bottom,low);piece(a,b,low+o.h,top);cursor=b;
 }
 piece(cursor,len,bottom,top);
}
walls.forEach(buildWall);
const bathSouthWall=walls.find(w=>w.id==='u-bath-south');
const bathSouthUpstand=box('structure',1,bathSouthWall.a[0]+.25,(5.85+bathSouthTop)/2,bathSouthWall.a[1],.50,bathSouthTop-5.85,.15,mats.wall,'B1-S1I · Raised wall extension','A-2',southWallNote);
Object.assign(bathSouthUpstand.userData,{isWall:true,wallId:bathSouthWall.id,roofApexWall:true,bathSouthUpstand:true,endOnly:true});
wallPieces.push({wall:bathSouthWall.id,a:0,b:.50,low:5.85,high:bathSouthTop,endOnly:true});
const westWall=walls.find(w=>w.id==='u-party');
const westFirewallUpstand=box('structure',1,westWall.a[0],(westWall.top+firewallApexHeight)/2,(westWall.a[1]+westFirewallEndZ)/2,.15,firewallApexHeight-westWall.top,westFirewallEndZ-westWall.a[1],mats.wall,'FW · West wall extension to master south line','A-2',raisedWallNote);
Object.assign(westFirewallUpstand.userData,{isWall:true,wallId:westWall.id,roofApexWall:true,westFirewallUpstand:true});
wallPieces.push({wall:westWall.id,a:0,b:westFirewallEndZ-westWall.a[1],low:westWall.top,high:firewallApexHeight});
const masterWestWall=walls.find(w=>w.id==='u-divider');
const masterWestHeightNote=raisedWallNote;
const masterWestUpstand=box('structure',1,masterWestWall.a[0],(masterWestWall.top+firewallApexHeight)/2,(masterWestWall.a[1]+westFirewallEndZ)/2,.15,firewallApexHeight-masterWestWall.top,westFirewallEndZ-masterWestWall.a[1],mats.wall,'MB-W1I / MB-W2I · Wall extension to east roof apex','A-2',masterWestHeightNote);
Object.assign(masterWestUpstand.userData,{isWall:true,wallId:masterWestWall.id,roofApexWall:true,masterWestUpstand:true,endOnly:true});
wallPieces.push({wall:masterWestWall.id,a:0,b:westFirewallEndZ-masterWestWall.a[1],low:masterWestWall.top,high:firewallApexHeight,endOnly:true});
const balconyWallHeightNote='R1-W2E-X and R1-E2I-X match R1-SE-X, including the same coping top and profile.';
for(const wall of [masterWestWall,westWall]){
 const extension=box('structure',1,wall.a[0],(wall.top+southWallTop)/2,(westFirewallEndZ+wall.b[1])/2,.15,southWallTop-wall.top,wall.b[1]-westFirewallEndZ,mats.wall,'Front wall extension · matches R1-SE-X','User correction',balconyWallHeightNote);
 Object.assign(extension.userData,{isWall:true,wallId:wall.id,roofApexWall:true,balconyWallUpstand:true});
 wallPieces.push({wall:wall.id,a:westFirewallEndZ-wall.a[1],b:wall.b[1]-wall.a[1],low:wall.top,high:southWallTop});
}
// Preserve MB-EE-X, MB-NE-X and BL-NI-X (the master south wall).
for(const id of ['u-side','u-master-rear','u-balcony']){
 const wall=walls.find(w=>w.id===id),len=Math.hypot(wall.b[0]-wall.a[0],wall.b[1]-wall.a[1]);
 const heightAt=z=>leftRoofProfile.referenceY-leftRoofProfile.pitch*(z-leftRoofProfile.referenceZ)+.14-.035/2;
 const h0=heightAt(wall.a[1]),h1=heightAt(wall.b[1]);
 const shape=new THREE.Shape();shape.moveTo(0,wall.top);shape.lineTo(len,wall.top);shape.lineTo(len,h1);shape.lineTo(0,h0);shape.closePath();
 const geo=new THREE.ExtrudeGeometry(shape,{depth:.15,bevelEnabled:false});geo.translate(0,0,-.075);
 const m=part(geo,mats.wall,'structure',1,[wall.a[0],0,wall.a[1]],'Master bedroom · roof-slope wall extension','User correction','Wall closes to the underside of the east roof slope. MB-EE-X, MB-NE-X and BL-NI-X retain their original heights.');
 m.rotation.y=-Math.atan2(wall.b[1]-wall.a[1],wall.b[0]-wall.a[0]);Object.assign(m.userData,{isWall:true,wallId:id,slopedWallExtension:true,topAtStart:h0,topAtEnd:h1,...(['u-side','u-master-rear'].includes(id)?{endOnly:true}:{})});
 wallPieces.push({wall:id,a:0,b:len,low:wall.top,high:Math.min(h0,h1),...(['u-side','u-master-rear'].includes(id)?{endOnly:true}:{})});
}
// Internal partitions and the master rear wall close to the joined inner roof.
for(const [id,start,end] of [['u-divider',0,westFirewallEndZ-masterWestWall.a[1]],['u-bath-south',0,.50],['u-master-rear',0,2.05]]){
 const wall=walls.find(w=>w.id===id),len=Math.hypot(wall.b[0]-wall.a[0],wall.b[1]-wall.a[1]),dx=(wall.b[0]-wall.a[0])/len,dz=(wall.b[1]-wall.a[1])/len;
 const h0=innerRoofUndersideAt(wall.a[1]+dz*start),h1=innerRoofUndersideAt(wall.a[1]+dz*end);
 const shape=new THREE.Shape();shape.moveTo(start,wall.top);shape.lineTo(end,wall.top);shape.lineTo(end,h1);shape.lineTo(start,h0);shape.closePath();
 const geo=new THREE.ExtrudeGeometry(shape,{depth:.15,bevelEnabled:false});geo.translate(0,0,-.075);
 const mesh=part(geo,mats.wall,'structure',1,[wall.a[0],0,wall.a[1]],id==='u-divider'?'Bedroom and landing partition · roof closure':'Inner roof · wall closure','Block layout','Wall extension closes to the joined west roof underside. Interior room partitions remain; no middle parapet or coping projects through the roof.');
 mesh.rotation.y=-Math.atan2(dz,dx);Object.assign(mesh.userData,{innerOnly:true,isWall:true,wallId:id,slopedWallExtension:true,topAtStart:h0,topAtEnd:h1,joinedRoofClosure:true});
 wallPieces.push({wall:id,a:start,b:end,low:wall.top,high:Math.max(h0,h1),innerOnly:true,joinedRoofClosure:true});
}
// Beams stop at the stair opening and the carport boundary.
for(const [f,y]of [[0,.02],[1,2.95]])for(const [z,x0,x1]of [[-2.275,0,4.05],[1.125,0,5.05],[3.825,2.55,5.05]]){
 const m=box('structure',f,(x0+x1)/2,y,z,x1-x0,.2,.18,mats.beam,'Reinforced concrete beam','S-1 · User correction','Beam terminates clear of the stairwell and carport. Sections remain schematic.');
 Object.assign(m.userData,{beamBounds:{x0,x1,z}});
}
// IMG_5151 supersedes the square lower landing: a rectangular first
// step leads into the turn. The second is triangular but its entry edge
// stays parallel to the first. Step 3's nosing meets the rear wall before
// the corner; triangular step 4 meets the side wall just past the corner.
const stair={treads:13,riser:2.85/14,width:.84,turn:{x:4.55,z:-3.325,size:.84,winders:3,cornerOffset:.34},bottomGoing:.26,landingZ:-1.05,counterGap:.50};
const mainInnerX=stair.turn.x-stair.width/2;
stair.upperTurn={startZ:stair.landingZ+.325-stair.width,endZ:stair.landingZ+.325,winders:3,exitX:mainInnerX};
stair.bottomStartX=mainInnerX-2*stair.bottomGoing;
const pivot=[stair.bottomStartX+stair.bottomGoing,stair.turn.z+stair.width/2],rearCorner=[pivot[0],stair.turn.z-stair.width/2],outerRear=[stair.turn.x+stair.width/2,rearCorner[1]],outerFront=[outerRear[0],pivot[1]];
const beforeCorner=[outerRear[0]-stair.turn.cornerOffset,rearCorner[1]],afterCorner=[outerRear[0],rearCorner[1]+stair.turn.cornerOffset];
const stairNote='Lower stair arrangement: first step rectangular; second triangular with its front edge parallel to the first. Step 3 has its nosing meet the rear wall before the corner; triangular step 4 has its nosing meet the side wall just beyond the corner, completing the turn. The middle fan tread wraps the outside corner. There is no lower landing. Counter clearance is 500 mm. The 340 mm offsets before/after the corner, other tread dimensions and riser heights are visual estimates.';
const stairNosingMat=material(0x555a58,.15),stairNosings=[];
function treadNosing(a,b,top,source='IMG_5151',detail=stairNote){const m=beam('structure',0,[a[0],top+.006,a[1]],[b[0],top+.006,b[1]],.025,.018,stairNosingMat,'Stair tread nosing',source,detail);m.userData.stairNosing=true;stairNosings.push(m);}
for(let i=0;i<1;i++){
 const top=.25+(i+1)*stair.riser,x=stair.bottomStartX+(i+.5)*stair.bottomGoing;
 const tread=box('structure',0,x,top-stair.riser/2,stair.turn.z,stair.bottomGoing,stair.riser,stair.width,mats.concrete,`Stair bottom step ${i+1}`,'IMG_5151 · A-3',stairNote);
 Object.assign(tread.userData,{stairTread:i+1,stairFlight:'bottom',ascent:'west',frontFaces:'kitchen sink'});
 treadNosing([x-stair.bottomGoing/2,rearCorner[1]],[x-stair.bottomGoing/2,pivot[1]],top);
}
for(const [i,polygon]of [[0,[pivot,rearCorner,beforeCorner]],[1,[pivot,beforeCorner,outerRear,afterCorner]],[2,[pivot,afterCorner,outerFront]]]){
 const top=.25+(i+2)*stair.riser,shape=new THREE.Shape();shape.moveTo(...polygon[0]);polygon.slice(1).forEach(p=>shape.lineTo(...p));shape.closePath();
 const geo=new THREE.ExtrudeGeometry(shape,{depth:stair.riser,bevelEnabled:false,steps:1});geo.rotateX(Math.PI/2);
 const tread=part(geo,mats.concrete,'structure',0,[0,top,0],`Lower stair winder · step ${i+2}`,'IMG_5151 · A-3',stairNote);
 Object.assign(tread.userData,{stairTread:i+2,stairFlight:'winder',stairWinder:true,polygon,entryParallelToFirst:i===0,ascent:'west to south'});
 treadNosing(polygon[0],polygon[1],top);
}
const lowerSteps=1+stair.turn.winders;
const runStart=pivot[1],runEnd=stair.upperTurn.startZ,runSteps=stair.treads-lowerSteps-stair.upperTurn.winders,going=(runEnd-runStart)/runSteps;
stair.bottomZ=runStart+going/2;stair.topZ=runEnd-going/2;
for(let i=0;i<runSteps;i++){
 const number=i+lowerSteps+1,top=.25+number*stair.riser,z=runStart+(i+.5)*going;
 const tread=box('structure',0,stair.turn.x,top-stair.riser/2,z,stair.width,stair.riser,going,mats.concrete,`Stair tread ${number} · main flight`,'IMG_5151 · A-3',stairNote);
 Object.assign(tread.userData,{stairTread:number,stairFlight:'main',ascent:'south'});
 treadNosing([mainInnerX,z-going/2],[outerFront[0],z-going/2],top);
}
// IMG_5150: tapered winders turn the south-rising flight east into the
// second-floor landing. The middle fan tread follows the outside corner.
const upperPivot=[mainInnerX,runEnd],upperOuterX=stair.turn.x+stair.width/2;
const upperRay0=[upperOuterX,runEnd],upperRay30=[upperOuterX,runEnd+stair.width*Math.tan(Math.PI/6)],upperCorner=[upperOuterX,stair.upperTurn.endZ],upperRay60=[mainInnerX+stair.width/Math.tan(Math.PI/3),stair.upperTurn.endZ],upperRay90=[mainInnerX,stair.upperTurn.endZ];
const upperStairNote='The upper stairs have a tapered triangular pivot. Three fan-shaped turning treads rise around the inner corner, turning the main flight east onto the second-floor landing. The middle tread wraps the outside corner. Tread count is interpreted from the photo; sizes, fan angles and riser heights remain approximate.';
for(const [i,polygon]of [[0,[upperPivot,upperRay0,upperRay30]],[1,[upperPivot,upperRay30,upperCorner,upperRay60]],[2,[upperPivot,upperRay60,upperRay90]]]){
 const number=runSteps+lowerSteps+1+i,top=.25+number*stair.riser,shape=new THREE.Shape();shape.moveTo(...polygon[0]);polygon.slice(1).forEach(p=>shape.lineTo(...p));shape.closePath();
 const geo=new THREE.ExtrudeGeometry(shape,{depth:stair.riser,bevelEnabled:false,steps:1});geo.rotateX(Math.PI/2);
 const tread=part(geo,mats.concrete,'structure',0,[0,top,0],`Upper stair winder ${i+1}`,'IMG_5150 · A-3',upperStairNote);
 Object.assign(tread.userData,{stairTread:number,stairFlight:'upper-winder',stairWinder:true,polygon,ascent:'south to east'});
 treadNosing(polygon[0],polygon[1],top,'IMG_5150',upperStairNote);
}
const upperLandingStartX=3.15;
box('structure',1,(upperLandingStartX+mainInnerX)/2,3.025,(runEnd+stair.upperTurn.endZ)/2,mainInnerX-upperLandingStartX,.15,stair.width,mats.concrete,'Upper stair landing','IMG_5150 · A-3',upperStairNote).userData.stairUpperLanding=true;
objects.find(m=>m.userData.stairUpperLanding).userData.measurementKind='floor';
// Counter outline makes the reported 500 mm horizontal clearance reviewable.
// Its remaining dimensions and sink offset are estimates within the kitchen.
const kitchenCounter={startX:2.125,endX:stair.bottomStartX-stair.counterGap,rearZ:-3.75,frontZ:-3.15,top:1.10,thickness:.055};
kitchenCounter.width=kitchenCounter.endX-kitchenCounter.startX;kitchenCounter.sinkX=kitchenCounter.endX-.425;
const counterDetail='Counter edge is 500 mm from the nearest bottom-step edge, as supplied by you. Counter depth, height, supports and sink offset remain approximate.';
box('structure',0,(kitchenCounter.startX+kitchenCounter.endX)/2,kitchenCounter.top-kitchenCounter.thickness/2,(kitchenCounter.rearZ+kitchenCounter.frontZ)/2,kitchenCounter.width,kitchenCounter.thickness,kitchenCounter.frontZ-kitchenCounter.rearZ,mats.concrete,'Kitchen counter · 500 mm stair clearance','IMG_5151 · A-4',counterDetail).userData.kitchenCounter=true;
for(const x of [kitchenCounter.startX+.02,kitchenCounter.endX-.02])box('structure',0,x,(.25+kitchenCounter.top-kitchenCounter.thickness)/2,(kitchenCounter.rearZ+kitchenCounter.frontZ)/2,.04,kitchenCounter.top-kitchenCounter.thickness-.25,kitchenCounter.frontZ-kitchenCounter.rearZ,mats.concrete,'Kitchen counter support · approximate','IMG_5151 · A-4',counterDetail);
function material(color,metalness=0){return new THREE.MeshStandardMaterial({color,roughness:.5,metalness});}
const frameMat=material(0x82a9b8,.45),electricalMat=material(0xf5b74e,.2),powerMat=material(0xdf8d39,.2),waterMat=material(0x48b8ff,.3),wasteMat=material(0xb7a0f8,.2),fixtureMat=material(0xc0d9e8),skinMat=material(0x44627b,.35),railMat=material(0x7b8d9d,.45);
function beam(sys,f,a,b,width,depth,mat,name,source,detail){const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),d=bv.clone().sub(av);const mesh=part(new THREE.BoxGeometry(width,d.length(),depth),mat,sys,f,av.clone().add(bv).multiplyScalar(.5).toArray(),name,source,detail);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());return mesh;}
function route(sys,f,points,radius,mat,name,source,detail){const group=new THREE.Group();for(let i=1;i<points.length;i++){const a=new THREE.Vector3(...points[i-1]),b=new THREE.Vector3(...points[i]),delta=b.clone().sub(a);if(delta.length()<.001)continue;const m=part(new THREE.CylinderGeometry(radius,radius,delta.length(),8),mat,sys,f,a.add(b).multiplyScalar(.5).toArray(),name,source,detail,false);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());}for(const pt of points.slice(1,-1))part(new THREE.SphereGeometry(radius,8,6),mat,sys,f,pt,name,source,detail,false);return group;}
// Frames, closed door leaves, and casement divisions follow the A-4 schedule.
function opening(o){
 const {system:sys,floor:f,x,z,w,h,sill,axis,name,code,base,style}=o;
 const y=base+sill,title=code+' · '+name,start=objects.length;
 const detail=`${o.description}. Opening size: ${w.toFixed(2)} × ${h.toFixed(2)} m; sill ${sill.toFixed(2)} m above the local floor. Center position remains approximate. ${sys==='doors'?'Shown closed in its wall opening.':''}`;
 const transform=(along,up,normal=0)=>axis==='x'?[x+along,y+up,z+normal]:[x+normal,y+up,z+along];
 const main=box(sys,f,x,y+h/2,z,axis==='x'?w-.08:.04,h-.08,axis==='x'?.04:w-.08,sys==='doors'?mats.door:mats.glass,title,'A-2 · A-4',detail);
 function bar(a,b){beam(sys,f,transform(...a),transform(...b),.035,.06,frameMat,title+' frame','A-2 · A-4',detail);}
 for(const side of [-w/2+.02,w/2-.02])bar([side,.02],[side,h-.02]);
 for(const up of [h-.02,...(sys==='windows'?[.02]:[])])bar([-w/2+.02,up],[w/2-.02,up]);
 if(sys==='windows'){
  if(style!=='awning')bar([-w/2+.02,h/2],[w/2-.02,h/2]);
  const columns=['four-pane','acu-left','acu-right'].includes(style)?4:style==='single-column'||style==='awning'?1:2;
  for(let i=1;i<columns;i++){
   const along=-w/2+w*i/columns;
   const partial=style==='acu-full'||(style==='acu-left'&&along<0)||(style==='acu-right'&&along>0);
   bar([along,.02],[along,partial?h/2:h-.02]);
  }
  // F / AC provision is a fixed glazed panel, confirmed by IMG_3334.
  // The continuous glazing and omitted upper mullions already represent it.

 }else{
  const handleSide=['balcony-door','upper-bath-door','ground-bath-door','service-door'].includes(o.id)?-1:1;
  for(const face of [-1,1]){
   const handle=part(new THREE.SphereGeometry(.038,10,8),railMat,sys,f,transform(handleSide*w*.32,1.0,face*.045),title+' handle','A-4',detail+' Matching knobs on both door faces.',false);
   Object.assign(handle.userData,{doorHandle:true,normalSide:face});
  }
  if(style==='louver'){
   for(let i=0;i<5;i++){const pos=transform(0,.23+i*.045,.026);box(sys,f,...pos,axis==='x'?w*.58:.065,.018,axis==='x'?.065:w*.58,frameMat,title+' vent','A-4',detail);}
  }else{
   for(const up of [.52,1.36,1.87])for(const along of [-w*.2,w*.2]){
    const pos=transform(along,up);box(sys,f,...pos,axis==='x'?w*.29:.065,up>1.8?.26:.61,axis==='x'?.065:w*.29,mats.door,title+' panel','A-4',detail);
   }
  }
 }
 objects.slice(start).forEach(m=>Object.assign(m.userData,{openingId:o.id,wallId:o.wall,code:o.code,scheduledWidth:w,scheduledHeight:h,sill,positionAccuracy:'Approximate center offset'}));
 main.userData.openingMain=true;
}
reviewedOpenings.forEach(opening);
// Side guards serve open end lots; the shared inner-lot firewall replaces them.
for(const z of [2.325,3.825])for(const x of [0,2.55]){
 const post=beam('structure',1,[x,3.1,z],[x,4.15,z],.045,.045,railMat,'Balcony guardrail post','A-4');
 if(x===0)post.userData.endOnly=true;
}
for(let i=0;i<7;i++){
 const y=3.3+i*.14;
 const front=beam('structure',1,[0,y,3.825],[2.55,y,3.825],.025,.025,railMat,'Balcony horizontal rail','A-4');front.userData.endOnly=true;
 const sharedFront=beam('structure',1,[.075,y,3.825],[2.55,y,3.825],.025,.025,railMat,'Balcony horizontal rail','A-4','Front guard meets the inner face of the shared side firewall.');sharedFront.userData.innerOnly=true;sharedFront.visible=false;
 const side=beam('structure',1,[0,y,2.325],[0,y,3.825],.025,.025,railMat,'Balcony side rail','A-4');side.userData.endOnly=true;
}
// Handrail starts on step 4 and follows the upper turn to the landing guard.
// The former ST-E2I / LD-W2I wall is replaced by this guard, ending at LD-NI.
const railEdgeOffset=.05,turnRailY=.25+lowerSteps*stair.riser+.8;
const upperRailY=.25+(runSteps+lowerSteps)*stair.riser+.8;
const guardX=walls.find(w=>w.id==='u-stair').a[0];
const guardNorthZ=walls.find(w=>w.id==='u-bath-south').a[1];
// Stop at the north edge of the landing entry, preserving the stair exit.
const guardSouthZ=runEnd+railEdgeOffset,guardTop=3.9;
const stairRailNote='Railing begins on step 4, with its centerline 50 mm inside the open stair edge. It turns on step 12, two steps before the landing, and joins the landing guard at the north edge of the entry. The guard stops there so the upper winders open onto the landing. Rail height remains an estimated 800 mm.';
function stairRail(f,a,b,name,guard=false){
 const m=beam('structure',f,a,b,.035,.035,railMat,name,'IMG_5151 · IMG_5150',stairRailNote);
 Object.assign(m.userData,{stairRail:true,stairGuard:guard,railStart:a,railEnd:b});return m;
}
function stairRailPost(f,point,base,name){
 const m=beam('structure',f,[point[0],base,point[2]],point,.04,.04,railMat,name,'IMG_5151 · IMG_5150',stairRailNote);
 Object.assign(m.userData,{stairRailPost:true,railBase:base,railTop:point});return m;
}
const railX=mainInnerX+railEdgeOffset;
const stairRailPoints=[
 [railX,turnRailY,runStart-railEdgeOffset],
 [railX,upperRailY,runEnd],
 [mainInnerX+railEdgeOffset*Math.cos(Math.PI/6),.25+12*stair.riser+.8,runEnd+railEdgeOffset*Math.sin(Math.PI/6)],
 [mainInnerX+railEdgeOffset*Math.cos(Math.PI/3),.25+13*stair.riser+.8,runEnd+railEdgeOffset*Math.sin(Math.PI/3)],
 [mainInnerX,guardTop,runEnd+railEdgeOffset],
 [guardX,guardTop,guardSouthZ]
];
for(let i=1;i<stairRailPoints.length;i++)stairRail(0,stairRailPoints[i-1],stairRailPoints[i],'Stair handrail · starts step 4');
stairRailPost(0,stairRailPoints[0],.25+4*stair.riser,'Stair rail support · step 4').userData.supportStep=4;
// Place the upper support inside step 11, on the existing handrail segment.
const step11RailTop=stairRailPoints[1].map((v,i)=>(v+stairRailPoints[2][i])/2);
stairRailPost(0,step11RailTop,.25+11*stair.riser,'Stair rail support · step 11').userData.supportStep=11;
const guardStart=stairRailPoints.at(-1),guardEnd=[guardX,guardTop,guardNorthZ];
stairRail(1,guardStart,guardEnd,'Landing railing · ends at LD-NI',true);
stairRail(1,[guardX,3.50,guardSouthZ],[guardX,3.50,guardNorthZ],'Landing railing · middle rail',true);
const guardPosts=Math.ceil((guardSouthZ-guardNorthZ)/.30);
for(let i=0;i<=guardPosts;i++)stairRailPost(1,[guardX,guardTop,THREE.MathUtils.lerp(guardSouthZ,guardNorthZ,i/guardPosts)],3.1,'Open landing railing post');
// S-2: split mono-pitch roofs, longitudinal members and cross purlins.
const roofSkins=[];
const roofPlanes=[];
const canopyGroups=[];
const canopySoffits=[];
// End units retain the shortened eave; inner units cover the full balcony.
const balconySideWindow=reviewedOpenings.find(o=>o.id==='bedroom-side');
const masterNorthWall=walls.find(w=>w.id==='u-master-rear');
const balconyRoof={...leftRoofProfile,endZ:balconySideWindow.z,westX:masterWestWall.a[0]-.075};
balconyRoof.northProjection=-balconyRoof.eastX;
balconyRoof.rearZ=masterNorthWall.a[1]-balconyRoof.northProjection;
balconyRoof.heightAt=z=>balconyRoof.referenceY-balconyRoof.pitch*(z-balconyRoof.referenceZ);
balconyRoof.rearY=balconyRoof.heightAt(balconyRoof.rearZ);
const innerBalconyRoof={...balconyRoof,rearZ:westFirewallEndZ,rearY:balconyRoof.heightAt(westFirewallEndZ),endZ:walls.find(w=>w.id==='g-side').b[1]};
const innerBalconyRoofNote='The inner-unit balcony canopy starts at the master front parapet and extends to the balcony outer edge, retaining its original slope. The main roof behind the parapet shares the west roof slope.';
const bathroomRoofWall=walls.find(w=>w.id==='u-bath-side');
const masterRoofCutX=bathroomRoofWall.a[0]-.075-.003;
const bathroomRoof={x0:bathroomRoofWall.a[0]+.075+.003,x1:rightRoofCut.x,z0:rightRoofSpec.z0,z1:rightRoofCut.z+.003};
const bathroomRoofRegions=[{x0:bathroomRoof.x0,x1:rightRoofSpec.x0,z0:bathroomRoof.z0,z1:bathroomRoof.z1,bathroomExtension:true}];
const bathroomRoofNote='The bathroom covering is part of the Bedroom 1 roof: one continuous surface with the same slope as Bedroom 1. The master-bedroom roof remains separate and clears the bathroom. Covering and framing follow the bathroom extension. Heights and member profiles remain approximate.';
const balconyRoofNote='The separate master-bedroom roof keeps its nominal 400 mm exposed north/east eave projection and ends at the BL-WI window midpoint. Its corner clears the bathroom roof. Roof pitch, absolute height and member profiles remain approximate.';
const rightRoofNote='Bedroom 1 and bathroom share the original west roof slope. Roof edges stop inside the west and north firewalls; the east roof stops at the middle wall. Extended wall heights follow the latest east-apex and front-parapet datums.';
function roofCovering(r,outline,regions,name,detail,flags={},left=false){
 const slope=(r.y1-r.y0)/(r.z1-r.z0),height=z=>r.y0+(z-r.z0)*slope;
 const shape=new THREE.Shape();outline.forEach(([x,z],i)=>i?shape.lineTo(x,-z):shape.moveTo(x,-z));shape.closePath();
 const geometry=new THREE.ExtrudeGeometry(shape,{depth:.035,bevelEnabled:false,steps:1}),positions=geometry.attributes.position,angle=Math.atan(slope);
 for(let i=0;i<positions.count;i++){const x=positions.getX(i),z=-positions.getY(i),offset=positions.getZ(i)-.035/2;positions.setXYZ(i,x,height(z)+.14+offset*Math.cos(angle),z-offset*Math.sin(angle));}
 geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
 const skin=part(geometry,skinMat,'roof',2,[0,0,0],name,'A-3 · S-2',detail);
 Object.assign(skin.userData,{skin:true,continuousRoof:true,roofOutline:outline,roofRegions:regions,roofSlope:slope,roofHeightOrigin:[r.z0,r.y0+.14],...flags,measurementSpecs:[{a:[Math.min(...outline.map(p=>p[0])),height(r.z0)+.14,r.z0],b:[r.x1,height(r.z0)+.14,r.z0],offset:[0,0,-.28],label:'Overall width'},{a:[left?r.x0:r.x1,height(r.z0)+.14,r.z0],b:[left?r.x0:r.x1,height(r.z1)+.14,r.z1],offset:[left?-.28:.28,0,0],label:'Slope length'}]});roofSkins.push(skin);return skin;
}
for(const r of [...[balconyRoof,innerBalconyRoof].map((roof,i)=>({x0:roof.eastX,x1:roof.westX,z0:roof.rearZ,z1:roof.endZ,y0:roof.rearY,y1:roof.heightAt(roof.endZ),variant:i?'inner':'end'})),{...rightRoofSpec,variant:'end',westRoof:true}]){
 const start=objects.length,leftRoof=!r.westRoof,notchedMaster=leftRoof&&r.variant==='end',roofNote=r.variant==='inner'?innerBalconyRoofNote:balconyRoofNote,slope=(r.y1-r.y0)/(r.z1-r.z0),height=z=>r.y0+(z-r.z0)*slope;
 for(let x=r.x0+.14;x<=r.x1+.01;x+=(r.x1-r.x0-.28)/2){
  const z0=notchedMaster&&x>=masterRoofCutX?bathroomRoof.z1:r.z0;
  beam('roof',2,[x,height(z0),z0],[x,r.y1,r.z1],.075,.13,mats.roof,'Sloping roof member','S-2','Roof arrangement follows the split slopes. Member profiles and connections are simplified.');
  beam('roof',2,[x,height(z0)-.24,z0],[x,r.y1-.24,r.z1],.05,.06,mats.roof,'Roof frame lower member','S-2');
  for(let z=z0;z<r.z1-.2;z+=.8){const next=Math.min(z+.8,r.z1);beam('roof',2,[x,height(z)-.24,z],[x,height(next),next],.026,.026,mats.roof,'Roof frame bracing','S-2','Illustrative bracing based on the roof section.');}
 }
 const n=Math.ceil((r.z1-r.z0)/.8);for(let i=0;i<=n;i++){
  const z=THREE.MathUtils.lerp(r.z0+.05,r.z1-.05,i/n),x1=notchedMaster&&z<bathroomRoof.z1?masterRoofCutX:r.x1;
  beam('roof',2,[r.x0,height(z)+.06,z],[x1,height(z)+.06,z],.075,.10,mats.roof,'Roof purlin','S-2','Purlin spacing is approximately 0.80 m.');
 }
 if(!leftRoof)for(const region of bathroomRoofRegions){
  for(let i=0;i<2;i++){const x=THREE.MathUtils.lerp(region.x0+.10,region.x1-.10,i);beam('roof',2,[x,height(region.z0),region.z0],[x,height(region.z1),region.z1],.075,.13,mats.roof,'Bathroom Bedroom 1 roof · sloping member','S-2',bathroomRoofNote);beam('roof',2,[x,height(region.z0)-.24,region.z0],[x,height(region.z1)-.24,region.z1],.05,.06,mats.roof,'Bathroom Bedroom 1 roof · lower member','S-2',bathroomRoofNote);}
  const count=Math.ceil((region.z1-region.z0)/.8);for(let i=0;i<=count;i++){const z=THREE.MathUtils.lerp(region.z0+.04,region.z1-.04,i/count);beam('roof',2,[region.x0,height(z)+.06,z],[region.x1,height(z)+.06,z],.075,.10,mats.roof,'Bathroom Bedroom 1 roof · purlin','S-2',bathroomRoofNote);}
 }
 const regions=notchedMaster?[{x0:r.x0,x1:masterRoofCutX,z0:r.z0,z1:bathroomRoof.z1},{x0:r.x0,x1:r.x1,z0:bathroomRoof.z1,z1:r.z1}]:leftRoof?[r]:[r,...bathroomRoofRegions];
 const outline=notchedMaster?[[r.x0,r.z0],[masterRoofCutX,r.z0],[masterRoofCutX,bathroomRoof.z1],[r.x1,bathroomRoof.z1],[r.x1,r.z1],[r.x0,r.z1]]:leftRoof?[[r.x0,r.z0],[r.x1,r.z0],[r.x1,r.z1],[r.x0,r.z1]]:[[r.x0,r.z0],[r.x1,r.z0],[r.x1,r.z1],[r.x0,r.z1],[r.x0,bathroomRoof.z1],[bathroomRoof.x0,bathroomRoof.z1],[bathroomRoof.x0,bathroomRoof.z0],[r.x0,bathroomRoof.z0]];
 roofCovering(r,outline,regions,leftRoof?(r.variant==='inner'?'Balcony canopy roof covering':'Master-bedroom roof covering'):'Bedroom 1 and bathroom · continuous roof covering',leftRoof?roofNote:bathroomRoofNote,{bathroomRoofExtension:!leftRoof},leftRoof);
 const group=new THREE.Group();systems.roof[2].add(group);objects.slice(start).forEach(m=>{group.add(m);Object.assign(m.userData,leftRoof?{balconyRoof:true,roofVariant:r.variant,roofVariantFrame:!m.userData.skin,detail:roofNote}:{rightRoof:true,roofVariant:'end',roofVariantFrame:!m.userData.skin,detail:rightRoofNote});if(m.userData.name.startsWith('Bathroom Bedroom 1 roof'))m.userData.bathroomRoofExtension=true;});roofPlanes.push(group);
}
// One connected outline covers both bedrooms and the bathroom behind the canopy.
const innerMainRoof={x0:.075,x1:rightRoofSpec.x1,z0:rightRoofSpec.z0,z1:rightRoofSpec.z1,y0:rightRoofSpec.y0,y1:rightRoofSpec.y1};
const innerMainRoofRegions=[
 {x0:innerMainRoof.x0,x1:masterRoofCutX,z0:balconyRoof.rearZ,z1:westFirewallEndZ},
 {x0:masterRoofCutX,x1:bathroomRoof.x0,z0:bathroomRoof.z1,z1:westFirewallEndZ},
 {x0:bathroomRoof.x0,x1:rightRoofSpec.x0,z0:innerMainRoof.z0,z1:westFirewallEndZ},
 {...rightRoofSpec}
];
const innerMainRoofOutline=[[innerMainRoof.x0,balconyRoof.rearZ],[masterRoofCutX,balconyRoof.rearZ],[masterRoofCutX,bathroomRoof.z1],[bathroomRoof.x0,bathroomRoof.z1],[bathroomRoof.x0,innerMainRoof.z0],[innerMainRoof.x1,innerMainRoof.z0],[innerMainRoof.x1,innerMainRoof.z1],[rightRoofSpec.x0,innerMainRoof.z1],[rightRoofSpec.x0,westFirewallEndZ],[innerMainRoof.x0,westFirewallEndZ]];
const innerMainRoofNote='Inner-unit master bedroom, Bedroom 1 and bathroom share one continuous roof covering at the west roof slope. The balcony canopy keeps its separate slope in front of the parapet. Internal room partitions close below the joined roof without exposed middle coping.';
{
 const start=objects.length;
 for(const r of innerMainRoofRegions){
  const count=Math.max(1,Math.ceil((r.x1-r.x0)/1.2));
  for(let i=0;i<=count;i++){
   const x=THREE.MathUtils.lerp(r.x0+.08,r.x1-.08,i/count);
   beam('roof',2,[x,westRoofHeightAt(r.z0),r.z0],[x,westRoofHeightAt(r.z1),r.z1],.075,.13,mats.roof,'Joined roof · sloping member','S-2',innerMainRoofNote);
   beam('roof',2,[x,westRoofHeightAt(r.z0)-.24,r.z0],[x,westRoofHeightAt(r.z1)-.24,r.z1],.05,.06,mats.roof,'Joined roof · lower member','S-2',innerMainRoofNote);
   for(let z=r.z0;z<r.z1-.2;z+=.8){const next=Math.min(z+.8,r.z1);beam('roof',2,[x,westRoofHeightAt(z)-.24,z],[x,westRoofHeightAt(next),next],.026,.026,mats.roof,'Joined roof · bracing','S-2',innerMainRoofNote);}
  }
  const rows=Math.ceil((r.z1-r.z0)/.8);for(let i=0;i<=rows;i++){const z=THREE.MathUtils.lerp(r.z0+.05,r.z1-.05,i/rows);beam('roof',2,[r.x0,westRoofHeightAt(z)+.06,z],[r.x1,westRoofHeightAt(z)+.06,z],.075,.10,mats.roof,'Joined roof · purlin','S-2',innerMainRoofNote);}
 }
 roofCovering(innerMainRoof,innerMainRoofOutline,innerMainRoofRegions,'Master bedroom, Bedroom 1 and bathroom · joined roof covering',innerMainRoofNote,{joinedInnerRoof:true,bathroomRoofExtension:true});
 const group=new THREE.Group();systems.roof[2].add(group);objects.slice(start).forEach(m=>{group.add(m);Object.assign(m.userData,{joinedInnerRoof:true,roofVariant:'inner',roofVariantFrame:!m.userData.skin});});roofPlanes.push(group);
}
// The entrance canopy is centered on D1 and limited to the door's span.
// Derive it from the opening so handed views stay aligned with the entrance.
const mainEntry=reviewedOpenings.find(o=>o.id==='main-entry');
for(const [f,x,y,z,w,d]of [[0,mainEntry.x,2.65,mainEntry.z+.35,mainEntry.w,.75],[1,1.3,5.75,3.98,2.85,.55]]){
 const start=objects.length,drop=.12,slope=Math.atan2(drop,d);
 const source=f===0?'IMG_3333 · A-4':'S-2';
 const detail=f===0?'Entrance canopy centered above D1 and limited to its 0.90 m span, with a flat horizontal soffit beneath the sloping roof covering, as requested. Projection, height and roof slope remain approximate.':'Canopy outline and local profiles remain approximate.';
 for(const offset of [-w/2+.035,w/2-.035])beam('roof',f,[x+offset,y,z-d/2],[x+offset,y-drop,z+d/2],.065,.07,mats.roof,'Front canopy frame',source,detail);
 for(const off of [-d/2+.04,d/2-.04]){const h=y-drop*(off+d/2)/d;beam('roof',f,[x-w/2,h,z+off],[x+w/2,h,z+off],.065,.07,mats.roof,'Canopy purlin',source,detail);}
 const cover=(mesh)=>{mesh.userData.skin=true;roofSkins.push(mesh);return mesh;};
 const skin=cover(box('roof',f,x,y-drop/2+.065,z,w,.04,Math.hypot(d,drop),skinMat,'Canopy covering',source,detail));skin.rotation.x=slope;skin.userData.measurementKind='roof';
 cover(box('roof',f,x,y-drop+.005,z+d/2-.015,w,.14,.03,skinMat,'Canopy front fascia',source,detail));
 const flatBottom=y-drop-.065;
 for(const side of [-1,1]){
  if(f===0){
   // Sloping top edge and level bottom edge enclose the varying roof void.
   const geo=new THREE.BoxGeometry(.03,.20,d),vertices=geo.attributes.position;
   for(let i=0;i<vertices.count;i++){const top=y+.075-drop*(vertices.getZ(i)+d/2)/d;vertices.setY(i,vertices.getY(i)>0?top:flatBottom);}
   geo.computeVertexNormals();cover(part(geo,skinMat,'roof',f,[x+side*(w/2-.015),0,z],'Canopy side fascia',source,detail));
  }else{const trim=cover(box('roof',f,x+side*(w/2-.015),y-drop/2-.005,z,.03,.13,Math.hypot(d,drop),skinMat,'Canopy side fascia',source,detail));trim.rotation.x=slope;}
 }
 const underside=cover(box('roof',f,x,f===0?flatBottom+.0125:y-drop/2-.06,f===0?z-.015:z,f===0?w-.06:w,.025,f===0?d-.03:Math.hypot(d,drop),frameMat,'Canopy soffit',source,detail));underside.rotation.x=f===0?0:slope;canopySoffits.push(underside);
 const group=new THREE.Group();systems.roof[f].add(group);objects.slice(start).forEach(m=>group.add(m));canopyGroups.push(group);
}
// Finished coverings and the exposed frame are complementary inspection modes.
const roofFrames=objects.filter(m=>m.userData.system==='roof'&&!m.userData.skin);
// Visible details observed on the right-end house. Local profiles are visual
// estimates; these do not replace the blueprint's structural specifications.
const darkFascia=material(0x39383a,.25);
const photoNote='Visible in the supplied right-end photographs. Profile and projection are estimated from perspective photos; plan dimensions remain the scale reference.';
function photoBox(sys,f,x,y,z,w,h,d,mat,name,source,cover=false){const m=box(sys,f,x,y,z,w,h,d,mat,name,source,photoNote);m.userData.photoOnly=true;m.userData.photoCover=cover;photoOnly.push(m);return m;}
// IMG_5152: rear firewall projects east of the upper bathroom facade,
// then steps outward farther near the roof. Projections are user estimates.
const firewallBathWall=walls.find(w=>w.id==='u-bath-side'),firewallRearWall=walls.find(w=>w.id==='u-rear');
const rearFirewall={joinX:firewallBathWall.a[0],bathFaceX:firewallBathWall.a[0]-.075,z:firewallRearWall.a[1],thickness:.15,lowerProjection:.3048,upperProjection:.6096,stepHeight:5.40,top:firewallApexHeight};
rearFirewall.lowerEndX=rearFirewall.bathFaceX-rearFirewall.lowerProjection;rearFirewall.upperEndX=rearFirewall.bathFaceX-rearFirewall.upperProjection;
const firewallNote='Rear firewall: stepped rear/north firewall extension beside the upper bathroom, projecting east about 1 ft (305 mm) from the bathroom exterior face below the step and 2 ft (610 mm) total near the roofline. These are approximate horizontal projections, not wall heights. Its masonry top is 130 mm above the east roof apex, with 150 mm coping above it. Step height, wall thickness and absolute elevation remain approximate. The dark top finish is represented as metal coping; construction and internal support are not established by the photo.';
function firewallPiece(f,x0,x1,y0,y1,name){const m=box('structure',f,(x0+x1)/2,(y0+y1)/2,rearFirewall.z,x1-x0,y1-y0,rearFirewall.thickness,mats.wall,name,'IMG_5152',firewallNote);Object.assign(m.userData,{isWall:true,rearFirewall:true,wallId:'rear-firewall-extension'});return m;}
firewallPiece(0,rearFirewall.lowerEndX,rearFirewall.joinX,.25,3.1,'FW · Rear firewall extension · lower');
firewallPiece(1,rearFirewall.lowerEndX,rearFirewall.joinX,3.1,rearFirewall.top,'FW · Rear firewall extension · upper');
firewallPiece(1,rearFirewall.upperEndX,rearFirewall.lowerEndX,rearFirewall.stepHeight,rearFirewall.top,'FW · Projecting roofline wing');
const firewallCoping=photoBox('roof',1,(rearFirewall.upperEndX+firewallRearWall.b[0])/2,rearFirewall.top+copingHeight/2,rearFirewall.z,firewallRearWall.b[0]-rearFirewall.upperEndX+.04,.15,rearFirewall.thickness+.04,darkFascia,'FW · Rear firewall metal coping','IMG_5152',true);
Object.assign(firewallCoping.userData,{rearFirewallCoping:true,detail:firewallNote});
const westFirewallWall=walls.find(w=>w.id==='u-party'),bathEastWall=walls.find(w=>w.id==='u-bath-side');
for(const [x,z,w,d,y,name,h=.15]of [
 [westFirewallWall.a[0],(westFirewallWall.a[1]+westFirewallEndZ)/2,.19,westFirewallEndZ-westFirewallWall.a[1]+.04,firewallApexHeight+copingHeight/2,'FW · West firewall coping'],
 [bathEastWall.a[0],(bathEastWall.a[1]+bathEastWall.b[1])/2,.19,bathEastWall.b[1]-bathEastWall.a[1]+.04,firewallApexHeight+copingHeight/2,'B1-EI · Apex wall coping'],
 [bathSouthWall.a[0]+.25,bathSouthWall.a[1],.54,.19,bathSouthTop+copingHeight/2,'B1-S1I · Raised wall coping'],
 [westWall.a[0],(westFirewallEndZ+westWall.b[1])/2,.19,westWall.b[1]-westFirewallEndZ+.04,frontParapet.capY,'FW · Front west firewall coping',frontParapet.capHeight],
 [masterWestWall.a[0],(westFirewallEndZ+masterWestWall.b[1])/2,.19,masterWestWall.b[1]-westFirewallEndZ+.04,frontParapet.capY,'BL-WI · Apex wall coping',frontParapet.capHeight]
]){const cap=photoBox('roof',1,x,y,z,w,h,d,darkFascia,name,'A-2 · A-3',true);Object.assign(cap.userData,{roofApexCoping:true,bathSouthCoping:name.startsWith('B1-S1I'),...(name.startsWith('B1-S1I')?{roofVariant:'end'}:{}),detail:name.startsWith('B1-S1I')?southWallNote:(name.startsWith('BL-WI')||name.startsWith('FW · Front'))?balconyWallHeightNote:raisedWallNote});}
// Rear middle coping uses the east-apex datum; front spans use the front parapet.
const middleCopingNote=raisedWallNote;
const middleCoping=photoBox('roof',1,masterWestWall.a[0],firewallApexHeight+copingHeight/2,(masterWestWall.a[1]+westFirewallEndZ)/2,.19,.15,westFirewallEndZ-masterWestWall.a[1]+.04,darkFascia,'MB-W1I / MB-W2I · Middle wall coping','User wall correction',true);
Object.assign(middleCoping.userData,{roofApexCoping:true,middleWallCoping:true,roofVariant:'end',wallId:masterWestWall.id,detail:middleCopingNote});
// White balcony edge / floor band, which was missing from the simple slab.
photoBox('structure',1,1.275,2.96,3.84,2.70,.43,.19,photoTrim,'Balcony front fascia','IMG_3333 · IMG_3335');
photoBox('structure',1,-.035,2.96,.775,.19,.43,6.1,photoTrim,'Side floor band','IMG_3335 · IMG_2849');
photoBox('structure',1,1.02,2.96,-2.29,2.10,.43,.19,photoTrim,'Rear-return floor band','IMG_2849');
photoBox('structure',1,2.03,2.96,-3.05,.19,.43,1.55,photoTrim,'Service recess floor band','IMG_2849');
const groundFinishedFloor=walls.find(w=>w.id==='g-front').bottom;
const carportFooting={wallThickness:.15,interiorProjection:.40,exteriorProjection:.34,north:walls.find(w=>w.id==='g-rear').a[1],south:walls.find(w=>w.id==='g-side').b[1]+.035,bottom:-.12,top:groundFinishedFloor};
// Canonical +X points into the carport; mirroring places this on the east wall.
carportFooting.interiorX=carportFooting.wallThickness/2+carportFooting.interiorProjection;
carportFooting.exteriorX=-carportFooting.wallThickness/2-carportFooting.exteriorProjection;
carportFooting.width=carportFooting.interiorX-carportFooting.exteriorX;
carportFooting.centerX=(carportFooting.interiorX+carportFooting.exteriorX)/2;
carportFooting.z=(carportFooting.north+carportFooting.south)/2;carportFooting.length=carportFooting.south-carportFooting.north;
const exposedFooting=box('structure',0,carportFooting.centerX,(carportFooting.top+carportFooting.bottom)/2,carportFooting.z,carportFooting.width,carportFooting.top-carportFooting.bottom,carportFooting.length,mats.concrete,'East-side footing · to north lot boundary','IMG_5148 · IMG_5149','Per your correction, footing follows the right/east side continuously from the carport to the north lot boundary. Its top is level with the ground finished floor (+0.25 m). There is no footing along CP-WI. Owner measurements: approximately 400 mm inward from the interior wall face and 340 mm outward from the exterior face, for 890 mm total width including the modeled 150 mm wall. Buried thickness remains approximate.');
exposedFooting.userData.carportFooting=true;
// Subtle east-to-west fall; 1.2% is an illustrative amount, not a surveyed grade.
const terrain={slope:.012,referenceEast:2.525,heightAt(x){return -.025+this.slope*(x-this.referenceEast);}};
// Concrete occupies the original rear service recess between the east footing
// and the kitchen's service wall. This does not add the excluded extension.
const serviceWall=walls.find(w=>w.id==='g-service'),bathRearWall=walls.find(w=>w.id==='g-bath-rear');
const serviceFloor={eastX:carportFooting.interiorX,westX:serviceWall.a[0]-.075,north:carportFooting.north,south:bathRearWall.a[1]-.075,thickness:.10};
serviceFloor.width=serviceFloor.westX-serviceFloor.eastX;serviceFloor.depth=serviceFloor.south-serviceFloor.north;
const serviceFloorX=(serviceFloor.eastX+serviceFloor.westX)/2,serviceFloorZ=(serviceFloor.north+serviceFloor.south)/2;
const serviceFloorGeometry=new THREE.BoxGeometry(serviceFloor.width,serviceFloor.thickness,serviceFloor.depth),serviceFloorVertices=serviceFloorGeometry.attributes.position;
for(let i=0;i<serviceFloorVertices.count;i++){const x=serviceFloorVertices.getX(i)+serviceFloorX,top=carportFooting.top-terrain.slope*(x-serviceFloor.eastX);serviceFloorVertices.setY(i,top-(serviceFloorVertices.getY(i)>0?0:serviceFloor.thickness));}
serviceFloorGeometry.computeVertexNormals();
const serviceFloorMesh=part(serviceFloorGeometry,mats.concrete,'structure',0,[serviceFloorX,0,serviceFloorZ],'Concrete floor · kitchen exterior service area','A-2 · IMG_2849','Concrete floor between the continuous east-side footing and the original kitchen service area, following your description. The pad ends at the north lot boundary and the bathroom exterior wall. It meets the footing at ground-floor level; thickness and the slight east-to-west fall remain approximate.');
serviceFloorMesh.userData.serviceFloor=true;serviceFloorMesh.userData.measurementKind='floor';

const gravelCanvas=document.createElement('canvas');gravelCanvas.width=gravelCanvas.height=256;const gravelCtx=gravelCanvas.getContext('2d');gravelCtx.fillStyle='#6d7271';gravelCtx.fillRect(0,0,256,256);let gravelSeed=5147;const gravelRandom=()=>{gravelSeed=(gravelSeed*1664525+1013904223)>>>0;return gravelSeed/4294967296;};for(let i=0;i<3600;i++){const x=gravelRandom()*256,y=gravelRandom()*256,r=1.3+gravelRandom()*2.8,c=Math.floor(75+gravelRandom()*105);gravelCtx.fillStyle=`rgb(${c},${c+4},${c+6})`;gravelCtx.beginPath();for(let j=0;j<5;j++){const a=j*Math.PI*2/5,rr=r*(.65+gravelRandom()*.4);gravelCtx.lineTo(x+Math.cos(a)*rr,y+Math.sin(a)*rr);}gravelCtx.closePath();gravelCtx.fill();}const gravelTexture=new THREE.CanvasTexture(gravelCanvas);gravelTexture.colorSpace=THREE.SRGBColorSpace;gravelTexture.wrapS=gravelTexture.wrapT=THREE.RepeatWrapping;gravelTexture.repeat.set(5,5);const gravelMat=material(0xffffff);gravelMat.map=gravelTexture;gravelMat.roughness=1;
const gravelWidth=2.55-carportFooting.interiorX,gravelCenterX=(carportFooting.interiorX+2.55)/2;
const gravelGeo=new THREE.PlaneGeometry(gravelWidth,2.7,1,1);gravelGeo.rotateX(-Math.PI/2);
const gravelPos=gravelGeo.attributes.position;for(let i=0;i<gravelPos.count;i++)gravelPos.setY(i,terrain.heightAt(2.525-(gravelPos.getX(i)+gravelCenterX)));gravelGeo.computeVertexNormals();
const gravelSurface=part(gravelGeo,gravelMat,'structure',0,[gravelCenterX,0,2.475],'Gravel carport surface','IMG_5147','Ground falls slightly east to west, as described. The 1.2% visual fall is illustrative; slope has not been measured.',false);
gravelSurface.userData.measurementKind='floor';
// A separate plan-selection overlay includes the 400 mm inner footing strip.
// Keep it out of the floor-surface union so the clear-floor measurement stays intact.
const carportAreaBounds={x0:walls.find(w=>w.id==='g-side').a[0]+carportFooting.wallThickness/2,x1:walls.find(w=>w.id==='g-divider').a[0]-.075,z0:walls.find(w=>w.id==='g-guest-front').a[1]+.075,z1:walls.find(w=>w.id==='g-side').b[1]};
const carportAreaGeometry=new THREE.PlaneGeometry(carportAreaBounds.x1-carportAreaBounds.x0,carportAreaBounds.z1-carportAreaBounds.z0);carportAreaGeometry.rotateX(-Math.PI/2);
const carportAreaMaterial=new THREE.MeshBasicMaterial({color:0x73eed1,transparent:true,opacity:.12,depthWrite:false,side:THREE.DoubleSide});
const carportAreaSelection=part(carportAreaGeometry,carportAreaMaterial,'structure',0,[(carportAreaBounds.x0+carportAreaBounds.x1)/2,carportFooting.top+.006,(carportAreaBounds.z0+carportAreaBounds.z1)/2],'CP · Carport including inner footing','A-2 · User measurements','Plan area includes the 400 mm inner footing strip and the clear carport floor, bounded by interior wall faces. Exterior footing and wall thickness are excluded. This selection projects across two surface heights; it does not add paving.',false);
Object.assign(carportAreaSelection.userData,{carportSelectionArea:true,measurementKind:'area'});
carportAreaSelection.visible=false;

// High front parapet and lower projecting eaves, kept with the roof covering.
photoBox('roof',2,3.80,frontParapet.wallY,3.84,2.65,frontParapet.wallHeight,.15,photoUpperWall,'High front parapet','IMG_3333',true);
photoBox('roof',2,3.80,frontParapet.capY,3.85,2.69,frontParapet.capHeight,.19,darkFascia,'Parapet cap','IMG_3333',true);
const balconyEdgeY=balconyRoof.heightAt(balconyRoof.endZ);
const balconyFrontFascia=photoBox('roof',2,(balconyRoof.eastX+balconyRoof.westX)/2,balconyEdgeY+.07,balconyRoof.endZ-.06,balconyRoof.westX-balconyRoof.eastX,.17,.12,darkFascia,'Low roof front fascia','IMG_3333 · IMG_3335',true);balconyFrontFascia.userData.detail=balconyRoofNote;
const northEaveWidth=masterRoofCutX-balconyRoof.eastX,northEaveX=(masterRoofCutX+balconyRoof.eastX)/2;
const northFascia=photoBox('roof',2,northEaveX,balconyRoof.rearY+.07,balconyRoof.rearZ+.06,northEaveWidth,.17,.12,darkFascia,'Master north eave fascia','IMG_2849',true);Object.assign(northFascia.userData,{northEave:true,detail:balconyRoofNote});
const sideFascia=beam('roof',2,[-.40,balconyRoof.rearY+.06,balconyRoof.rearZ],[-.40,balconyEdgeY+.07,balconyRoof.endZ],.12,.17,darkFascia,'Low roof side fascia','IMG_3335 · IMG_2849',balconyRoofNote);sideFascia.userData.photoOnly=true;sideFascia.userData.photoCover=true;photoOnly.push(sideFascia);
const sideSoffitCenterZ=(balconyRoof.rearZ+balconyRoof.endZ)/2;
const soffit=photoBox('roof',2,-.17,balconyRoof.heightAt(sideSoffitCenterZ)-.086,sideSoffitCenterZ,.45,.035,Math.hypot(balconyRoof.endZ-balconyRoof.rearZ,balconyRoof.pitch*(balconyRoof.endZ-balconyRoof.rearZ)),photoTrim,'Side roof soffit','IMG_3335 · IMG_2849',true);soffit.rotation.x=Math.atan(balconyRoof.pitch);soffit.userData.detail=balconyRoofNote;
const northSoffitDepth=soffit.geometry.parameters.width,northSoffitZ=balconyRoof.rearZ+.005+northSoffitDepth/2;
const northEaveSoffit=photoBox('roof',2,northEaveX,balconyRoof.heightAt(northSoffitZ)-.08,northSoffitZ,northEaveWidth,.025,Math.hypot(northSoffitDepth,balconyRoof.pitch*northSoffitDepth),photoTrim,'Master north eave soffit','IMG_2849',true);northEaveSoffit.rotation.x=Math.atan(balconyRoof.pitch);Object.assign(northEaveSoffit.userData,{northEave:true,detail:balconyRoofNote});
const balconySoffit=photoBox('roof',2,1.15,balconyEdgeY-.03,balconyRoof.endZ-.25,3.1,.035,.50,photoTrim,'Balcony roof soffit','IMG_3333 · IMG_3335',true);balconySoffit.userData.detail=balconyRoofNote;
// Both variants use the same pitch, so extending the edge also lowers its eave.
const innerBalconyEdgeY=innerBalconyRoof.heightAt(innerBalconyRoof.endZ);
const innerBalconyTrimsStart=objects.length;
photoBox('roof',2,(innerBalconyRoof.eastX+innerBalconyRoof.westX)/2,innerBalconyEdgeY+.07,innerBalconyRoof.endZ-.06,innerBalconyRoof.westX-innerBalconyRoof.eastX,.17,.12,darkFascia,'Low roof front fascia','Block layout',true);
const innerSideFascia=beam('roof',2,[-.40,innerBalconyRoof.rearY+.06,innerBalconyRoof.rearZ],[-.40,innerBalconyEdgeY+.07,innerBalconyRoof.endZ],.12,.17,darkFascia,'Low roof side fascia','Block layout',innerBalconyRoofNote);
Object.assign(innerSideFascia.userData,{photoOnly:true,photoCover:true});photoOnly.push(innerSideFascia);
const innerSideSoffitCenterZ=(innerBalconyRoof.rearZ+innerBalconyRoof.endZ)/2;
const innerSideSoffit=photoBox('roof',2,-.17,innerBalconyRoof.heightAt(innerSideSoffitCenterZ)-.086,innerSideSoffitCenterZ,.45,.035,Math.hypot(innerBalconyRoof.endZ-innerBalconyRoof.rearZ,innerBalconyRoof.pitch*(innerBalconyRoof.endZ-innerBalconyRoof.rearZ)),photoTrim,'Side roof soffit','Block layout',true);innerSideSoffit.rotation.x=Math.atan(innerBalconyRoof.pitch);
const innerBalconySoffit=photoBox('roof',2,1.15,innerBalconyEdgeY-.03,innerBalconyRoof.endZ-.25,3.1,.035,.50,photoTrim,'Balcony roof soffit','Block layout',true);
objects.slice(innerBalconyTrimsStart).forEach(m=>Object.assign(m.userData,{roofVariant:'inner',detail:innerBalconyRoofNote}));
[balconyFrontFascia,sideFascia,soffit,balconySoffit].forEach(m=>m.userData.roofVariant='end');
[northFascia,northEaveSoffit].forEach(m=>m.userData.roofVariant='end');
const innerNorthTrimsStart=objects.length;
photoBox('roof',2,(innerMainRoof.x0+masterRoofCutX)/2,westRoofHeightAt(balconyRoof.rearZ)+.07,balconyRoof.rearZ+.06,masterRoofCutX-innerMainRoof.x0,.17,.12,darkFascia,'Master north eave fascia','Block layout',true);
const innerNorthSoffit=photoBox('roof',2,(innerMainRoof.x0+masterRoofCutX)/2,westRoofHeightAt(northSoffitZ)-.08,northSoffitZ,masterRoofCutX-innerMainRoof.x0,.025,Math.hypot(northSoffitDepth,westRoofPitch*northSoffitDepth),photoTrim,'Master north eave soffit','Block layout',true);innerNorthSoffit.rotation.x=-Math.atan(westRoofPitch);
objects.slice(innerNorthTrimsStart).forEach(m=>Object.assign(m.userData,{roofVariant:'inner',northEave:true,detail:innerMainRoofNote}));


// Window surrounds: photo-observed on the outside, not extra openings.
const outsideFaces={'g-side':[-1,0],'g-bath-rear':[0,-1],'g-service':[-1,0],'g-front':[0,1],'g-guest-front':[0,1],'g-divider':[-1,0],'u-side':[-1,0],'u-master-rear':[0,-1],'u-bath-side':[-1,0],'u-balcony':[0,1],'u-front':[0,1],'u-divider':[-1,0]};
for(const o of reviewedOpenings.filter(o=>o.system==='windows')){
 const dir=outsideFaces[o.wall];if(!dir)continue;
 const x=o.x+dir[0]*.095,z=o.z+dir[1]*.095,y=o.base+o.sill;
 const source=o.floor?'IMG_3333 · IMG_3335 · IMG_2849':'IMG_3334 · IMG_2849';
 const trim=(along,up,w,h)=>{const m=photoBox('windows',o.floor,x+(o.axis==='x'?along:0),y+up,z+(o.axis==='z'?along:0),o.axis==='x'?w:.08,h,o.axis==='x'?.08:w,photoTrim,o.code+' exterior trim',source);m.userData.openingId=o.id;return m;};
 trim(0,-.055,o.w+.20,.11);trim(0,o.h+.055,o.w+.20,.11);
 if(o.floor)for(const side of [-1,1])trim(side*(o.w/2+.045),o.h/2,.09,o.h);
}
// Kitchen plumbing is concealed by a dropped soffit below the upper slab.
const kitchenSoffit={x0:walls.find(w=>w.id==='g-service').a[0]+.075,x1:walls.find(w=>w.id==='u-stair').a[0],z0:walls.find(w=>w.id==='g-rear').a[1]+.075,z1:walls.find(w=>w.id==='g-bath-rear').a[1]+.09,bottom:2.77,top:2.95,thickness:.012};
const kitchenSoffitMat=material(0xe8e7df),kitchenSoffitMeshes=[];
const kitchenSoffitDetail='Kitchen plumbing soffit extends from the reinforced concrete beam beside the B0 door to the rear firewall, and from the rear kitchen service-door wall to the stairwell edge. The approximate underside is +2.77 m, below the overhead plumbing; a hollow enclosure rises to the upper slab underside at +2.95 m. Kitchen lighting mounts below the soffit.';
function soffitPiece(x,y,z,w,h,d,name){const m=box('structure',0,x,y,z,w,h,d,kitchenSoffitMat,name,'User description',kitchenSoffitDetail);m.userData.kitchenSoffit=true;kitchenSoffitMeshes.push(m);return m;}
const soffitWidth=kitchenSoffit.x1-kitchenSoffit.x0,soffitDepth=kitchenSoffit.z1-kitchenSoffit.z0,soffitDrop=kitchenSoffit.top-kitchenSoffit.bottom;
const kitchenSoffitUnderside=soffitPiece((kitchenSoffit.x0+kitchenSoffit.x1)/2,kitchenSoffit.bottom+kitchenSoffit.thickness/2,(kitchenSoffit.z0+kitchenSoffit.z1)/2,soffitWidth,kitchenSoffit.thickness,soffitDepth,'Kitchen plumbing soffit · underside');
kitchenSoffitUnderside.userData.measurementSpecs=[{a:[-soffitWidth/2,-kitchenSoffit.thickness/2,-soffitDepth/2],b:[soffitWidth/2,-kitchenSoffit.thickness/2,-soffitDepth/2],offset:[0,-.08,-.20],label:'Width'},{a:[soffitWidth/2,-kitchenSoffit.thickness/2,-soffitDepth/2],b:[soffitWidth/2,-kitchenSoffit.thickness/2,soffitDepth/2],offset:[.20,-.08,0],label:'Depth'}];
soffitPiece((kitchenSoffit.x0+kitchenSoffit.x1)/2,(kitchenSoffit.bottom+kitchenSoffit.top)/2,kitchenSoffit.z1-kitchenSoffit.thickness/2,soffitWidth,soffitDrop,kitchenSoffit.thickness,'Kitchen plumbing soffit · beam edge');
soffitPiece(kitchenSoffit.x1-kitchenSoffit.thickness/2,(kitchenSoffit.bottom+kitchenSoffit.top)/2,(kitchenSoffit.z0+kitchenSoffit.z1)/2,kitchenSoffit.thickness,soffitDrop,soffitDepth,'Kitchen plumbing soffit · stairwell edge');

const conduitSpec={sizeInches:.5,diameter:.0127,radius:.00635,material:'PVC'};
const conduitInfo=flexible=>({conduit:true,conduitSizeInches:conduitSpec.sizeInches,conduitDiameter:conduitSpec.diameter,conduitMaterial:conduitSpec.material,conduitVariant:flexible?'flexible':'rigid'});
const conduitNote=flexible=>`½ in (12.7 mm nominal) ${flexible?'flexible':'rigid'} PVC conduit. `;
// Closely spaced radial ribs distinguish the flexible lighting conduit.
function flexibleConduit(points,mat,floor,name,source,detail){
 const path=roundedPipe(points,.15),segments=Math.min(4096,Math.max(24,Math.ceil(path.getLength()/.005))),geometry=new THREE.TubeGeometry(path,segments,conduitSpec.radius,8,false),positions=geometry.attributes.position;
 for(let i=0;i<=segments;i++){
  const center=path.getPointAt(i/segments),factor=i%2?.82:1;
  for(let j=0;j<=8;j++){const k=i*9+j,p=new THREE.Vector3().fromBufferAttribute(positions,k).sub(center).multiplyScalar(factor).add(center);positions.setXYZ(k,p.x,p.y,p.z);}
 }
 geometry.computeVertexNormals();return part(geometry,mat,'electrical',floor,[0,0,0],name,source,detail,false);
}

// Lighting locations combine E-1 and the user corrections. Connections in a 2D
// electrical plan are circuit diagrams; their 3D routing is deliberately schematic.
const eNote='Schematic 3D circuit route. Exact concealed routing remains approximate. Conduits use ½ in PVC; lighting uses the flexible variant.';
// User correction: short bedroom-wall return outside the ground bathroom.
// In right-end mode this is on the right of the bathroom doorway, facing kitchen.
const bathroomPartition=walls.find(w=>w.id==='g-bath-south');
const bathroomDoorWall=walls.find(w=>w.id==='g-bath-door');
const servicePanel={...embeddedMounts.panel,mounting:'embedded'};
const panelDetail='Embedded service panel in the chase wall over KT-SI, facing the kitchen. Cabinet sits within a wall recess with a flush cover. Center height (1.55 m above the ground finished floor), cabinet size and concealed connections remain approximate.';
const panel=box('electrical',0,servicePanel.x,servicePanel.y,servicePanel.z,servicePanel.w,servicePanel.h,servicePanel.d,powerMat,'Embedded service panel · KT-SI','User correction',panelDetail);
Object.assign(panel.userData,{wallId:servicePanel.wallId,wallCode:servicePanel.wallCode,servicePanel:true,mounting:'embedded'});
const panelCover=box('electrical',0,servicePanel.x,servicePanel.y,bathroomPartition.a[1]-.075-.006,servicePanel.w+.016,servicePanel.h+.016,.008,material(0x8e9da9,.2),'Embedded service-panel cover · KT-SI','User correction',panelDetail);
Object.assign(panelCover.userData,{servicePanel:true,servicePanelCover:true,wallId:servicePanel.wallId,wallCode:servicePanel.wallCode,mounting:'embedded'});

const planLights=[];
const planBulbMat=material(0xf8dfaa);
for(const [f,pts]of [[0,[[3.85,2.3],[3.85,.3],[3,-2.7],[1.05,-1.75],[1.2,0],[1.2,2.6]]],[1,[[1.2,.8],[3.8,1.9],[3.85,-.9],[3.1,-2.9]]]]){
 const ceiling=f?5.65:2.9;
 pts.forEach(([x,z],i)=>{
  if(f===1&&i===2)return;
  const floorName=f?'Second':'Ground';
  const m=part(new THREE.CylinderGeometry(.072,.072,.045,16),fixtureMat,'electrical',f,[x,!f&&i===2?kitchenSoffit.bottom-.0225:ceiling-.05,z],`Lighting outlet ${i+1} · ${floorName} floor`,'E-1','Ceiling socket with bulb. Approximate lighting point location; fitting profile matches the other bulb fixtures.',false);
  m.userData.planLight=true;if(!f&&i===2){m.userData.kitchenSoffitLight=true;m.userData.detail+=' Mounted beneath the kitchen plumbing soffit.';}planLights.push(m);
  const bulb=part(new THREE.SphereGeometry(.045,12,8),planBulbMat,'electrical',f,[x,m.position.y-.055,z],`Lighting bulb ${i+1} · ${floorName} floor`,'E-1','Bulb attached to the ceiling lighting socket.',false);
  Object.assign(bulb.userData,{planLightBulb:true,lightingOutletOwner:m.uuid});
 });
}
// User-described living-room equipment, referenced to the reviewed openings.
const livingFront=reviewedOpenings.find(o=>o.id==='living-front'),livingEast=reviewedOpenings.find(o=>o.id==='living-side');
const switchGap={start:mainEntry.x+mainEntry.w/2,end:livingFront.x-livingFront.w/2};
const switchCenter=(switchGap.start+switchGap.end)/2,switchY=.25+1.35,frontWallZ=mainEntry.z;
const userElectrical={switchGap,switchY,footOffset:.3048,switches:[],outlets:[]};
const plateMat=material(0xe5e3dc),rockerMat=material(0xb6bec4);
// Switch conduits drop in the wall-surface chase into the box top.
function switchBoxTop(plate,normal=plate.userData.normal??[0,-1]){
 const p=plate.position,inset=.095-wallChaseOffset;
 return [p.x-normal[0]*inset,p.y+plate.geometry.parameters.height/2,p.z-normal[1]*inset];
}
// Collect control paths; power distribution is rebuilt from the circuit schedule.
const controlPaths=[];
function correctedRoute(name,points,role,floor=0,extra={}){controlPaths.push({name,points,role,floor,...extra});}
for(const [index,x,roles]of [[0,switchCenter-.11,['Living room','Dining room']],[1,switchCenter+.11,['Canopy','Carport']]]){
 const name=roles.join(' / ')+' · 2-gang lighting switch';
 const plate=box('electrical',0,x,switchY,frontWallZ-.090,.14,.20,.030,plateMat,name,'E-1',`${index===0?'Left':'Right'} plate viewed from inside the living room in Right end mode. Two gangs control ${roles[0].toLowerCase()} and ${roles[1].toLowerCase()}. Located on LR-SI between the window and main door. Mounting height is approximate.`);
 Object.assign(plate.userData,{userSwitchPlate:true,plateSide:index===0?'left':'right',controls:roles,wallId:'g-front'});userElectrical.switches.push(plate);
 roles.forEach((role,j)=>{const rocker=box('electrical',0,x+(j===0?-.032:.032),switchY,frontWallZ-.112,.046,.135,.017,rockerMat,role+' switch gang','E-1','Gang assignment supplied by you; plate is on LR-SI.');Object.assign(rocker.userData,{switchGang:true,controls:role,plateSide:index===0?'left':'right'});});
}
// Socket belongs beneath the canopy, rather than high on the exterior wall.
const canopyLight={x:mainEntry.x,y:canopySoffits[0].position.y-.025,z:mainEntry.z+.35};
const holder=part(new THREE.CylinderGeometry(.068,.068,.05,16),fixtureMat,'electrical',0,[canopyLight.x,canopyLight.y,canopyLight.z],'Canopy lighting socket','E-1','Canopy socket mounted beneath the flat soffit, fed by concealed conduit from the right 2-gang plate on LR-SI. Position and fitting profile are approximate.',false);
Object.assign(holder.userData,{canopyLight:true,controlledBy:'right plate · canopy gang'});
const lamp=part(new THREE.SphereGeometry(.045,12,8),material(0xf8dfaa),'electrical',0,[canopyLight.x,canopyLight.y-.065,canopyLight.z],'Canopy lamp','E-1','Lamp attached to the canopy socket; controlled by the canopy gang.',false);lamp.userData.canopyLight=true;
const canopySwitchTop=switchBoxTop(userElectrical.switches.find(m=>m.userData.plateSide==='right'));
correctedRoute('Canopy concealed switched conduit',[canopySwitchTop,[canopySwitchTop[0],2.59,canopySwitchTop[2]],[canopyLight.x,2.59,canopySwitchTop[2]],[canopyLight.x,2.59,canopyLight.z],[canopyLight.x,canopyLight.y,canopyLight.z]],'canopy');
// LR-SI outlet aligns below the right lighting switch; LR-EI remains window-referenced.
const outletSpecs=[
 {code:'LR-SI',x:userElectrical.switches.find(m=>m.userData.plateSide==='right').position.x,y:.55,z:frontWallZ-.095,w:.12,d:.04,along:'x',detail:'Vertically aligned below the right lighting switch plate on LR-SI (canopy/carport gangs).'},
 {code:'LR-EI',x:livingEast.x+.095,y:.55,z:livingEast.z-livingEast.w/2-.3048,w:.04,d:.12,along:'z',detail:'305 mm (one foot) to the left of the window’s left edge when facing LR-EI from the living room; north of the window.'}
];
for(const o of outletSpecs){
 const familyStart=objects.length;
 const outlet=box('electrical',0,o.x,o.y,o.z,o.w,.16,o.d,plateMat,'Living convenience outlet · '+o.code,'E-1',o.detail+' Position follows your description. Height is shown at 0.30 m above finished floor (approximate).');Object.assign(outlet.userData,{userLivingOutlet:true,wallCode:o.code,footOffset:o.code==='LR-EI'?.3048:null});userElectrical.outlets.push(outlet);
 for(const side of [-1,1]){const px=o.x+(o.along==='x'?side*.025:.025),pz=o.z+(o.along==='z'?side*.025:-.025);box('electrical',0,px,o.y,pz,o.along==='x'?.010:.014,.038,o.along==='x'?.014:.010,railMat,'Socket slot · '+o.code,'E-1',o.detail);}
 objects.slice(familyStart).forEach(m=>m.userData.outletOwner=outlet.uuid);
 const wallPoint=o.code==='LR-SI'?[o.x,o.y,frontWallZ]:[livingEast.x,o.y,o.z];
 correctedRoute('Living outlet concealed feed · '+o.code,[[4.82,.55,o.z<3.5?o.z:3.5],[4.82,.20,o.z<3.5?o.z:3.5],[wallPoint[0],.20,wallPoint[2]],wallPoint,[o.x,o.y,o.z]],'outlet-'+o.code);
}


// Property-specific electrical points. Positions are canonical; normals select
// the user's right-end wall face. Exact heights and concealed routing are estimated.
const propertyElectrical={outlets:[],switches:[],lights:[]};
const openingById=id=>reviewedOpenings.find(o=>o.id===id);
function propertyOutlet({code,kind='Convenience',floor=0,x,y,z,normal,detail}){
 const familyStart=objects.length;
 const alongX=normal[1]!==0,wp=kind==='WP',w=wp?.15:.12,h=wp?.20:.16,depth=wp?.055:.035;
 const m=box('electrical',floor,x,y,z,alongX?w:depth,h,alongX?depth:w,plateMat,kind+' outlet · '+code,'E-1',detail+' Location supplied by you; mounting height and concealed route remain approximate.');
 Object.assign(m.userData,{propertyOutlet:true,wallCode:code,outletKind:kind,normal});propertyElectrical.outlets.push(m);
 for(const side of [-1,1])box('electrical',floor,x+(alongX?side*.024:normal[0]*(depth/2+.008)),y,z+(alongX?normal[1]*(depth/2+.008):side*.024),alongX?.010:.012,.032,alongX?.012:.010,railMat,kind+' socket slot · '+code,'E-1',detail);
 if(wp){const coverMat=material(0x78918e,.1);coverMat.transparent=true;coverMat.opacity=.6;box('electrical',floor,x+normal[0]*(depth/2+.015),y+.014,z+normal[1]*(depth/2+.015),alongX?w*.90:.018,h*.8,alongX?.018:w*.90,coverMat,'Weatherproof hinged cover · '+code,'E-1','WP outlet cover; enclosure profile is approximate.');}
 objects.slice(familyStart).forEach(piece=>piece.userData.outletOwner=m.uuid);
 const wallPoint=[x-normal[0]*.1,y,z-normal[1]*.1],base=floor?3.1:.25;
 correctedRoute(kind+' concealed feed · '+code,[[4.82,base-.06,z],[wallPoint[0],base-.06,wallPoint[2]],wallPoint,[x,y,z]],'property-'+kind+'-'+code,floor);
 return m;
}
const cpWindow=openingById('living-side'),bathWindow=openingById('ground-bath-window'),kWindow=openingById('kitchen-window'),guestDoor=openingById('guest-door'),mbWindow=openingById('master-rear'),grWindow=openingById('guest-front');
const bedroomWindows=[openingById('bedroom-front-ac'),openingById('bedroom-front')];
propertyOutlet({code:'CP-WI',kind:'WP',x:cpWindow.x-.105,y:.55,z:cpWindow.z,normal:[-1,0],detail:'Centered below the living-room window on the carport side.'});
propertyOutlet({code:'B0-NE',kind:'WP',x:bathWindow.x,y:.55,z:bathWindow.z-.105,normal:[0,-1],detail:'Centered below the small ground-bathroom window. B0 uses zero in the wall code.'});
propertyOutlet({code:'KT-NI',x:2.32,y:1.40,z:-3.730,normal:[0,1],detail:'Above the kitchen counter, near the east corner beside the kitchen window.'});
propertyOutlet({code:'DR-WI',kind:'Fridge',x:4.955,y:.60,z:guestDoor.z,normal:[-1,0],detail:'On the dining west wall opposite the guest-bedroom door.'});
propertyOutlet({code:'B0-NI',kind:'Shower heater',x:.24,y:2.10,z:-2.180,normal:[0,1],detail:'Near the B0-EI corner on the north bathroom wall.'});
propertyOutlet({code:'B1-NI',kind:'Shower heater',floor:1,x:2.29,y:5.10,z:-3.730,normal:[0,1],detail:'Near the B1-EI corner on the north upper-bathroom wall.'});
propertyOutlet({code:'R1-SI',kind:'AC',floor:1,x:(bedroomWindows[0].x+bedroomWindows[0].w/2+bedroomWindows[1].x-bedroomWindows[1].w/2)/2,y:4.95,z:3.730,normal:[0,-1],detail:'Between the two south-facing bedroom windows.'});
propertyOutlet({code:'MB-N1I',kind:'AC',floor:1,x:mbWindow.x-mbWindow.w/2-.17,y:5.10,z:mbWindow.z+.095,normal:[0,1],detail:'Just right of the north window when facing it from inside the master bedroom.'});
propertyOutlet({code:'GR-SI',kind:'AC',x:grWindow.x+grWindow.w/2+.17,y:2.25,z:grWindow.z-.095,normal:[0,-1],detail:'Just right of the guest-room window from inside. Wall confirmed as GR-SI.'});
const guestRoomElectrical={outlets:[],outletY:.55,switchY:1.60,doorEdgeOffset:.20};
const propertyWallFaces=surfaceCodes(buildWallSurfaces(walls),true);
for(const code of ['GR-N1I','GR-WI']){
 const face=propertyWallFaces.find(f=>f.code===code),wall=walls.find(w=>w.id===face.wallId),length=Math.hypot(wall.b[0]-wall.a[0],wall.b[1]-wall.a[1]),along=(face.start+face.end)/2;
 const normal=face.axis==='x'?[face.normal,0]:[0,face.normal];
 const x=wall.a[0]+(wall.b[0]-wall.a[0])*along/length+normal[0]*.095,z=wall.a[1]+(wall.b[1]-wall.a[1])*along/length+normal[1]*.095;
 const outlet=propertyOutlet({code,x,y:guestRoomElectrical.outletY,z,normal,detail:'Centered along the '+code+' wall surface, following your guest-room correction. Shown 300 mm above the ground floor; height is approximate.'});
 outlet.userData.guestRoomConvenience=true;guestRoomElectrical.outlets.push(outlet);
}
// Bedroom convenience outlets follow the user's wall-code locations. Facing
// MB-EI from inside, right is south (+z); facing R1-NI, left is west (+x
// in canonical coordinates). The two opposite-room outlets share a z datum.
const mbEastWindow=openingById('master-side'),r1Door=openingById('bedroom-door'),bedroomDivider=walls.find(w=>w.id==='u-divider');
const bedroomConvenience={windowRightOffset:.50,outletY:3.1+.30,r1SwitchY:3.1+1.35,r1OutletY:3.1+.30,mbWindowZ:mbEastWindow.z,mbEastZ:mbEastWindow.z+mbEastWindow.w/2+.50,r1DoorLeftX:r1Door.x+r1Door.w/2+.20,outlets:[]};
for(const spec of [
 {code:'MB-W2I',x:bedroomDivider.a[0]-.095,z:mbEastWindow.z,normal:[-1,0],detail:'Centered opposite the MB-EI window on the master-bedroom west partition.'},
 {code:'MB-EI',x:mbEastWindow.x+.095,z:bedroomConvenience.mbEastZ,normal:[1,0],detail:'Outlet center 500 mm south of the window’s right edge when facing MB-EI from inside the master bedroom.'},
 {code:'R1-E1I',x:bedroomDivider.a[0]+.095,z:bedroomConvenience.mbEastZ,normal:[1,0],detail:'Aligned across the rooms with the MB-EI outlet, at the same north–south position on Bedroom 1’s east partition.'},
 {code:'R1-NI',x:bedroomConvenience.r1DoorLeftX,y:bedroomConvenience.r1OutletY,z:r1Door.z+.095,normal:[0,1],detail:'Left of the bedroom door when facing R1-NI from inside, vertically aligned with the room-light switch and 300 mm above the finished floor to match the other convenience outlets. The 200 mm door-edge offset remains approximate.'}
]){
 const m=propertyOutlet({...spec,floor:1,y:spec.y??bedroomConvenience.outletY});Object.assign(m.userData,{bedroomConvenience:true,windowRightOffset:spec.code==='MB-EI'?.50:null,alignedWith:spec.code==='R1-E1I'?'MB-EI':spec.code==='MB-W2I'?'MB-EI window center':spec.code==='R1-NI'?'R1 room-light switch':null});bedroomConvenience.outlets.push(m);
}
function propertySwitch(code,floor,x,y,z,normal,roles,detail,vertical=false){
 const alongX=normal[1]!==0,w=roles.length===1?.09:vertical?.09:.14,h=roles.length===1?.14:.20;
 const plate=box('electrical',floor,x,y,z,alongX?w:.03,h,alongX?.03:w,plateMat,roles.join(' / ')+` · ${roles.length}-gang switch`,'E-1',detail+' Gang assignments supplied by you; mounting height is approximate.');
 Object.assign(plate.userData,{propertySwitch:true,wallCode:code,controls:roles,normal});propertyElectrical.switches.push(plate);
 roles.forEach((role,i)=>{const offset=roles.length===1?0:(i?1:-1)*.032;const rocker=box('electrical',floor,x+(alongX&&!vertical?offset:normal[0]*.025),y+(vertical?offset*1.3:0),z+(!alongX&&!vertical?offset:normal[1]*.025),alongX?.046:.017,roles.length===1?.10:vertical?.055:.135,alongX?.017:.046,rockerMat,role+' switch gang','E-1',detail);Object.assign(rocker.userData,{propertyGang:true,controls:role,wallCode:code});});
 return {plate,wallPoint:[x-normal[0]*.095,y,z-normal[1]*.095]};
}
const guestSwitchZ=guestDoor.z+guestDoor.w/2+guestRoomElectrical.doorEdgeOffset;
const guestRoomSwitch=propertySwitch('GR-WI',0,guestDoor.x-.095,guestRoomElectrical.switchY,guestSwitchZ,[-1,0],['Guest bedroom'],'Left of the door when facing GR-WI from inside the guest room (south of the door). Shown 200 mm from the door edge and 1.35 m above the floor; these offsets are approximate.');
guestRoomElectrical.switch=guestRoomSwitch.plate;
const guestRoomLight=planLights.find(m=>m.userData.floor===0&&m.position.x===1.2&&m.position.z===0);
Object.assign(guestRoomLight.userData,{controlledBy:'GR-WI guest-room switch',roomCode:'GR'});guestRoomElectrical.light=guestRoomLight;
const masterSwitchStart=objects.length;
const masterSwitch=propertySwitch('MB-W1I',1,2.455,4.45,-1.17,[-1,0],['Master bedroom','Master east eave light'],'Left of the master-bedroom door when facing the door from inside the bedroom.');
objects.slice(masterSwitchStart).forEach(m=>Object.assign(m.userData,{roofVariant:'end',masterRoomSwitch:true}));
const innerMasterSwitchStart=objects.length;
const innerMasterSwitch=propertySwitch('MB-W1I',1,2.455,4.45,-1.17,[-1,0],['Master bedroom'],'Single-gang master-bedroom switch for inner units. Left of the door; controls the room light.');
objects.slice(innerMasterSwitchStart).forEach(m=>Object.assign(m.userData,{roofVariant:'inner',masterRoomSwitch:true}));
const r1RoomSwitch=propertySwitch('R1-NI',1,bedroomConvenience.r1DoorLeftX,bedroomConvenience.r1SwitchY,r1Door.z+.095,[0,1],['Bedroom 1'],'Left of the door when facing R1-NI from inside, directly above the convenience outlet. Door-edge offset and mounting height remain approximate.');
bedroomConvenience.roomSwitch=r1RoomSwitch.plate;
// The stairwell ceiling point is controlled from both ends of the stairs.
const stairNorthWall=walls.find(w=>w.id==='g-rear'),landingSouthWall=walls.find(w=>w.id==='u-bedroom-entry');
const stairwellLighting={id:'stairwell-light',switchType:'two-way',mountHeight:1.35,ceilingY:5.65,lightX:stair.turn.x,lightZ:(runStart+runEnd)/2,switches:[]};
const stairLightDetail='Stairwell ceiling light controlled by two two-way switches: KT-NI before the first step and LD-SI just beyond the upper landing, as described. Either switch controls the same light. The light center, 1.35 m switch height, plate size and concealed circuit routes are approximate.';
const lowerStairSwitch=propertySwitch('KT-NI',0,stair.bottomStartX-.20,.25+stairwellLighting.mountHeight,stairNorthWall.a[1]+.095,[0,1],['Stairwell light'],stairLightDetail+' Lower switch is in the counter-to-stair gap, 200 mm before the first step.');
const upperStairSwitch=propertySwitch('LD-SI',1,r1Door.x+r1Door.w/2+.20,3.10+stairwellLighting.mountHeight,landingSouthWall.a[1]-.095,[0,-1],['Stairwell light'],stairLightDetail+' Upper switch is on the landing-facing side of the south wall, beside the Bedroom 1 door.');
for(const [switchObject,other] of [[lowerStairSwitch,'LD-SI'],[upperStairSwitch,'KT-NI']]){Object.assign(switchObject.plate.userData,{name:'Stairwell light · Two-way switch · '+switchObject.plate.userData.wallCode,stairwellSwitch:true,switchType:'two-way',circuitId:stairwellLighting.id,pairedWith:other});stairwellLighting.switches.push(switchObject.plate);}
const stairLight=part(new THREE.CylinderGeometry(.085,.085,.045,16),fixtureMat,'electrical',1,[stairwellLighting.lightX,stairwellLighting.ceilingY-.045/2,stairwellLighting.lightZ],'Stairwell ceiling lighting outlet','User location · E-1',stairLightDetail,false);
Object.assign(stairLight.userData,{stairwellLight:true,circuitId:stairwellLighting.id,controlledBy:['KT-NI','LD-SI'],mounting:'ceiling'});stairwellLighting.light=stairLight;propertyElectrical.lights.push(stairLight);
const stairBulb=part(new THREE.SphereGeometry(.045,12,8),material(0xf8dfaa),'electrical',1,[stairwellLighting.lightX,stairwellLighting.ceilingY-.065,stairwellLighting.lightZ],'Stairwell ceiling lamp','User location · E-1',stairLightDetail,false);Object.assign(stairBulb.userData,{stairwellLight:true,circuitId:stairwellLighting.id,controlledBy:['KT-NI','LD-SI']});
// Upper bathroom switch sits inside the bathroom beside the door, on the latch side.
const upperBathDoor=openingById('upper-bath-door'),upperBathWallZ=walls.find(w=>w.id==='u-bath-south').a[1];
const upperBathSwitch=propertySwitch('B1-S2I',1,upperBathDoor.x-upperBathDoor.w/2-.20,3.10+stairwellLighting.mountHeight,upperBathWallZ-.095,[0,-1],['Upper bathroom'],'Inside the upper bathroom beside the door on B1-S2I, on the latch side. Shown 200 mm from the door edge and 1.35 m above the floor; these offsets are approximate.');
const upperBathLight=planLights.find(m=>m.userData.floor===1&&m.position.x===3.1&&m.position.z===-2.9);
Object.assign(upperBathLight.userData,{controlledBy:'B1-S2I upper-bathroom switch',roomCode:'B1'});
const serviceDoor=openingById('service-door');
const kitchenSwitchZ=(kWindow.z+kWindow.w/2+serviceDoor.z-serviceDoor.w/2)/2;
const kitchenSwitch=propertySwitch('KT-E1I',0,2.145,1.60,kitchenSwitchZ,[1,0],['Kitchen','Master north eave light'],'Between the service door and kitchen window on KT-E1I. Two vertically arranged gangs fit the narrow opening gap.',true);
function eaveLight(code,x,y,z,controller,detail){
 const m=part(new THREE.CylinderGeometry(.072,.072,.045,16),fixtureMat,'electrical',1,[x,y,z],'Exterior eave lighting socket · '+code,'E-1',detail+' Under the upper roof eaves, as confirmed. Exact mounting height is approximate.',false);Object.assign(m.userData,{propertyEaveLight:true,wallCode:code,controlledBy:controller});propertyElectrical.lights.push(m);
 const bulb=part(new THREE.SphereGeometry(.045,12,8),material(0xf8dfaa),'electrical',1,[x,y-.055,z],'Exterior eave bulb · '+code,'E-1',detail,false);bulb.userData.propertyEaveLight=true;
 return [x,y,z];
}
const masterSide=openingById('master-side');
const eastEaveLightStart=objects.length;
const eastEaveLight=eaveLight('MB-EE',-.20,6.075,masterSide.z,'MB-W1I exterior gang','Centered on the master east-wall window of an end unit.');
objects.slice(eastEaveLightStart).forEach(m=>Object.assign(m.userData,{roofVariant:'end',masterSideEave:true}));
const northLightStart=objects.length;
const northEaveLight=eaveLight('MB-NE',mbWindow.x+mbWindow.w/2+.09,northEaveSoffit.position.y-.035,balconyRoof.rearZ+.14,'KT-E1I exterior gang','Aligned just right of the master north-wall window when viewed from outside, beneath the extended north eave.');
objects.slice(northLightStart).forEach(m=>m.userData.roofVariant='end');
const innerNorthLightStart=objects.length;
const innerNorthEaveLight=eaveLight('MB-NE',mbWindow.x+mbWindow.w/2+.09,innerNorthSoffit.position.y-.035,balconyRoof.rearZ+.14,'KT-E1I exterior gang','Under the inner-unit joined roof north eave, beside the master rear window.');
objects.slice(innerNorthLightStart).forEach(m=>m.userData.roofVariant='inner');
const balconyDoor=openingById('balcony-door'),balconyMasterWindow=openingById('master-balcony');
const balconyGap={start:balconyMasterWindow.x+balconyMasterWindow.w/2,end:balconyDoor.x-balconyDoor.w/2};
const balconyGapX=(balconyGap.start+balconyGap.end)/2;
const balconySwitch=propertySwitch('MB-SI',1,balconyGapX,4.45,balconyDoor.z-.095,[0,-1],['Balcony eave light'],'On MB-SI between the master-bedroom window and balcony door.');
for(const [variant,roof,roofSoffit,edgeY] of [['end',balconyRoof,balconySoffit,balconyEdgeY],['inner',innerBalconyRoof,innerBalconySoffit,innerBalconyEdgeY]]){
 const start=objects.length;
 const light=eaveLight('BL-NI',balconyGapX,roofSoffit.position.y-.035,roof.endZ-.14,'MB-SI balcony switch','On the balcony roof eave, centered in the gap between the master-bedroom door and window.');
 objects.slice(start).forEach(m=>Object.assign(m.userData,{balconyLight:true,roofVariant:variant}));
 const top=switchBoxTop(balconySwitch.plate);
 correctedRoute('Balcony eave concealed switched conduit',[top,[top[0],edgeY+.02,top[2]],[balconyGapX,edgeY+.02,light[2]],light],'balcony-eave',1,{roofVariant:variant});
}

// Ceiling closure under the short rear roof projection.
const masterSwitchTop=switchBoxTop(masterSwitch.plate);
correctedRoute('Master east eave switched concealed conduit',[masterSwitchTop,[masterSwitchTop[0],6.12,masterSwitchTop[2]],[0,6.12,masterSide.z],[eastEaveLight[0],6.12,masterSide.z],eastEaveLight],'master-east-eave',1,{roofVariant:'end'});
// Rise within the master rear wall; keep the eave leg clear of the bathroom firewall.
// The switched leg reaches this wall top through the shared ceiling conduits.
const northEaveTails=[
 ['end',northEaveLight,z=>balconyRoof.heightAt(z)+.14-.035/2*Math.sqrt(1+balconyRoof.pitch**2)],
 ['inner',innerNorthEaveLight,innerRoofUndersideAt]
].map(([variant,light,undersideAt])=>{const wallZ=masterNorthWall.a[1]+wallChaseOffset,x=light[0];return {variant,point:[x,wallZ],tail:[[x,undersideAt(wallZ)-.06,wallZ],[x,undersideAt(light[2])-.06,light[2]],light]};});

// Owner-specified breaker schedule. Colors identify circuits, not wire colors.
const electricalCircuits=[
 {id:'lighting',name:'All lighting & switches',amps:16,color:'#f4bd61',routing:'ceiling'},
 {id:'ac-r1',name:'Bedroom 1 AC · R1-SI',amps:32,color:'#f28e89',routing:'floor-chase',dedicated:true},
 {id:'ac-mb',name:'Master AC · MB-N1I',amps:32,color:'#ed92cf',routing:'floor-chase',dedicated:true},
 {id:'fridge',name:'Fridge · DR-WI',amps:25,color:'#b4a0fa',routing:'floor-chase',dedicated:true},
 {id:'counter',name:'Countertop · KT-NI',amps:32,color:'#63d6d3',routing:'floor-chase',dedicated:true},
 {id:'ground-outlets',name:'Ground-floor outlets + B0 shower',amps:25,color:'#91d39a',routing:'floor-chase'},
 {id:'upper-outlets',name:'Second-floor outlets + B1 shower',amps:25,color:'#78b5fc',routing:'floor-chase'},
 {id:'ac-gr',name:'Guest-room AC · GR-SI',amps:32,color:'#d5bc72',routing:'floor-chase',dedicated:true}
];
const circuitById=Object.fromEntries(electricalCircuits.map(c=>[c.id,c]));
const circuitMaterials=Object.fromEntries(electricalCircuits.map(c=>[c.id,material(c.color,.15)]));
state.circuits=Object.fromEntries(electricalCircuits.map(c=>[c.id,true]));
const circuitRoutes=[];
function assignCircuit(m,id){
 const c=circuitById[id];
 if(m.userData.circuitId==='stairwell-light')m.userData.controlledLoadId='stairwell-light';
 Object.assign(m.userData,{circuitId:id,breakerAmps:c.amps,circuitName:c.name});
 m.userData.detail+=` Circuit: ${c.name} · ${c.amps} A, supplied by the 60 A main service. `;
}
// Retain the white, user-located equipment. The interpreted yellow convenience
// outlets and switches are no longer generated above.
for(const m of objects.filter(m=>m.userData.system==='electrical'&&!m.userData.servicePanel))assignCircuit(m,'lighting');
const powerOutlets=[...userElectrical.outlets,...propertyElectrical.outlets];
function outletCircuit(m){
 const d=m.userData;
 if(d.outletKind==='AC')return {'GR-SI':'ac-gr','R1-SI':'ac-r1','MB-N1I':'ac-mb'}[d.wallCode];
 if(d.outletKind==='Shower heater')return d.floor?'upper-outlets':'ground-outlets';
 if(d.outletKind==='Fridge')return 'fridge';
 if(d.wallCode==='KT-NI'&&d.propertyOutlet)return 'counter';
 return d.floor?'upper-outlets':'ground-outlets';
}
for(const m of powerOutlets){
 const id=outletCircuit(m);
 for(const piece of objects.filter(p=>p.userData.outletOwner===m.uuid)){
  // Replace the default lighting assignment on this entire socket family.
  piece.userData.detail=piece.userData.detail.replace(/ Circuit: .*$/, '');assignCircuit(piece,id);
 }
}
Object.assign(panel.userData,{mainBreakerAmps:60,name:'60 A main service panel · embedded KT-SI',detail:panelDetail+` Main service: 60 A. ${electricalCircuits.length} branch circuits follow your supplied breaker assignments.`});
function circuitRoute(id,floor,name,points,extra={}){
 const clean=points.filter((p,i)=>!i||p.some((v,j)=>Math.abs(v-points[i-1][j])>.00001));
 if(clean.length<2)return;
 const c=circuitById[id],start=objects.length;
 const detail=conduitNote(id==='lighting')+`${c.name} · ${c.amps} A branch from the 60 A main service. ${c.routing==='floor-chase'?'Outlet conduits use direct diagonal connections in shallow chipped floor channels covered by the finish. Outlets on the same circuit and physical wall share a channel beside that wall, with short concealed wall rises. Channel depth and concealed wall crossings are schematic.':c.routing==='underfloor'?'Horizontal outlet runs are under the floor, rising within walls to the outlet.':'Lighting and switch distribution is one straight-run conduit tree per ceiling, with junction boxes at tees and concealed wall drops to switches. Switch legs and stair travelers share these conduits.'} Locations and bends are schematic; colors identify circuit groups.`;
 if(id==='lighting')flexibleConduit(clean,circuitMaterials[id],floor,name,'User circuit schedule · E-1',detail);
 else if(extra.finishCovered)part(new THREE.TubeGeometry(roundedPipe(clean,.10),Math.max(12,(clean.length-1)*16),conduitSpec.radius,8,false),circuitMaterials[id],'electrical',floor,[0,0,0],name,'User circuit schedule · E-1',detail,false);
 else route('electrical',floor,clean,conduitSpec.radius,circuitMaterials[id],name,'User circuit schedule · E-1',detail);
 objects.slice(start).forEach(m=>Object.assign(m.userData,{...conduitInfo(id==='lighting'),circuitId:id,circuitName:c.name,breakerAmps:c.amps,concealed:true,routingMode:c.routing,routePoints:clean,...extra}));
 circuitRoutes.push({id,floor,name,points:clean,...conduitInfo(id==='lighting'),...extra});
}
// Panel feeds leave the cabinet in the KT-SI kitchen-face chase. Circuits for
// the second floor rise at the divider end of that chase, which continues above
// the slab on the master face of the divider.
const serviceRiser={x:2.55-wallChaseOffset,z:bathroomPartition.a[1]-wallChaseOffset};
const panelPort=id=>[servicePanel.x+(electricalCircuits.findIndex(c=>c.id===id)-3)*.03,servicePanel.y-.16,serviceRiser.z];
const powerLevels=[-.04,2.86]; // Retained dedicated appliance routes.
const floorChase={finishedLevels:[.25,3.10],centerDepth:.025,radius:conduitSpec.radius,wallOffset:.104};
// Floor channels stay within each storey's slab; doorways are open at floor level.
const floorRegions=[
 [{x0:2.55,x1:5.05,z0:-1.115,z1:3.825},{x0:2.05,x1:5.05,z0:-3.825,z1:-1.115},{x0:0,x1:2.55,z0:-1.115,z1:1.125},{x0:0,x1:2.05,z0:-2.275,z1:-1.115}],
 [{x0:0,x1:2.55,z0:-2.275,z1:3.825},{x0:2.55,x1:5.05,z0:-.725,z1:3.825},{x0:2.05,x1:4.05,z0:-3.825,z1:-.725}]
];
// Outlets fed through a neighbouring outlet box rather than a channel tap.
const outletPassthroughs={'LR-SI':'LR-EI'};
const floorWalls=[0,1].map(f=>wallsWithoutDoors(walls.filter(w=>w.floor===f),reviewedOpenings));
const floorDoorways=[0,1].map(f=>reviewedOpenings.filter(o=>o.floor===f&&o.code.startsWith('D')).map(o=>{const w=walls.find(w=>w.id===o.wall),length=Math.hypot(w.b[0]-w.a[0],w.b[1]-w.a[1]);return {point:[o.x,o.z],along:[(w.b[0]-w.a[0])/length,(w.b[1]-w.a[1])/length]};}));
for(const c of electricalCircuits.filter(c=>c.routing!=='ceiling')){
 const outlets=powerOutlets.filter(m=>m.userData.circuitId===c.id),floor=outlets[0].userData.floor,inChase=c.routing==='floor-chase';
 const level=inChase?floorChase.finishedLevels[floor]-floorChase.centerDepth:powerLevels[floor]+(electricalCircuits.indexOf(c)-3)*.008,port=panelPort(c.id);
 const routeData=inChase?{floorChaseY:level,finishCovered:true}:{underfloorY:level};
 const datum=[serviceRiser.x,3.10,serviceRiser.z];
 if(floor)circuitRoute(c.id,0,c.name+' · dedicated panel riser',[port,[port[0],2.90,port[2]],[datum[0],2.90,port[2]],datum],{via:'KT-SI ceiling',panelFeed:true,homeRun:c.dedicated});
 const start=floor?datum:port;
 const floorStart=[start[0],level,start[2]];
 circuitRoute(c.id,floor,c.name+' · panel floor feed',[start,floorStart],{panelFeed:true,homeRun:!!c.dedicated,...(floor?{via:'KT-SI passthrough'}:{}),...routeData});
 const routeOutlets=outlets.map(m=>{
  const face=propertyWallFaces.find(f=>f.code===m.userData.wallCode),wall=walls.find(w=>w.id===face.wallId);
  return {id:m.uuid,wallCode:m.userData.wallCode,wall,normal:face.axis==='x'?[face.normal,0]:[0,face.normal],exterior:face.type==='E',point:[m.position.x,m.position.z]};
 });
 const fedThrough=routeOutlets.filter(o=>routeOutlets.some(p=>p.wallCode===outletPassthroughs[o.wallCode]));
 const plan=planFloorConduits([floorStart[0],floorStart[2]],routeOutlets.filter(o=>!fedThrough.includes(o)),floorChase.wallOffset,{walls:floorWalls[floor],regions:floorRegions[floor],doorways:floorDoorways[floor]});
 const onFloor=p=>[p[0],level,p[1]];
 for(const link of plan.links)circuitRoute(c.id,floor,c.name+' · direct floor connection',link.points.map(onFloor),{wallId:link.wallId,directFloorLink:true,homeRun:!!c.dedicated,...routeData});
 for(const group of plan.groups){
  const wallCodes=[...new Set(group.taps.map(t=>t.wallCode))];
  circuitRoute(c.id,floor,'Shared wall-side floor channel · '+wallCodes.join(' / '),group.points.map(onFloor),{sharedTrunk:true,wallId:group.wallId,wallCodes,outletIds:group.taps.map(t=>t.id),wallOffset:floorChase.wallOffset,...routeData});
  for(const tap of group.taps){
   // One floor-to-wall bend: rise in the wall-surface chase into the box bottom.
   const m=outlets.find(m=>m.uuid===tap.id),face=[m.position.x-tap.wallPoint[0],m.position.z-tap.wallPoint[1]],faceLength=Math.hypot(...face)||1;
   const rise=[tap.wallPoint[0]+face[0]/faceLength*wallChaseOffset,tap.wallPoint[1]+face[1]/faceLength*wallChaseOffset],boxBottom=m.position.y-(m.geometry.parameters.height??.16)/2;
   circuitRoute(c.id,floor,'Floor-channel outlet rise · '+tap.wallCode,[onFloor(tap.point),onFloor(rise),[rise[0],boxBottom,rise[1]]],{outletId:m.uuid,wallCode:tap.wallCode,wallId:group.wallId,homeRun:!!c.dedicated,...routeData});
  }
 }
 // A passthrough is its own conduit: down from the feeding box, across the floor
 // and up into the fed box, entering 30 mm beside that box's incoming rise.
 const outletChase=(o,shift=0)=>{
  const w=o.wall,length=Math.hypot(w.b[0]-w.a[0],w.b[1]-w.a[1]),u=[(w.b[0]-w.a[0])/length,(w.b[1]-w.a[1])/length],along=(o.point[0]-w.a[0])*u[0]+(o.point[1]-w.a[1])*u[1]+shift;
  return [w.a[0]+u[0]*along+o.normal[0]*wallChaseOffset,w.a[1]+u[1]*along+o.normal[1]*wallChaseOffset];
 };
 const outletBottom=o=>{const m=outlets.find(m=>m.uuid===o.id);return m.position.y-(m.geometry.parameters.height??.16)/2;};
 for(const child of fedThrough){
  const parent=routeOutlets.find(o=>o.wallCode===outletPassthroughs[child.wallCode]);
  const w=parent.wall,toward=Math.sign((child.point[0]-parent.point[0])*(w.b[0]-w.a[0])+(child.point[1]-parent.point[1])*(w.b[1]-w.a[1]))||1;
  const from=outletChase(parent,.03*toward),to=outletChase(child);
  circuitRoute(c.id,floor,'Outlet passthrough · '+parent.wallCode+' → '+child.wallCode,[[from[0],outletBottom(parent),from[1]],onFloor(from),onFloor(to),[to[0],outletBottom(child),to[1]]],{outletId:child.id,passthroughFrom:parent.wallCode,wallCode:child.wallCode,homeRun:!!c.dedicated,...routeData});
 }
}
// A common lighting feed rises from KT-SI to both ceilings. Each ceiling is one
// conduit tree of straight runs with junction boxes at tees; switch legs and the
// stair two-way travelers share these conduits rather than parallel runs.
const lightPort=panelPort('lighting'),lightRiserZ=serviceRiser.z,lightRiserX=serviceRiser.x;
circuitRoute('lighting',0,'16 A lighting · panel to ground ceiling',[lightPort,[lightPort[0],2.90,lightRiserZ],[lightRiserX,2.90,lightRiserZ],[lightRiserX,3.10,lightRiserZ]],{via:'KT-SI ceiling',panelFeed:true});
circuitRoute('lighting',1,'16 A lighting · upper ceiling riser',[[lightRiserX,3.10,lightRiserZ],[lightRiserX,5.65,lightRiserZ]],{panelFeed:true});
// Runs stay under the slab above each ceiling: the ground ceiling has no slab
// over the stair void or the open service area; the upper ceiling stops at the balcony.
const ceilingRegions=[
 floorRegions[1],
 [{x0:0,x1:5.05,z0:-2.275,z1:2.325},{x0:2.55,x1:5.05,z0:2.325,z1:3.825},{x0:2.05,x1:5.05,z0:-3.825,z1:-2.275}]
];
const ceilingSeeds=[[[[lightPort[0],lightRiserZ],[lightRiserX,lightRiserZ]]],[[[lightRiserX,lightRiserZ]]]];
const ceilingPlans=[];
for(const floor of [0,1]){
 const ceiling=floor?5.65:2.90,terminals=[];
 for(const m of [...planLights,stairLight].filter(m=>m.userData.floor===floor)){
  const p=m.position.toArray();
  terminals.push({id:m.uuid,label:m.userData.name,point:[p[0],p[2]],tails:[{points:[p],extra:{lightId:m.uuid}}]});
 }
 // End and inner master switches share one box location.
 const boxes=new Map();
 for(const m of [...userElectrical.switches,...propertyElectrical.switches].filter(m=>m.userData.floor===floor)){
  const wall=switchBoxTop(m),key=wall.map(v=>v.toFixed(3)).join(',');
  if(!boxes.has(key))boxes.set(key,{id:m.uuid,label:'switch drop · '+(m.userData.wallCode??'LR-SI'),point:[wall[0],wall[2]],tails:[{points:[wall],extra:{switchId:m.uuid,switchWallCode:m.userData.wallCode??'LR-SI'}}],controls:[]});
  boxes.get(key).controls.push(...m.userData.controls);
 }
 for(const b of boxes.values()){b.controls=[...new Set(b.controls)];b.tails[0].extra.controls=b.controls;terminals.push(b);}
 if(floor)terminals.push({id:'north-eave',label:'master north eave light',point:northEaveTails[0].point,tails:northEaveTails.map(t=>({points:t.tail,extra:{controls:'master-north-eave',roofVariant:t.variant}}))});
 const plan=planCeilingConduits({seeds:ceilingSeeds[floor],terminals,walls:walls.filter(w=>w.floor===floor),regions:ceilingRegions[floor]});
 ceilingPlans.push({floor,...plan});
 for(const link of plan.links){
  const t=terminals.find(t=>t.id===link.id);
  for(const tail of t.tails)circuitRoute('lighting',floor,'Lighting ceiling run · '+t.label,[[link.from[0],ceiling,link.from[1]],[link.to[0],ceiling,link.to[1]],...tail.points],{ceilingRun:true,wallCrossings:link.crossings,...tail.extra});
 }
}
// Switched legs outside the ceiling trees: canopy, balcony and east eave.
for(const path of controlPaths.filter(p=>!p.role.startsWith('outlet-')&&!p.role.startsWith('property-')))circuitRoute('lighting',path.floor,path.name,path.points,{correctedCircuit:path.role,controls:path.role,...(path.roofVariant?{roofVariant:path.roofVariant}:{})});
function showAllCircuits(){for(const c of electricalCircuits)state.circuits[c.id]=true;clearSelection();sync();}
function isolateCircuit(id){for(const c of electricalCircuits)state.circuits[c.id]=c.id===id;isolate('electrical');}

// Service interconnect, kept separate from the branch circuits.
const livingSouthOutlet=userElectrical.outlets.find(m=>m.userData.wallCode==='LR-SI');
const serviceInterconnect={pullBox:{...embeddedMounts.pullBox,width:embeddedMounts.pullBox.w,height:embeddedMounts.pullBox.h,depth:embeddedMounts.pullBox.d,mounting:'embedded'},entrance:{x:5.05-.25,z:-3.825+12-.25,y:.65},undergroundY:-.45};
const pullBoxSpec=serviceInterconnect.pullBox,serviceEntrance=serviceInterconnect.entrance,servicePvcMat=material(0x8e9da9);
const serviceConnectionNote=conduitNote(false)+'Horizontal 2 × 4 in LR-SE utility box: 101.6 mm wide × 50.8 mm high, recessed into the wall below the front window with a blank cover. Its original horizontal position and height are retained; modeled depth is 50.8 mm. It has its own home run to the embedded KT-SI service panel. Underground PVC connects the box to the southwest service entrance. Box sizes, entrance inset/height, conduit size and buried depth are schematic; the entrance marker does not specify metering equipment.';
const pullBox=box('electrical',0,pullBoxSpec.x,pullBoxSpec.y,pullBoxSpec.z,pullBoxSpec.width,pullBoxSpec.height,pullBoxSpec.depth,plateMat,'Embedded service pull box · LR-SE','User correction',serviceConnectionNote);
Object.assign(pullBox.userData,{servicePullBox:true,wallCode:'LR-SE',wallId:frontMountWall.id,mounting:'embedded',originalOutletPosition:[livingFront.x,livingSouthOutlet.position.y,livingSouthOutlet.position.z]});
const pullBoxCover=box('electrical',0,pullBoxSpec.x,pullBoxSpec.y,frontWallZ+.075+.002,pullBoxSpec.width+.01,pullBoxSpec.height+.01,.002,servicePvcMat,'Horizontal 2 × 4 in utility-box cover · LR-SE','User correction',serviceConnectionNote);
Object.assign(pullBoxCover.userData,{servicePullBox:true,wallId:frontMountWall.id,wallCode:'LR-SE',mounting:'embedded'});
for(const side of [-1,1]){
 const screw=part(new THREE.CylinderGeometry(.0025,.0025,.0008,12),servicePvcMat,'electrical',0,[pullBoxSpec.x+side*(pullBoxSpec.width/2-.009),pullBoxSpec.y,frontWallZ+.075+.0034],'Utility-box cover screw · LR-SE','User correction',serviceConnectionNote,false);
 screw.rotation.x=Math.PI/2;Object.assign(screw.userData,{servicePullBox:true,wallId:frontMountWall.id,wallCode:'LR-SE',mounting:'embedded'});
}
const entranceBox=box('electrical',0,serviceEntrance.x,serviceEntrance.y,serviceEntrance.z,.24,.32,.14,servicePvcMat,'Service entrance · southwest plot corner','User correction',serviceConnectionNote);entranceBox.userData.serviceEntrance=true;
const pullBoxPoint=[pullBoxSpec.x,pullBoxSpec.y,pullBoxSpec.z];
// Both service conduits use the exterior-face chase below the pull box and the
// kitchen-face chase below the panel.
const pullBoxChaseZ=frontWallZ+wallChaseOffset,pullBoxBottom=[pullBoxSpec.x,pullBoxSpec.y-pullBoxSpec.height/2,pullBoxChaseZ];
const serviceConnectionRoutes=[
 {name:'Service entrance to LR-SE pull box · underground PVC',routing:'underground',points:[[serviceEntrance.x,serviceEntrance.y,serviceEntrance.z],[serviceEntrance.x,serviceInterconnect.undergroundY,serviceEntrance.z],[pullBoxSpec.x,serviceInterconnect.undergroundY,serviceEntrance.z],[pullBoxSpec.x,serviceInterconnect.undergroundY,pullBoxChaseZ],pullBoxBottom]},
 {name:'LR-SE pull box to service panel · home run',routing:'floor-chase',points:[pullBoxBottom,[pullBoxSpec.x,.225,pullBoxChaseZ],[servicePanel.x,.225,serviceRiser.z],[servicePanel.x,servicePanel.y-servicePanel.h/2,serviceRiser.z]]}
];
for(const connection of serviceConnectionRoutes){
 const start=objects.length;
 if(connection.routing==='floor-chase')part(new THREE.TubeGeometry(roundedPipe(connection.points,.06),96,conduitSpec.radius,8,false),servicePvcMat,'electrical',0,[0,0,0],connection.name,'User correction',serviceConnectionNote,false);
 else route('electrical',0,connection.points,conduitSpec.radius,servicePvcMat,connection.name,'User correction',serviceConnectionNote);
 objects.slice(start).forEach(m=>Object.assign(m.userData,{...conduitInfo(false),serviceConnection:true,mainServiceAmps:60,routingMode:connection.routing,routePoints:connection.points,conduitMaterial:'PVC',homeRun:connection.routing==='floor-chase'}));
}

// Owner-located data utility boxes and their explicit connection topology.
const dataLines={boxes:[],routes:[],offset:.18,boxWidth:utilityBoxSize.width,boxHeight:utilityBoxSize.height,boxDepth:utilityBoxSize.depth,conduitRadius:conduitSpec.radius,via:'KT-SI passthrough'};
const dataConduitMat=material(0xb89aff,.15),dataCoverMat=material(0xbcc6d7,.1);
const dataNote='Embedded horizontal 2 × 4 in data utility box, 101.6 mm wide × 50.8 mm high with modeled 50.8 mm depth and a thin blank cover. Original positions and data connections are retained. Left/right is viewed from inside the room facing the wall. Box spacing (180 mm centers), floor-channel depth and concealed routing remain approximate.';
function dataUtilityBox(id,code,reference,side,offset=dataLines.offset,anchor=reference.position){
 const face=propertyWallFaces.find(f=>f.code===code),wall=walls.find(w=>w.id===face.wallId);
 const normal=face.axis==='x'?[face.normal,0]:[0,face.normal];
 // In the mirrored property, right when facing a wall is [-normal.z, normal.x].
 const sign=side==='right'?1:side==='left'?-1:0;
 const x=anchor.x-sign*normal[1]*offset,z=anchor.z+sign*normal[0]*offset,y=anchor.y;
 const wallPoint=face.axis==='x'?[wall.a[0],y,z]:[x,y,wall.a[1]];
 const inset=.075-dataLines.boxDepth/2,point=[wallPoint[0]+normal[0]*inset,y,wallPoint[2]+normal[1]*inset],alongX=face.axis==='z';
 const along=alongX?x-wall.a[0]:z-wall.a[1];
 electricalRecesses.push({wallId:wall.id,normal:alongX?face.normal:-face.normal,a:along-dataLines.boxWidth/2,b:along+dataLines.boxWidth/2,low:y-dataLines.boxHeight/2,high:y+dataLines.boxHeight/2,d:dataLines.boxDepth,dataBoxId:id});
 const description=anchor!==reference.position?'Original LR-SI data-box position retained beside the former outlet location below the front window.':side==='behind'?'Exterior utility box directly behind the far-right LR-SI data box; data ingress through LR-SE.':`${side==='right'?'Right':'Left'} of the ${reference.userData.wallCode} convenience outlet${offset>dataLines.offset?' (farther-right box)':''}.`;
 const start=objects.length;
 const mesh=box('data',face.floor,...point,alongX?dataLines.boxWidth:dataLines.boxDepth,dataLines.boxHeight,alongX?dataLines.boxDepth:dataLines.boxWidth,plateMat,'Data utility box · '+code+' · '+(id==='lr-far'?'ingress':id==='mb-hub'?'distribution':side),'User description',description+' '+dataNote);
 const coverOffset=.075+utilityBoxSize.coverDepth/2+utilityBoxSize.coverGap;
 const cover=[wallPoint[0]+normal[0]*coverOffset,y,wallPoint[2]+normal[1]*coverOffset];
 const coverMesh=box('data',face.floor,...cover,alongX?dataLines.boxWidth+utilityBoxSize.coverOverlap:utilityBoxSize.coverDepth,dataLines.boxHeight+utilityBoxSize.coverOverlap,alongX?utilityBoxSize.coverDepth:dataLines.boxWidth+utilityBoxSize.coverOverlap,dataCoverMat,'Horizontal 2 × 4 in data utility-box cover · '+code,'User description',description+' '+dataNote);
 for(const side of [-1,1]){
  const along=side*(dataLines.boxWidth/2-.009),screwOffset=coverOffset+utilityBoxSize.coverDepth/2+.0004;
  const pos=[wallPoint[0]+normal[0]*screwOffset+(alongX?along:0),y,wallPoint[2]+normal[1]*screwOffset+(alongX?0:along)];
  const screw=part(new THREE.CylinderGeometry(.0025,.0025,.0008,12),dataCoverMat,'data',face.floor,pos,'Data utility-box cover screw · '+code,'User description',dataNote,false);screw.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(normal[0],0,normal[1]));
 }
 objects.slice(start).forEach(m=>Object.assign(m.userData,{dataUtilityBox:true,dataBoxId:id,wallCode:code,wallId:wall.id,relativeSide:side,referenceOutletId:reference.uuid,dataIngress:id==='lr-far'||id==='lr-exterior',mounting:'embedded'}));
 const spec={id,code,floor:face.floor,normal,point,wallPoint,mesh,coverMesh,mounting:'embedded',relativeSide:side,referenceOutletId:reference.uuid};dataLines.boxes.push(spec);return spec;
}
const convenience=code=>powerOutlets.find(m=>m.userData.wallCode===code);
// Data boxes stay at their original window-referenced positions when the outlet moves.
const dataLRAnchor={x:livingFront.x,y:convenience('LR-SI').position.y,z:convenience('LR-SI').position.z};
const dataLRNear=dataUtilityBox('lr-near','LR-SI',convenience('LR-SI'),'right',dataLines.offset,dataLRAnchor);
const dataLRFar=dataUtilityBox('lr-far','LR-SI',convenience('LR-SI'),'right',dataLines.offset*2,dataLRAnchor);
const dataLRExterior=dataUtilityBox('lr-exterior','LR-SE',dataLRFar.mesh,'behind');
const dataLREast=dataUtilityBox('lr-east','LR-EI',convenience('LR-EI'),'left');
const dataGuest=dataUtilityBox('gr-west','GR-WI',convenience('GR-WI'),'left');
const dataMasterHub=dataUtilityBox('mb-hub','MB-W2I',convenience('MB-W2I'),'right');
const dataMasterEast=dataUtilityBox('mb-east','MB-EI',convenience('MB-EI'),'right');
const dataBedroom=dataUtilityBox('r1-east','R1-E1I',convenience('R1-E1I'),'right');
// Rebuild only base masonry affected by data pockets, before labels and block buffers.
// Paired boxes on opposite faces retain a solid wall core between their recesses.
const dataPocketWalls=new Set(electricalRecesses.filter(r=>r.dataBoxId).map(r=>r.wallId));
for(let i=objects.length-1;i>=0;i--){
 const mesh=objects[i];if(!mesh.userData.baseWall||!dataPocketWalls.has(mesh.userData.wallId))continue;
 mesh.removeFromParent();mesh.geometry.dispose();mesh.children.forEach(child=>{child.geometry?.dispose();child.material?.dispose();});objects.splice(i,1);
}
for(let i=wallPieces.length-1;i>=0;i--)if(wallPieces[i].baseWall&&dataPocketWalls.has(wallPieces[i].wall))wallPieces.splice(i,1);
walls.filter(w=>dataPocketWalls.has(w.id)).forEach(buildWall);
function dataRoute(from,to,floor,points,extra={}){
 const clean=points.filter((p,i)=>!i||p.some((v,j)=>Math.abs(v-points[i-1][j])>.00001));
 const name=`Data conduit · ${from.code} → ${to.code}`;
 const mesh=part(new THREE.TubeGeometry(roundedPipe(clean,.10),Math.max(24,(clean.length-1)*16),dataLines.conduitRadius,10,false),dataConduitMat,'data',floor,[0,0,0],name,'User description',conduitNote(false)+`Connects ${from.mesh.userData.name} to ${to.mesh.userData.name}. ${extra.via?'Rises through the KT-SI conduit passthrough channel. ':''}`+dataNote,false);
 const record={from:from.id,to:to.id,floor,points:clean,...conduitInfo(false),...extra};
 Object.assign(mesh.userData,{dataConduit:true,routePoints:clean,...record});dataLines.routes.push(record);
}
const dataFloorLevel=f=>floorChase.finishedLevels[f]-floorChase.centerDepth;
const dataFloorTap=b=>[b.wallPoint[0]+b.normal[0]*floorChase.wallOffset,dataFloorLevel(b.floor),b.wallPoint[2]+b.normal[1]*floorChase.wallOffset];
dataRoute(dataLRExterior,dataLRFar,0,[dataLRExterior.point,dataLRExterior.wallPoint,dataLRFar.point],{ingress:true});
// Each run between utility boxes is its own conduit with a GI pull wire, so
// runs never share a conduit or tee. Conduits meeting one box enter it side
// by side, 30 mm apart along the wall.
const dataRuns=[[dataLRNear,dataLREast],[dataLREast,dataGuest],[dataGuest,dataMasterHub],[dataMasterHub,dataMasterEast],[dataMasterHub,dataBedroom]];
const dataPorts=new Map();
for(const run of dataRuns)for(const b of run)dataPorts.set(b.id,{count:(dataPorts.get(b.id)?.count??0)+1,next:0});
function dataPort(b){
 const port=dataPorts.get(b.id),offset=(port.next++-(port.count-1)/2)*.03,along=[Math.abs(b.normal[1]),Math.abs(b.normal[0])];
 const shift=p=>[p[0]+along[0]*offset,p[1],p[2]+along[1]*offset];
 const chase=[b.wallPoint[0]+b.normal[0]*wallChaseOffset,b.wallPoint[2]+b.normal[1]*wallChaseOffset];
 return {bottom:shift([chase[0],b.point[1]-dataLines.boxHeight/2,chase[1]]),foot:shift([chase[0],dataFloorLevel(b.floor),chase[1]]),tap:shift(dataFloorTap(b))};
}
// Conduits enter each box from below: straight down the wall chase, then one bend.
const dataBottom=b=>b.bottom;
const dataDown=b=>[dataBottom(b),b.foot],dataUp=b=>[b.foot,dataBottom(b)];
// Floor run beside a partition on the x=channelX line, joining and leaving it at 45°.
function dataWallSideRun(from,to,channelX){
 const sign=Math.sign(to[2]-from[2])||1;
 return [from,[channelX,from[1],from[2]+sign*Math.abs(channelX-from[0])],[channelX,to[1],to[2]-sign*Math.abs(channelX-to[0])],to];
}
// Data rises in the guest-face chase of GR-NI, continuing on the master face above.
const dataPass=[2.55-wallChaseOffset,3.10,bathroomPartition.a[1]+wallChaseOffset];
{
 // Boxes in one room: straight floor run between the wall feet.
 const near=dataPort(dataLRNear),east=dataPort(dataLREast);
 dataRoute(dataLRNear,dataLREast,0,[...dataDown(near),...dataUp(east)],{routingMode:'floor-chase'});
}
{
 // LR-EI and GR-WI share one physical partition: keep this channel beside it.
 const east=dataPort(dataLREast),guest=dataPort(dataGuest);
 dataRoute(dataLREast,dataGuest,0,[dataBottom(east),...dataWallSideRun(east.foot,guest.foot,east.tap[0]),dataBottom(guest)],{routingMode:'floor-chase',wallSideRun:true});
}
{
 // Up the KT-SI passthrough, then beside the master side of the partition to the hub.
 const guest=dataPort(dataGuest),hub=dataPort(dataMasterHub);
 dataRoute(dataGuest,dataMasterHub,0,[dataBottom(guest),...dataWallSideRun(guest.foot,[dataPass[0],dataFloorLevel(0),dataPass[2]],guest.tap[0]),dataPass],{via:dataLines.via,part:'lower'});
 dataRoute(dataGuest,dataMasterHub,1,[dataPass,...dataWallSideRun([dataPass[0],dataFloorLevel(1),dataPass[2]],hub.foot,hub.tap[0]),dataBottom(hub)],{via:dataLines.via,part:'upper'});
}
{
 const hub=dataPort(dataMasterHub),east=dataPort(dataMasterEast);
 dataRoute(dataMasterHub,dataMasterEast,1,[...dataDown(hub),...dataUp(east)],{routingMode:'floor-chase',branch:true});
}
{
 // Pass under the partition below the hub, then follow its R1 side to the bedroom box.
 const hub=dataPort(dataMasterHub),bedroom=dataPort(dataBedroom);
 dataRoute(dataMasterHub,dataBedroom,1,[dataBottom(hub),...dataWallSideRun(hub.foot,bedroom.foot,bedroom.tap[0]),dataBottom(bedroom)],{routingMode:'floor-chase',branch:true,wallSideRun:true});
}

// P-1: water along right side; soil / drainage along left, with rear wet rooms.
const pNote='Buried depths and exact concealed bends remain approximate. Diameters are visually enlarged.';
const freshWaterRadius=.0254/4; // 1/2 inch diameter, actual displayed size.
const freshWaterRoutes=[];
function freshWater(f,name,points,extra={}){
 const start=objects.length,detail='1/2 in (12.7 mm) fresh-water pipe. Distribution passes below door thresholds; shower risers are concealed inside the north bathroom walls. Concealed depths and fixture positions remain schematic.';
 route('plumbing',f,points,freshWaterRadius,waterMat,name+' · 1/2 in','User correction · P-1',detail);
 objects.slice(start).forEach(m=>Object.assign(m.userData,{freshWater:true,diameter:.0127,routePoints:points,...extra}));freshWaterRoutes.push({floor:f,name,points,...extra});
}
const waterRiser={x:2.05,z:-2.275,groundY:-.08,upperY:2.90};
freshWater(0,'Cold water supply',[[4.8,-.08,5.7],[4.8,-.08,-2.275],[waterRiser.x,-.08,waterRiser.z]]);
freshWater(0,'Kitchen sink cold water',[[waterRiser.x,-.08,waterRiser.z],[waterRiser.x,-.08,-3.825],[kitchenCounter.sinkX,-.08,-3.825],[kitchenCounter.sinkX,1.1,-3.825],[kitchenCounter.sinkX,1.1,-3.5]]);
freshWater(0,'Cold water riser to upper slab',[[waterRiser.x,-.08,waterRiser.z],[waterRiser.x,3.1,waterRiser.z]]);
freshWater(1,'Upper bathroom supply',[[waterRiser.x,3.1,waterRiser.z],[waterRiser.x,2.90,waterRiser.z],[waterRiser.x,2.90,-3.825]]);
const sanitaryStack={x:1.95,z:-2.2,upperBranchY:2.90};
const upperSanitaryX=bathroomRoofWall.a[0]+.075+.075+.03;
const sanitaryRoutes=[];
function sanitaryRoute(floor,name,points,radius,extra={}){
 const start=objects.length;
 route('plumbing',floor,points,radius,wasteMat,name,'P-1 · User correction','Bathroom drains connect to the existing soil stack below the second-floor slab. Upper branches stay on the kitchen side of KT-WE; the Bathroom 1 vent connects to the B1 exterior exhaust. Concealed connections and displayed diameters remain schematic.');
 objects.slice(start).forEach(m=>Object.assign(m.userData,{sanitary:true,routePoints:points,...extra}));sanitaryRoutes.push({floor,name,points,radius,...extra});
}
for(const[f,x,z]of [[0,.45,-1.9],[1,2.5,-3.5]]){
 const y=f?3.1:.15,wallZ=f?-3.825:-2.275,supplyY=f?2.90:-.08;
 freshWater(f,'Bathroom underfloor distribution',[[waterRiser.x,supplyY,waterRiser.z],[waterRiser.x,supplyY,wallZ],[x,supplyY,wallZ]]);
 freshWater(f,'Shower concealed wall supply',[[x,supplyY,wallZ],[x,y+1.95,wallZ],[x,y+1.95,wallZ+.14]],{showerSupply:true,wallId:f?'u-rear':'g-bath-rear'});
 const tx=x+.75;box('plumbing',f,tx,y+.32,z,.4,.45,.56,fixtureMat,'Water closet','P-1','Simplified fixture at an approximate location from the bathroom plan.');box('plumbing',f,tx,y+.62,z-.14,.4,.4,.18,fixtureMat,'Water closet cistern','P-1');
 box('plumbing',f,tx+.55,y+.8,z,.45,.13,.37,fixtureMat,'Lavatory','P-1');
 const branchY=f?sanitaryStack.upperBranchY:y-.2,collectorX=f?upperSanitaryX:sanitaryStack.x;
 const collector=[collectorX,branchY,z],junction=[sanitaryStack.x,branchY,sanitaryStack.z];
 sanitaryRoute(f,'Bathroom waste branch · 50 mm nominal',[[tx+.55,y+.7,z],[tx+.55,branchY,z],collector],.065,{bathroomWaste:true});
 sanitaryRoute(f,'Soil branch · 100 mm nominal',[[tx,y+.1,z],[tx,branchY,z],collector,[collectorX,branchY,sanitaryStack.z],junction],.075,{bathroomSoil:true});
 for(const [fixtureX,height]of [[tx,.55],[tx+.55,.70]])freshWater(f,'Bathroom fixture supply',[[waterRiser.x,supplyY,wallZ],[fixtureX,supplyY,wallZ],[fixtureX,supplyY,z],[fixtureX,y+height,z]]);
}
box('plumbing',0,kitchenCounter.sinkX,1.05,-3.5,.65,.16,.5,fixtureMat,'Kitchen sink','A-4 · P-1','Sink contained within the approximate counter footprint used to show the reported 500 mm stair clearance. Sink profile and exact center offset are approximate.');
route('plumbing',0,[[kitchenCounter.sinkX,.98,-3.5],[kitchenCounter.sinkX,-.1,-3.5],[1.95,-.1,-2.2],[1.95,-.42,2.3]],.06,wasteMat,'Kitchen waste / soil main','P-1',pNote);
route('plumbing',0,[[1.95,-.2,-2.2],[1.95,3.025,-2.2]],.075,wasteMat,'Soil stack · lower','P-1',pNote);
const soilExitWall=walls.find(w=>w.id==='g-bath-rear');
const soilExit={wallCode:'B0-NE',wallId:soilExitWall.id,x:(soilExitWall.a[0]+soilExitWall.b[0])/2,y:3.025,z:soilExitWall.a[1]-.075-.30};
const soilExhaustPoints=[[1.95,soilExit.y,-2.2],[soilExit.x,soilExit.y,-2.2],[soilExit.x,soilExit.y,soilExit.z]];
const soilExhaust=part(new THREE.TubeGeometry(roundedPipe(soilExhaustPoints,.12),40,.075,12,false),wasteMat,'plumbing',0,[0,0,0],'Soil stack · B0-NE exterior exit','User correction','Soil pipe exits north through B0-NE into the service area. The horizontal run ends at the midpoint of B0-NE, then turns north through the wall. The stack remains below the second-floor slab top. Exit projection remains schematic.',false);
Object.assign(soilExhaust.userData,{soilExhaust:true,wallCode:soilExit.wallCode,wallId:soilExit.wallId,routePoints:soilExhaustPoints,outletDirection:[0,0,-1]});
const siteDrainagePoints=[[-.2,-.16,-2.25],[-.2,-.4,3.8],[-.2,-.45,5.8]];
const westDrainJunctionZ=-.8,westDrainJunctionT=(westDrainJunctionZ-siteDrainagePoints[0][2])/(siteDrainagePoints[1][2]-siteDrainagePoints[0][2]);
const westDrainJunction=[siteDrainagePoints[0][0],THREE.MathUtils.lerp(siteDrainagePoints[0][1],siteDrainagePoints[1][1],westDrainJunctionT),westDrainJunctionZ];
// Split the existing straight site-drain segment at the new branch connection.
route('plumbing',0,[siteDrainagePoints[0],westDrainJunction,...siteDrainagePoints.slice(1)],.075,wasteMat,'Site drainage · 100 mm nominal','P-1',pNote);
const tankMat=material(0x746d9e);tankMat.transparent=true;tankMat.opacity=.38;tankMat.depthWrite=false;
box('plumbing',0,1.7,-.35,3.0,1.5,.7,2.1,tankMat,'Septic tank','P-1','Simplified 2.10 × 1.50 m tank envelope; depth and exact position are approximate.');
route('plumbing',0,[[1.95,-.4,3.9],[1.95,-.5,5.6]],.075,wasteMat,'Sanitary outlet to sewer','P-1',pNote);
// Both front catch basins stay inside the plot and use the same concrete form.
// Owner-observed 3 in downpipe; displayed at its 76.2 mm nominal diameter.
const carportDrain={diameter:.0762,elbowY:carportFooting.top+.12,pipeX:.16,wallZ:3.65,basin:{x:.16,z:4.23,w:.48,d:.58,top:.015,depth:.32,wallThickness:.065}};
// Align the basin west edge with the footing west edge and its rear wall with the footing front face.
carportDrain.basin.x=carportFooting.interiorX-carportDrain.basin.w/2;
carportDrain.basin.z=carportFooting.south+carportDrain.basin.d/2;
const drainMat=material(0xbfb889),drainDetail='Carport downpipe: offset beneath the carport ceiling, vertical pipe on the inside of the east wall, then a diagonal run across the footing that turns vertically down along its front face into the northwest inside corner of the rectangular concrete basin. The basin rear wall sits against the footing front face and its west edge aligns with the footing west edge. The diagonal angle follows these alignments and the fixed wall downpipe; the drop is plumb, following your correction. The downpipe appears to be 3 in (76.2 mm nominal) per your observation. Elbow radii, wall offset, basin dimensions and buried depth are approximate.';
// Rounded corner curve preserves straight runs between the elbow tangencies.
function roundedPipe(points,radius=.10){
 const vectors=points.map(p=>new THREE.Vector3(...p)),path=new THREE.CurvePath();let current=vectors[0];
 for(let i=1;i<vectors.length-1;i++){const p=vectors[i],a=vectors[i-1],b=vectors[i+1],r=Math.min(radius,p.distanceTo(a)*(i===1?.9:.45),p.distanceTo(b)*(i===vectors.length-2?.9:.45)),before=p.clone().add(a.clone().sub(p).normalize().multiplyScalar(r)),after=p.clone().add(b.clone().sub(p).normalize().multiplyScalar(r));path.add(new THREE.LineCurve3(current,before));path.add(new THREE.QuadraticBezierCurve3(before,p,after));current=after;}
 path.add(new THREE.LineCurve3(current,vectors.at(-1)));return path;
}
// Viewed from the service area toward B1-EE, the right corner is north.
const westDrainWall=walls.find(w=>w.id==='u-bath-side');
const westRoofDrain={wallCode:'B1-EE',wallId:westDrainWall.id,radius:.045,x:westDrainWall.a[0]-.075-.045-.065,z:westDrainWall.a[1]+.125,buriedY:-.18,junction:westDrainJunction};
const westDrainRoofY=westRoofHeightAt(westRoofDrain.z)+.14;
const westRoofDrainNote='West roof drains through B1-EE near its right/north corner, viewed from outside. The downpipe continues below the service-area floor and connects to the existing underground site drain. The 90 mm displayed pipe diameter, corner offset, wall clearance and buried depths are schematic.';
const westRoofDrainUpperPoints=[
 [westDrainWall.a[0]+.14,westDrainRoofY,westRoofDrain.z],
 [westDrainWall.a[0]+.14,westDrainRoofY-.18,westRoofDrain.z],
 [westRoofDrain.x,westDrainRoofY-.18,westRoofDrain.z],
 [westRoofDrain.x,3.10,westRoofDrain.z]
];
const westRoofDrainLowerPoints=[westRoofDrainUpperPoints.at(-1),[westRoofDrain.x,westRoofDrain.buriedY,westRoofDrain.z],[.70,-.19,westRoofDrain.z],[.70,-.20,westDrainJunctionZ],westDrainJunction];
for(const [floor,points,name]of [[1,westRoofDrainUpperPoints,'West roof downpipe · B1-EE right corner'],[0,westRoofDrainLowerPoints,'West roof drain · below service floor to site drainage']]){
 const m=part(new THREE.TubeGeometry(roundedPipe(points,.10),120,westRoofDrain.radius,16,false),drainMat,'plumbing',floor,[0,0,0],name,'User correction',westRoofDrainNote,false);
 Object.assign(m.userData,{westRoofDownpipe:true,wallCode:westRoofDrain.wallCode,routePoints:points,undergroundConnection:floor===0});
}
// Additional owner-observed sanitary outlet beside the upper B1-EE elbow.
// Connect the upper bathroom vent to the observed B1 wall penetration.
const upperSoilExit={wallCode:'B1-EE',wallId:westDrainWall.id,x:westDrainWall.a[0]-.075-.30,y:westRoofDrainUpperPoints[2][1],z:westRoofDrain.z+.25,radius:.075};
const upperSoilExhaustPoints=[[upperSanitaryX,upperSoilExit.y,upperSoilExit.z],[upperSoilExit.x,upperSoilExit.y,upperSoilExit.z]];
const upperSoilExhaust=part(new THREE.TubeGeometry(roundedPipe(upperSoilExhaustPoints),8,upperSoilExit.radius,12,false),wasteMat,'plumbing',1,[0,0,0],'Soil pipe exhaust · B1-EE','User correction','Additional soil-pipe exhaust through B1-EE beside the upper downpipe elbow. Shown at the elbow height, 250 mm toward the south along the wall. The spacing, 300 mm exterior projection and displayed diameter are approximate; its interior vent joins the Bathroom 1 soil branch below the slab.',false);
Object.assign(upperSoilExhaust.userData,{soilExhaust:true,additionalSoilExhaust:true,wallCode:upperSoilExit.wallCode,wallId:upperSoilExit.wallId,routePoints:upperSoilExhaustPoints,outletDirection:[-1,0,0]});
const upperSoilBranch=sanitaryRoutes.find(r=>r.floor===1&&r.bathroomSoil);
const upperVentPoints=[upperSoilBranch.points[2],[upperSanitaryX,sanitaryStack.upperBranchY,upperSoilExit.z],upperSoilExhaustPoints[0]];
sanitaryRoute(1,'Bathroom 1 soil vent · connects to B1 exhaust',upperVentPoints,upperSoilExit.radius,{bathroomVent:true});
// East-roof outlet drops on BL-NI beside its east corner, then turns only
// after passing through the balcony slab to the existing CP-EI downpipe.
const balconyDrainWall=walls.find(w=>w.id==='u-balcony');
const eastRoofDrain={radius:carportDrain.diameter/2,x:carportDrain.pipeX,wallZ:balconyDrainWall.a[1]+.075+carportDrain.diameter/2+.03,slabTop:3.10,slabBottom:2.95,underSlabY:2.95-carportDrain.diameter/2-.02,joinY:2.675};
const eastRoofDrainNote='East roof downpipe descends on BL-NI beside the east corner, passes directly through the balcony floor, then runs beneath its underside to the CP-EI downpipe. The 160 mm corner center offset, 30 mm wall clearance, 20 mm slab clearance and pipe profile are schematic.';
const eastRoofDrainUpperPoints=[
 [eastRoofDrain.x,balconyEdgeY+.14,balconyRoof.endZ],
 [eastRoofDrain.x,balconyEdgeY-.08,balconyRoof.endZ],
 [eastRoofDrain.x,balconyEdgeY-.08,eastRoofDrain.wallZ],
 [eastRoofDrain.x,eastRoofDrain.slabTop,eastRoofDrain.wallZ]
];
const innerEastRoofDrainUpperPoints=eastRoofDrainUpperPoints.map(([x,y,z],i)=>[x,i<3?y+innerBalconyEdgeY-balconyEdgeY:y,i<2?innerBalconyRoof.endZ:z]);
const eastRoofDrainLowerPoints=[
 eastRoofDrainUpperPoints.at(-1),
 [eastRoofDrain.x,eastRoofDrain.underSlabY,eastRoofDrain.wallZ],
 [carportDrain.pipeX,eastRoofDrain.underSlabY,carportDrain.wallZ]
];
for(const [floor,points,name,variant]of [[1,eastRoofDrainUpperPoints,'East roof downpipe · BL-NI corner','end'],[1,innerEastRoofDrainUpperPoints,'East roof downpipe · BL-NI corner','inner'],[0,eastRoofDrainLowerPoints,'Balcony underside connection · BL-NI to CP-EI']]){
 const m=part(new THREE.TubeGeometry(roundedPipe(points,.10),100,eastRoofDrain.radius,16,false),drainMat,'plumbing',floor,[0,0,0],name,'User correction',eastRoofDrainNote,false);
 Object.assign(m.userData,{eastRoofDownpipe:true,wallCode:floor?'BL-NI':'CP-EI',routePoints:points,...(variant?{roofVariant:variant}:{})});
}
// Southeast balcony floor drain sits directly above CP-EI. The east-roof
// branch joins this straight drop at a tee below the balcony slab.
const balconyFloorDrain={x:carportDrain.pipeX,z:carportDrain.wallZ,floorY:eastRoofDrain.slabTop,size:.18,radius:eastRoofDrain.radius,teeY:eastRoofDrain.underSlabY,joinY:eastRoofDrain.joinY};
const balconyFloorDrainNote='Balcony drains at the southeast corner, directly above the CP-EI downpipe. Its outlet drops vertically through the slab; the east-roof branch joins it at a tee below the balcony floor. Drain/grate dimensions and corner offsets are schematic.';
const floorDrainStart=objects.length,fd=balconyFloorDrain;
const grateMat=material(0x7c898f,.65),drainRecessMat=material(0x243038);
box('plumbing',1,fd.x,fd.floorY+.001,fd.z,fd.size,.002,fd.size,drainRecessMat,'Balcony floor drain · southeast corner','User correction',balconyFloorDrainNote);
for(const side of [-1,1]){
 box('plumbing',1,fd.x+side*(fd.size-.016)/2,fd.floorY+.004,fd.z,.016,.006,fd.size,grateMat,'Balcony drain grate · frame','User correction',balconyFloorDrainNote);
 box('plumbing',1,fd.x,fd.floorY+.004,fd.z+side*(fd.size-.016)/2,fd.size-.032,.006,.016,grateMat,'Balcony drain grate · frame','User correction',balconyFloorDrainNote);
}
for(let i=-2;i<=2;i++)box('plumbing',1,fd.x+i*.026,fd.floorY+.004,fd.z,.009,.006,fd.size-.032,grateMat,'Balcony drain grate · bar','User correction',balconyFloorDrainNote);
objects.slice(floorDrainStart).forEach(m=>Object.assign(m.userData,{balconyFloorDrain:true,drainLocation:'southeast balcony corner'}));
const balconyDrainDropPoints=[[fd.x,fd.floorY,fd.z],[fd.x,fd.teeY,fd.z],[fd.x,fd.joinY,fd.z]];
const balconyDrainDropStart=objects.length;
route('plumbing',0,balconyDrainDropPoints,fd.radius,drainMat,'Balcony floor drain · direct drop to CP-EI','User correction',balconyFloorDrainNote);
objects.slice(balconyDrainDropStart).forEach(m=>Object.assign(m.userData,{balconyDrainDrop:true,routePoints:balconyDrainDropPoints}));
// Mirrored property: west is increasing model x; north is decreasing z.
// Keep the pipe outer edge 10 mm clear of both inside basin faces.
const basinEntryInset=carportDrain.basin.wallThickness+carportDrain.diameter/2+.01;
carportDrain.basinEntry={x:carportDrain.basin.x+carportDrain.basin.w/2-basinEntryInset,z:carportDrain.basin.z-carportDrain.basin.d/2+basinEntryInset};
// The diagonal ends directly over the basin inlet so the entire drop is vertical.
carportDrain.diagonalEnd={...carportDrain.basinEntry};
const mainDrainPoints=[[carportDrain.pipeX,eastRoofDrain.joinY,carportDrain.wallZ],[carportDrain.pipeX,carportDrain.elbowY,carportDrain.wallZ],[carportDrain.diagonalEnd.x,carportDrain.elbowY,carportDrain.diagonalEnd.z],[carportDrain.basinEntry.x,-.14,carportDrain.basinEntry.z]];
const drainPipe=part(new THREE.TubeGeometry(roundedPipe(mainDrainPoints),100,carportDrain.diameter/2,16,false),drainMat,'plumbing',0,[0,0,0],'Carport downspout · diagonal footing run','User correction · IMG_5147 · IMG_5149',drainDetail,false);Object.assign(drainPipe.userData,{carportDownspout:true,wallCode:'CP-EI',routePoints:mainDrainPoints});
for(const y of [carportDrain.elbowY+.16,1.23,2.50]){part(new THREE.CylinderGeometry(carportDrain.diameter/2+.007,carportDrain.diameter/2+.007,.04,18),drainMat,'plumbing',0,[carportDrain.pipeX,y,carportDrain.wallZ],'Downspout collar / clamp','IMG_5147',drainDetail,false).userData.carportDownspout=true;}
const cb=carportDrain.basin,basinMat=material(0x9a9d98),t=cb.wallThickness;
function concreteCatchBasin(basin,label,source,detail,tag){
 const {x,z,w,d,top,depth}=basin;
 const pieces=[box('plumbing',0,x,top-depth,z,w,.06,d,basinMat,label+' · base',source,detail)];
 for(const side of [-1,1]){pieces.push(box('plumbing',0,x+side*(w-t)/2,top-depth/2,z,t,depth,d,basinMat,label+' · concrete side',source,detail));pieces.push(box('plumbing',0,x,top-depth/2,z+side*(d-t)/2,w-t*2,depth,t,basinMat,label+' · concrete end',source,detail));}
 pieces.forEach(m=>Object.assign(m.userData,{[tag]:true,basinGeometry:basin}));
}
concreteCatchBasin(cb,'Carport rectangular catch basin','IMG_5147',drainDetail,'carportBasin');
// Matching depth and z align the north edges of both front catch basins.
const westCatchBasin={...cb,x:westWall.a[0]-cb.w/2-.02};
const westDrainDetail='Southwest catch basin sits in front of the south wall, wholly inside the west property boundary. Its north edge aligns with the east/right catch basin. Its open concrete base, four sides, dimensions and finish match that basin, following your correction. Placement offsets and concealed discharge remain approximate.';
concreteCatchBasin(westCatchBasin,'Southwest rectangular catch basin','User correction · IMG_5147 reference',westDrainDetail,'westCatchBasin');
const rainDrainageRoutes=[
 {name:'East catch basin to west catch basin',points:[[cb.x,-.20,cb.z],[westCatchBasin.x,-.24,westCatchBasin.z]]},
 {name:'West catch basin to sidewalk drainage',points:[[westCatchBasin.x,-.24,westCatchBasin.z],[westCatchBasin.x,-.32,8.175]]}
];
for(const {name,points}of rainDrainageRoutes){const start=objects.length;route('plumbing',0,points,.055,wasteMat,name,'User correction','Rainwater drains from the east catch basin to the west catch basin, then to sidewalk drainage at the south plot boundary. Buried slope and depth remain schematic.');objects.slice(start).forEach(m=>Object.assign(m.userData,{rainDrainage:true,routePoints:points}));}
box('plumbing',0,westCatchBasin.x,-.32,8.175,.50,.16,.22,basinMat,'Sidewalk drainage connection','User correction','Schematic receiving connection at the south plot boundary.');
// Inner lots close the house's side openings, leaving the rear service area open.
const sharedSideWall=walls.find(w=>w.id==='g-side');
const sharedSideSpan={north:sharedSideWall.a[1],south:sharedSideWall.b[1],balconyStart:walls.find(w=>w.id==='u-balcony').a[1],balconyEnd:innerBalconyRoof.endZ};
for(const [floor,bottom,top] of [[0,.25,3.1],[1,3.1,innerParapetHeight]]){
 const south=floor?sharedSideSpan.balconyStart:sharedSideSpan.south;
 const length=south-sharedSideSpan.north,center=(sharedSideSpan.north+south)/2;
 const wall=box('structure',floor,0,(bottom+top)/2,center,.15,top-bottom,length,mats.wall,'Shared side firewall','Block layout','Party wall for an inner lot adjoining another unit. Leaves the rear service area open; the master bedroom firewall and its 150 mm coping match the Bedroom 1 front parapet top.');
 Object.assign(wall.userData,{innerOnly:true,isWall:true,wallId:floor?'u-side':'g-side'});wall.visible=false;
}
const innerCopingLength=sharedSideSpan.balconyStart-sharedSideSpan.north,innerCopingCenter=(sharedSideSpan.north+sharedSideSpan.balconyStart)/2;
const innerCoping=box('roof',2,0,innerParapetHeight+copingHeight/2,innerCopingCenter,.19,copingHeight,innerCopingLength,skinMat,'Shared side firewall coping','Block layout','The master bedroom firewall coping matches the Bedroom 1 front parapet top and stops before the service area. The balcony side coping steps down to its roof slope.');innerCoping.userData.innerOnly=true;innerCoping.visible=false;
// The balcony wall and 150 mm coping fit below the upper roof surface.
const balconyFirewallTop=z=>innerBalconyRoof.heightAt(z)+.14+.035/2*Math.sqrt(1+innerBalconyRoof.pitch**2);
const balconyFirewallNote='Inner-unit balcony firewall reaches the balcony edge. Its 150 mm coping follows the balcony roof slope with its top flush with the roof covering; masonry stops below the coping. The bedroom party wall and front parapet clear the joined main roof.';
function balconyFirewallBand(system,width,lowAt,highAt,name){
 const z0=sharedSideSpan.balconyStart,z1=sharedSideSpan.balconyEnd;
 const shape=new THREE.Shape();shape.moveTo(z0,lowAt(z0));shape.lineTo(z1,lowAt(z1));shape.lineTo(z1,highAt(z1));shape.lineTo(z0,highAt(z0));shape.closePath();
 const geometry=new THREE.ExtrudeGeometry(shape,{depth:width,bevelEnabled:false});geometry.rotateY(-Math.PI/2);geometry.translate(width/2,0,0);
 const mesh=part(geometry,system==='structure'?mats.wall:skinMat,system,system==='structure'?1:2,[0,0,0],name,'Block layout',balconyFirewallNote);
 Object.assign(mesh.userData,{innerOnly:true,balconyFirewall:true});mesh.visible=false;return mesh;
}
const balconyFirewall=balconyFirewallBand('structure',.15,()=>3.1,z=>balconyFirewallTop(z)-copingHeight,'Shared balcony firewall');
balconyFirewall.userData.isWall=true;
balconyFirewall.userData.measurementSpecs=[
 {a:[.08,3.1,sharedSideSpan.balconyStart],b:[.08,3.1,sharedSideSpan.balconyEnd],offset:[0,-.24,0],label:'Length'},
 {a:[.08,3.1,sharedSideSpan.balconyEnd],b:[.08,balconyFirewallTop(sharedSideSpan.balconyEnd)-copingHeight,sharedSideSpan.balconyEnd],offset:[0,0,.24],label:'End height'},
 {a:[.08,3.1,sharedSideSpan.balconyStart],b:[.08,balconyFirewallTop(sharedSideSpan.balconyStart)-copingHeight,sharedSideSpan.balconyStart],offset:[0,0,-.24],label:'Start height'}
];
const balconyFirewallCoping=balconyFirewallBand('roof',.19,z=>balconyFirewallTop(z)-copingHeight,balconyFirewallTop,'Shared balcony firewall coping');
// Inner units raise the master front wall above its roof as a parapet.
const masterFrontWall=walls.find(w=>w.id==='u-balcony');
const masterFrontSlopeWall=objects.find(m=>m.userData.wallId===masterFrontWall.id&&m.userData.slopedWallExtension);
const masterFrontParapet={wallId:masterFrontWall.id,x0:masterFrontWall.a[0],x1:masterFrontWall.b[0],z:masterFrontWall.a[1],bottom:masterFrontSlopeWall.userData.topAtStart,top:innerParapetHeight};
const masterFrontParapetNote='Inner-unit master bedroom front wall extends above the roof as a parapet, with its finished top and the master bedroom firewall coping aligned to the Bedroom 1 front parapet. The 150 mm coping clears the joined west-slope roof. End units retain their roof-slope wall.';
const masterFrontParapetWall=box('structure',1,(masterFrontParapet.x0+masterFrontParapet.x1)/2,(masterFrontParapet.bottom+masterFrontParapet.top)/2,masterFrontParapet.z,masterFrontParapet.x1-masterFrontParapet.x0,masterFrontParapet.top-masterFrontParapet.bottom,.15,mats.wall,'Master bedroom front parapet','Block layout',masterFrontParapetNote);
Object.assign(masterFrontParapetWall.userData,{innerOnly:true,isWall:true,wallId:masterFrontWall.id,masterFrontParapet:true});masterFrontParapetWall.visible=false;
const masterFrontParapetCoping=box('roof',1,(masterFrontParapet.x0+masterFrontParapet.x1)/2,masterFrontParapet.top+copingHeight/2,masterFrontParapet.z,masterFrontParapet.x1-masterFrontParapet.x0+.04,copingHeight,.19,darkFascia,'Master bedroom front parapet coping','Block layout',masterFrontParapetNote);
Object.assign(masterFrontParapetCoping.userData,{innerOnly:true,masterFrontParapetCoping:true});masterFrontParapetCoping.visible=false;
// Context shells keep the existing opaque exterior and omit the comparison canopy.
canopyGroups[1].traverse(m=>m.userData.templateHidden=true);canopyGroups[1].visible=false;
roofFrames.forEach(m=>{m.visible=false;m.userData.templateHidden=true;});

// Labels remain attached to their floor and are hidden when isolating a system.
const labelGroups=[new THREE.Group(),new THREE.Group()];labelGroups.forEach(g=>root.add(g));
function label(text,x,y,z,f){const c=document.createElement('canvas');c.width=512;c.height=96;const ctx=c.getContext('2d');ctx.fillStyle='rgba(17,31,46,.86)';ctx.beginPath();ctx.roundRect(0,0,512,96,14);ctx.fill();ctx.font='500 33px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#d8e7ef';ctx.fillText(text,256,48);const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;const mat=new THREE.SpriteMaterial({map:tex,transparent:true,depthTest:true});const spr=new THREE.Sprite(mat);spr.position.set(x,y,z);spr.scale.set(1.55,.29,1);spr.userData={height:y,floor:f};labelGroups[f].add(spr);return spr;}
for(const[f,x,z,name]of [[0,3.8,2.2,'LIVING'],[0,3.8,.1,'DINING'],[0,3.1,-2.6,'KITCHEN'],[0,1.15,0,'GUEST ROOM'],[0,1.1,2.7,'CARPORT'],[1,1.2,.2,'MASTER BEDROOM'],[1,3.8,1.7,'BEDROOM 1'],[1,1.25,3.3,'BALCONY']])label(name,x,f?3.35:.5,z,f);

// Wall labels are flat, single-sided signs on each actual wall face.
// They are outside the mirrored root so text remains readable in either hand.
const secondFloorCeiling=5.65,wallBaseSurfaces=buildWallSurfaces(walls);
const frontParapetMesh=objects.find(m=>m.userData.name==='High front parapet'),frontWall=walls.find(w=>w.id==='u-front');
wallPieces.push({wall:frontWall.id,a:0,b:Math.hypot(frontWall.b[0]-frontWall.a[0],frontWall.b[1]-frontWall.a[1]),low:frontParapetMesh.position.y-frontParapetMesh.geometry.parameters.height/2,high:frontParapetMesh.position.y+frontParapetMesh.geometry.parameters.height/2});
const wallSurfaceDefinitions=[...wallBaseSurfaces,...buildWallExtensions(wallBaseSurfaces,wallPieces,secondFloorCeiling)],wallLabelGroups=[new THREE.Group(),new THREE.Group()],wallLabels=[],wallCodeTextures=new Map();
const wallLabelFrame=new THREE.Group();scene.add(wallLabelFrame);wallLabelGroups.forEach(g=>wallLabelFrame.add(g));
function wallCodeTexture(code,type){
 if(wallCodeTextures.has(code))return wallCodeTextures.get(code);
 const c=document.createElement('canvas');c.width=512;c.height=160;const ctx=c.getContext('2d');ctx.fillStyle=type==='E'?'#463325':'#123a38';ctx.beginPath();ctx.roundRect(0,0,512,160,20);ctx.fill();ctx.strokeStyle=type==='E'?'#edba87':'#76dfca';ctx.lineWidth=5;ctx.stroke();ctx.font='600 92px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#ffffff';ctx.fillText(code,256,83,484);const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;wallCodeTextures.set(code,texture);return texture;
}
for(const face of wallSurfaceDefinitions){
 const wall=walls.find(w=>w.id===face.wallId),length=Math.hypot(wall.b[0]-wall.a[0],wall.b[1]-wall.a[1]);
 const patches=wallPieces.filter(p=>p.wall===face.wallId).map(p=>({...p,a:Math.max(p.a,face.start),b:Math.min(p.b,face.end),low:face.extension?Math.max(p.low,secondFloorCeiling):p.low,high:face.floor===1&&!face.extension?Math.min(p.high,secondFloorCeiling):p.high})).filter(p=>p.b-p.a>.16&&p.high-p.low>.18);
 const score=p=>(!face.extension&&Math.abs(p.high-wall.top)<.001?3:0)+Math.min(p.b-p.a,.95)*Math.min(p.high-p.low,.65);patches.sort((a,b)=>score(b)-score(a));
 const patch=patches[0];if(!patch)throw new Error('No solid label surface: '+face.id);
 const width=Math.min(.95,patch.b-patch.a-.04),height=Math.min(.30,patch.high-patch.low-.04,width*.34),along=(patch.a+patch.b)/2;
 // Labels on lintels or narrow returns stay clear of the door/window cutouts.
 const y=face.wallId==='g-bath-south'&&face.start===2.05?2.65:Math.max(patch.low+height/2+.02,patch.high-height/2-.14);
 const x=wall.a[0]+(wall.b[0]-wall.a[0])*along/length,z=wall.a[1]+(wall.b[1]-wall.a[1])*along/length;
 const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,height),new THREE.MeshBasicMaterial({transparent:true,side:THREE.FrontSide,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}));
 mesh.userData={system:'structure',floor:face.floor,source:'A-2',wallId:face.wallId,isWallLabel:true,face,anchor:[x,y,z],patch,width,height};
 mesh.renderOrder=3;wallLabelGroups[face.floor].add(mesh);wallLabels.push(mesh);objects.push(mesh);
}
for(const id of ['g-side','u-side']){const wall=walls.find(w=>w.id===id);wallPieces.push({wall:id,a:0,b:Math.hypot(wall.b[0]-wall.a[0],wall.b[1]-wall.a[1]),low:wall.bottom,high:wall.floor?innerParapetHeight:wall.top,innerOnly:true});}
wallPieces.push({wall:'u-side',a:sharedSideSpan.balconyStart-sharedSideSpan.north,b:sharedSideSpan.balconyEnd-sharedSideSpan.north,low:3.1,high:balconyFirewallTop(sharedSideSpan.balconyStart)-copingHeight,innerOnly:true});
wallPieces.push({wall:masterFrontParapet.wallId,a:0,b:masterFrontParapet.x1-masterFrontParapet.x0,low:masterFrontParapet.bottom,high:masterFrontParapet.top,innerOnly:true});
function wallLabelY(mesh){
 const d=mesh.userData;let y=d.anchor[1];
 if(d.face.extension&&!activeUnit().end){
  if(d.wallId===masterFrontParapet.wallId||d.wallId==='u-side')y=innerParapetHeight-d.height/2-.10;
  else if(['u-divider','u-bath-south','u-master-rear'].includes(d.wallId)&&d.anchor[2]<=westFirewallEndZ+.001)y=innerRoofUndersideAt(d.anchor[2])-d.height/2-.10;
 }
 return y+(d.face.extension&&d.wallId==='u-front'?state.explode:0);
}

let wallLabelHand=null;
function syncWallLabels(right){
 wallLabelGroups.forEach((g,f)=>{g.position.y=f*state.explode;g.visible=state.wallLabels&&state.layers.structure&&state.opacity>0&&(state.level==='all'||state.level===String(f));});
 wallLabels.forEach(mesh=>{const parapet=mesh.userData.face.extension&&mesh.userData.wallId==='u-front';mesh.visible=!parapet||(state.layers.roof&&state.roofskin);mesh.position.y=wallLabelY(mesh);mesh.material.opacity=state.opacity;});
 const hand=String(right)+':'+activeUnit().row;if(wallLabelHand===hand)return;wallLabelHand=hand;
 const codes=surfaceCodes(wallSurfaceDefinitions,right).map(d=>({...d,code:orientWallCode(d.code,activeUnit().row===1),direction:activeUnit().row===1?({N:'S',S:'N',E:'W',W:'E'})[d.direction]:d.direction}));
 wallLabels.forEach((mesh,i)=>{const d=codes[i],[x,y,z]=mesh.userData.anchor,nx=d.axis==='x'?d.normal*(right?-1:1):0,nz=d.axis==='z'?d.normal:0;
  const offset=d.type==='E'?.165:.092;mesh.position.set((right?2.525-x:x-2.525)+nx*offset,wallLabelY(mesh),z+nz*offset);mesh.rotation.y=Math.atan2(nx,nz);
  mesh.material.map=wallCodeTexture(d.code,d.type);mesh.material.needsUpdate=true;
  Object.assign(mesh.userData,{code:d.code,name:d.code+' · '+roomNames[d.room]+(d.extension?' · Wall extension':''),detail:`${roomNames[d.room]} · ${({N:'north',S:'south',E:'east',W:'west'})[d.direction]} wall · ${d.type==='E'?'exterior face':'space-facing interior surface'}. ${d.extension?'Wall extension above the second-floor ceiling (+5.65 m); -X identifies this upper surface. ':''}${d.type==='I'&&d.neighbor?'Opposite space: '+roomNames[d.neighbor]+'. ':''}Numbers distinguish separate spans on the same side of a room. Wall codes identify model surfaces.`,normal:[nx,0,nz]});
 });
 const body=document.querySelector('#wall-code-rows');body.replaceChildren();
 codes.slice().sort((a,b)=>a.code.localeCompare(b.code)).forEach(d=>{const row=document.createElement('tr');for(const text of [d.code,roomNames[d.room],(d.type==='E'?'Exterior':'Interior')+(d.extension?' extension':''),({N:'North',S:'South',E:'East',W:'West'})[d.direction]]){const cell=document.createElement('td');cell.textContent=text;row.append(cell);}body.append(row);});
}

const siteGeometry=[];
for(const mesh of objects){
 const d=mesh.userData;
 if(d.serviceEntrance||(d.serviceConnection&&d.routingMode==='underground')||d.rainDrainage||d.name==='Sidewalk drainage connection'||d.name==='Site drainage · 100 mm nominal'){
  mesh.updateMatrix();const matrix=mesh.matrix.clone();
  siteGeometry.push({mesh,positions:mesh.geometry.attributes.position.array.slice(),matrix,inverse:matrix.clone().invert()});
 }
}
let siteGeometryUnit=null;
function fitSiteGeometry(u){
 const key=[u.id,u.width,u.depth,u.rearSpace].join(':');if(key===siteGeometryUnit)return;siteGeometryUnit=key;
 const frontZ=3.825+u.frontClearance,sideX=-u.sideClearance/Math.abs(u.scaleX),v=new THREE.Vector3();
 for(const entry of siteGeometry){
  const {mesh,positions,matrix,inverse}=entry;if(!mesh.userData.lotGeometry){mesh.geometry=mesh.geometry.clone();mesh.userData.lotGeometry=true;}
  const attr=mesh.geometry.attributes.position;
  for(let i=0;i<attr.count;i++){
   v.fromArray(positions,i*3).applyMatrix4(matrix);
   if(v.z>3.825)v.z=3.825+(v.z-3.825)*(frontZ-3.825)/4.35;
   if(v.x<0)v.x=v.x*sideX/-1.95;
   v.applyMatrix4(inverse);attr.setXYZ(i,v.x,v.y,v.z);
  }
  attr.needsUpdate=true;mesh.geometry.computeVertexNormals();mesh.geometry.computeBoundingSphere();mesh.geometry.computeBoundingBox();
  for(const child of mesh.children)if(child.isLineSegments){child.geometry.dispose();child.geometry=new THREE.EdgesGeometry(mesh.geometry);}
 }
 const carMesh=objects.find(m=>m.userData.carModel);
 if(carMesh){const car=carportProposal.car,group=carMesh.parent;group.position.z=frontZ-carportProposal.gateClearance-car.l;group.scale.x=1/Math.abs(u.scaleX);}
}
const lotsKey='thea-block-lots-v1';
let lots=defaultLots();try{const saved=localStorage.getItem(lotsKey);lots=restoreLots(saved);if(saved!==null)localStorage.setItem(lotsKey,JSON.stringify(lots));}catch{}
let block=layoutBlock(minimumLots());
const plot={};
mats.door.color.set(0xe9e7df);frameMat.color.set(0xe4e3db);mats.glass.color.set(0x869b9f);railMat.color.set(0x353237);skinMat.color.set(0x484348);
const blockView=createBlockView(scene,systems,wallMaterials),{siteGroup,siteLabels}=blockView;
function activeUnit(){return block.units[state.unitId-1];}
function blockViewBounds(){
 if(state.showRearUnits)return block.bounds;
 const front=block.units.filter(u=>u.row===0),west=Math.min(...front.map(u=>u.west)),east=Math.max(...front.map(u=>u.east)),north=Math.min(...front.map(u=>u.north)),south=Math.max(...front.map(u=>u.south));
 return {west,east,north,south,width:east-west,depth:south-north};
}
function sizeSiteLabels(){blockView.resizeLabels(camera,viewport.clientHeight);}
function persistLots(){try{localStorage.setItem(lotsKey,JSON.stringify(lots));}catch{}}
function updateLotInputs(){
 const u=activeUnit(),width=document.querySelector('#lot-width');width.value=u.width;width.min=u.end?6:5;width.max=u.end?50:5;width.readOnly=!u.end;document.querySelector('#lot-width-note').hidden=u.end;
 document.querySelector('#lot-depth').min=u.end?8.65:10;document.querySelector('#lot-depth').value=u.depth;document.querySelector('#lot-rear').value=u.rearSpace;document.querySelector('#lot-area').textContent=u.area.toFixed(2)+' m²';document.querySelector('#lot-error').hidden=true;
}
function rebuildBlock(){
 block=layoutBlock(state.scope==='block'?minimumLots():lots);const span=Math.max(block.bounds.width,block.bounds.depth);scene.fog.near=Math.max(90,span*4);scene.fog.far=Math.max(250,span*10);blockView.update(block,state.unitId,state.scope,state.showRearUnits);
 if(window.townhouse){window.townhouse.block=block;window.townhouse.lots=lots;}
}
function focusUnit(id){
 if(!block.units.some(u=>u.id===id))return;
 clearSelection();state.unitId=id;state.scope='unit';rebuildBlock();updateLotInputs();setView('iso');
}
function showBlock(){clearSelection();state.scope='block';rebuildBlock();setView(state.view==='top'?'top':'iso');}
function configureLot(id,width,depth,rearSpace=lots[id-1]?.rearSpace??0){
 if(!Number.isInteger(id)||id<1||id>8)return 'Select a unit from 1 to 8.';
 const error=validateLot({width,depth,rearSpace},id-1);if(error)return error;
 lots[id-1]={id,width,depth,rearSpace};persistLots();clearSelection();rebuildBlock();updateLotInputs();setView(state.view);return null;
}
for(const u of block.units){
 const button=document.createElement('button');button.type='button';button.dataset.unit=String(u.id);button.style.gridColumn=String(u.col+1);
 button.innerHTML=`Unit ${u.id}<small>${u.end?'End lot':'Inner lot'}</small>`;button.onclick=()=>focusUnit(u.id);document.querySelector('#unit-grid').append(button);
}
document.querySelector('#block-overview').onclick=showBlock;
document.querySelector('#rear-units').onchange=e=>{state.showRearUnits=e.target.checked;rebuildBlock();setView(state.view);};
for(const key of ['width','depth'])document.querySelector('#lot-'+key).oninput=()=>{
 const width=Number(document.querySelector('#lot-width').value),depth=Number(document.querySelector('#lot-depth').value);
 document.querySelector('#lot-area').textContent=(width*depth).toFixed(2)+' m²';
};
document.querySelector('#lot-form').onsubmit=e=>{
 e.preventDefault();const error=configureLot(state.unitId,Number(document.querySelector('#lot-width').value),Number(document.querySelector('#lot-depth').value),Number(document.querySelector('#lot-rear').value));
 if(error){const el=document.querySelector('#lot-error');el.textContent=error;el.hidden=false;}
};
updateLotInputs();rebuildBlock();

const measurements=createMeasurements(scene);
let selected=null,measurementTarget=null;
let initialInfo=document.querySelector('#selection').innerHTML;
function updateOverview(){
 const u=activeUnit();initialInfo=state.scope==='block'?`<span class="eyebrow">BLOCK OVERVIEW</span><h3>${state.showRearUnits?'8 units · Two rows of four':'4 of 8 units · Front row'}</h3><p>${block.area.toFixed(0)} m² total · Minimum lots · Back-to-back rows</p><div class="card-footer">Select a house or unit button to focus its controls</div>`:`<span class="eyebrow">UNIT ${u.id} OVERVIEW</span><h3>${u.width} × ${u.depth} m lot · ${u.area.toFixed(2)} m²</h3><p>${u.end?'End lot · '+u.sideClearance.toFixed(2)+' m '+u.openSide+' clearance':'Inner lot · Both sides adjoining'}<br>${u.frontDirection==='south'?'South':'North'}-facing · ${u.rearAdjoining?'Rear adjoining':u.rearSpace.toFixed(2)+' m rear space'} · ${u.frontClearance.toFixed(2)} m front</p><div class="card-footer">Select a surface to see measurements</div>`;
}

function clearSelection(){measurements.clear();measurementTarget=null;selected=null;document.querySelector('#selection').dataset.selected='false';document.querySelector('#selection').innerHTML=initialInfo;}
function sync(){
 const u=activeUnit(),right=u.mirrored;state.end=right?'right':'left';
 root.visible=state.scope==='unit';wallLabelFrame.visible=root.visible;
 document.querySelectorAll('[data-unit-controls]').forEach(el=>el.hidden=state.scope==='block');
 document.querySelector('#block-controls').hidden=state.scope!=='block';document.querySelector('#rear-units').checked=state.showRearUnits;
 document.querySelector('#unit-grid').classList.toggle('front-only',state.scope==='block'&&!state.showRearUnits);
 document.querySelectorAll('[data-unit]').forEach(el=>el.hidden=state.scope==='block'&&!state.showRearUnits&&Number(el.dataset.unit)>4);
 root.scale.set(u.scaleX,1,1);root.rotation.y=u.rotation;root.position.set(u.modelX,0,u.modelZ);root.updateMatrixWorld(true);
 fitSiteGeometry(u);
 const sideClips=u.end?[]:[new THREE.Plane(new THREE.Vector3(1,0,0),-u.west+.075),new THREE.Plane(new THREE.Vector3(-1,0,0),u.east+.075)];
 root.traverse(node=>{if(node.material){for(const mat of Array.isArray(node.material)?node.material:[node.material])mat.clippingPlanes=sideClips;}});
 wallLabelFrame.rotation.y=u.rotation;wallLabelFrame.scale.x=Math.abs(u.scaleX);wallLabelFrame.position.copy(root.localToWorld(new THREE.Vector3(2.525,0,0)));
 syncWallLabels(right);
 Object.assign(plot,u,{eastClearance:u.openSide==='east'?u.sideClearance:0});
 updateOverview();if(!selected)document.querySelector('#selection').innerHTML=initialInfo;
 document.querySelector('.model-badge').textContent=state.scope==='block'?'8 UNIT BLOCK':`UNIT ${u.id} / ${u.end?'END LOT':'INNER LOT'}`;
 document.querySelector('#unit-note').textContent=`Unit ${u.id} · ${u.end?'End':'Inner'} lot · ${u.frontDirection==='south'?'South':'North'}-facing. ${u.end?u.openSide+' side open; other side attached':'Both sides attached'}. Rear: ${u.rearAdjoining?'adjoining unit':u.rearSpace.toFixed(2)+' m space'}.`;
 document.querySelectorAll('[data-unit]').forEach(el=>{const active=Number(el.dataset.unit)===u.id;el.classList.toggle('active',active);el.setAttribute('aria-pressed',String(active));});
 document.querySelector('#block-overview').classList.toggle('active',state.scope==='block');
 document.querySelector('[data-view="side"]').title='Side elevation';document.querySelector('[data-view="front"]').title=u.frontDirection+' / front elevation';
 document.querySelector('[data-view="top"]').title='Plot plan · north up';
 for(const[id]of defs)systems[id].forEach((g,f)=>{g.visible=state.layers[id]&&(state.level==='all'||f===Number(state.level)||(f===2&&state.level==='1'));g.position.y=f===2?state.explode*2:f*state.explode;});
 wallMaterials.forEach(m=>{m.opacity=state.opacity;m.visible=state.opacity>0;m.depthWrite=state.opacity>=.99;});
 objects.filter(m=>m.userData.isWall).forEach(m=>{m.material=m.userData.floor?photoUpperWall:photoLowerWall;m.children.forEach(c=>{if(c.isLineSegments)c.material.opacity=right&&state.opacity>.95?.12:.48;});});
 mats.door.color.set(0xe9e7df);frameMat.color.set(0xe4e3db);frameMat.metalness=.15;
 mats.glass.color.set(0x869b9f);railMat.color.set(0x353237);skinMat.color.set(0x484348);
 photoOnly.forEach(m=>m.visible=!m.userData.photoCover||state.roofskin);
 // Roof geometry and trim already terminate at the BL-WI window midpoint.
 canopyGroups[1].visible=false;
 carportAreaSelection.visible=state.carportArea;
 roofSkins.forEach(m=>m.visible=state.roofskin);
 roofFrames.forEach(m=>m.visible=!state.roofskin);
 objects.filter(m=>m.userData.innerOnly).forEach(m=>m.visible=!u.end);
 objects.filter(m=>m.userData.endOnly).forEach(m=>m.visible=u.end);
 objects.filter(m=>['guest-side','master-side'].includes(m.userData.openingId)).forEach(m=>m.visible=u.end);
 labelGroups.forEach((g,f)=>{g.position.y=f*state.explode;g.visible=state.labels&&state.layers.structure&&(state.level==='all'||f===Number(state.level));});
 objects.filter(m=>m.userData.system==='electrical'&&m.userData.circuitId).forEach(m=>m.visible=state.circuits[m.userData.circuitId]);
 objects.filter(m=>m.userData.roofVariant).forEach(m=>{const d=m.userData;m.visible=d.roofVariant===(u.end?'end':'inner')&&(d.skin||d.photoCover?state.roofskin:d.roofVariantFrame?!state.roofskin:true)&&(!d.circuitId||state.circuits[d.circuitId]);});
 document.querySelector('#electrical-circuits').hidden=state.scope==='block'||!state.layers.electrical;
 const visibleCircuits=electricalCircuits.filter(c=>state.circuits[c.id]);
 document.querySelectorAll('[data-circuit]').forEach(el=>el.checked=state.circuits[el.dataset.circuit]);
 document.querySelectorAll('[data-circuit-solo]').forEach(el=>{const pressed=visibleCircuits.length===1&&visibleCircuits[0].id===el.dataset.circuitSolo;el.classList.toggle('active',pressed);el.setAttribute('aria-pressed',String(pressed));});
 document.querySelector('#circuit-count').textContent=visibleCircuits.length+' / '+electricalCircuits.length+' circuits';
 const active=defs.filter(d=>state.layers[d[0]]);const solo=active.length===1?active[0][0]:null;
 document.querySelectorAll('[data-layer]').forEach(el=>el.checked=state.layers[el.dataset.layer]);document.querySelectorAll('[data-solo]').forEach(el=>{el.classList.toggle('active',el.dataset.solo===solo);el.setAttribute('aria-pressed',String(el.dataset.solo===solo));});
 document.querySelectorAll('[data-level]').forEach(el=>{el.classList.toggle('active',el.dataset.level===state.level);el.setAttribute('aria-pressed',String(el.dataset.level===state.level));});
 document.querySelector('#view-title').textContent=state.scope==='block'?'Eight-unit block':solo?`${active[0][1]} only`:active.length?'Combined systems':'No systems selected';
 document.querySelector('#view-subtitle').textContent=state.scope==='block'?`Select a unit · ${({iso:'Perspective',front:'Front elevation',top:'Top view',side:'Side elevation'})[state.view]}`:`Unit ${u.id} · ${({iso:'Perspective',front:'Front elevation',top:'Top view',side:'Side elevation'})[state.view]} · ${state.level==='all'?'All floors':state.level==='0'?'Ground floor':'Second floor'}`;
 document.querySelector('#status').textContent=state.scope==='block'?`${state.showRearUnits?8:4} selectable units${state.showRearUnits?'':' · Rear units hidden'} · metres`:`Unit ${u.id} · ${active.length} / ${defs.length} systems visible · metres`;
 document.querySelector('#empty').hidden=state.scope==='block'||active.length>0;
 document.querySelector('#opacity').value=state.opacity*100;document.querySelector('#opacity-out').textContent=Math.round(state.opacity*100)+'%';
 document.querySelector('#explode').value=state.explode;document.querySelector('#explode-out').textContent=state.explode.toFixed(1)+' m';
 document.querySelector('#roofskin').checked=state.roofskin;document.querySelector('#labels').checked=state.labels;document.querySelector('#carport-area').checked=state.carportArea;document.querySelector('#wall-labels').checked=state.wallLabels;
 if(selected&&!isVisible(selected))clearSelection();
 if(selected){scene.updateMatrixWorld(true);updateMeasurements();}
 renderPlan();
}
function showAll(){for(const c of electricalCircuits)state.circuits[c.id]=true;for(const key in state.layers)state.layers[key]=true;clearSelection();sync();}
function isolate(id){for(const key in state.layers)state.layers[key]=key===id;clearSelection();sync();}
for(const[id,name,color,icon]of defs){const row=document.createElement('div');row.className='layer';row.style.setProperty('--color',color);row.innerHTML=`<span class="layer-icon" aria-hidden="true">${icon}</span><div><span class="layer-name">${name}</span></div><button class="solo" data-solo="${id}" aria-label="Show only ${name}">Only</button><label class="switch"><input type="checkbox" checked data-layer="${id}" aria-label="Show ${name}"><span></span></label>`;document.querySelector('#layers').appendChild(row);row.querySelector('input').onchange=e=>{state.layers[id]=e.target.checked;sync();};row.querySelector('button').onclick=()=>isolate(id);}
for(const c of electricalCircuits){
 const row=document.createElement('div');row.className='circuit-row';row.style.setProperty('--circuit-color',c.color);
 const label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.checked=true;check.dataset.circuit=c.id;check.setAttribute('aria-label','Show '+c.name+' circuit');check.onchange=e=>{state.circuits[c.id]=e.target.checked;sync();};
 const text=document.createElement('span'),name=document.createElement('b'),rating=document.createElement('small');name.textContent=c.name;rating.textContent=c.amps+' A · '+(c.routing==='floor-chase'?(c.dedicated?'Floor channel · home run':'Floor channels · finish covered'):c.dedicated?'Dedicated home run':c.routing==='ceiling'?'Ceiling runs':'Shared underfloor');text.append(name,rating);label.append(check,text);
 const solo=document.createElement('button');solo.className='solo';solo.textContent='Only';solo.dataset.circuitSolo=c.id;solo.setAttribute('aria-label','Show only '+c.name+' circuit');solo.onclick=()=>isolateCircuit(c.id);row.append(label,solo);document.querySelector('#circuit-rows').append(row);
}
document.querySelector('#circuits-all').onclick=showAllCircuits;
document.querySelector('#show-all').onclick=showAll;document.querySelector('#empty-show').onclick=showAll;
for(const key of ['opacity','explode'])document.querySelector('#'+key).oninput=e=>{const next=Number(e.target.value)/(key==='opacity'?100:1);if(key==='explode'){const offset=camera.position.clone().sub(controls.target).multiplyScalar((1+next*.14)/(1+state.explode*.14));controls.target.y+=next-state.explode;camera.position.copy(controls.target).add(offset);controls.update();}state[key]=next;sync();};
document.querySelector('#wall-labels').onchange=e=>{state.wallLabels=e.target.checked;sync();};
document.querySelector('#wall-code-legend').onclick=()=>document.querySelector('#wall-code-dialog').showModal();
document.querySelector('#close-wall-codes').onclick=()=>document.querySelector('#wall-code-dialog').close();
document.querySelector('#carport-area').onchange=e=>{state.carportArea=e.target.checked;if(state.carportArea){state.layers.structure=true;if(state.level==='1')state.level='0';}sync();if(state.carportArea)selectObject(carportAreaSelection);};
for(const key of ['roofskin','labels'])document.querySelector('#'+key).onchange=e=>{state[key]=e.target.checked;clearSelection();sync();};
document.querySelectorAll('[data-level]').forEach(el=>el.onclick=()=>{state.level=el.dataset.level;clearSelection();sync();});
function setView(view){
 const explode=state.scope==='block'?0:state.explode;
 state.view=view;camera=view==='top'?planCamera:perspectiveCamera;controls.object=camera;if(window.townhouse)window.townhouse.camera=camera;resize();const height=state.scope==='block'?3:state.level==='0'?1.7:state.level==='1'?4.5+explode:3.0+explode;
 const u=activeUnit(),bounds=state.scope==='block'?blockViewBounds():{west:u.west,east:u.east,north:u.north,south:u.south,width:u.width,depth:u.depth};
 const center=[(bounds.west+bounds.east)/2,height,(bounds.north+bounds.south)/2];controls.target.set(...center);
 const portrait=viewport.clientWidth/viewport.clientHeight<.9;
 const span=Math.max(bounds.width,bounds.depth,10),distance=(portrait?1.4:1)*(1+explode*.1)*(state.scope==='block'?span/12:Math.max(1,span/12));
 const positions={iso:[17,11+explode,23],front:[0,0,29],top:[0,Math.max(28,span*2)+explode,.01],side:[30,0,0]};
 const offset=positions[view].map(v=>v*distance);
 if(state.scope==='unit'&&view!=='top'){
  const v=new THREE.Vector3(...offset);v.applyAxisAngle(new THREE.Vector3(0,1,0),u.rotation);if(u.end&&(view==='side'||view==='iso'))v.x=Math.abs(v.x)*(u.openSide==='west'?-1:1);offset.splice(0,3,v.x,v.y,v.z);
 }
 camera.position.set(...center.map((v,i)=>v+offset[i]));camera.up.set(0,1,0);if(view==='top'){camera.zoom=1;camera.updateProjectionMatrix();}controls.update();
 document.querySelectorAll('[data-view]').forEach(el=>{el.classList.toggle('active',el.dataset.view===view);el.setAttribute('aria-pressed',String(el.dataset.view===view));});sync();
}
document.querySelectorAll('[data-view]').forEach(el=>el.onclick=()=>setView(el.dataset.view));
document.querySelector('#reset').onclick=()=>{Object.assign(state,{level:'all',opacity:.3,explode:0,roofskin:true,labels:true,wallLabels:true,carportArea:false,view:'iso',plan:false});showAll();setView('iso');};
viewport.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','Home'].includes(e.key))return;e.preventDefault();if(e.key==='Home'){setView('iso');return;}if(camera.isOrthographicCamera&&['+','=','-'].includes(e.key)){camera.zoom=Math.max(.35,Math.min(8,camera.zoom*(e.key==='-'?.9:1/.9)));camera.updateProjectionMatrix();return;}const offset=camera.position.clone().sub(controls.target);const spherical=new THREE.Spherical().setFromVector3(offset);if(e.key==='ArrowLeft')spherical.theta-=.12;if(e.key==='ArrowRight')spherical.theta+=.12;if(e.key==='ArrowUp')spherical.phi=Math.max(.02,spherical.phi-.1);if(e.key==='ArrowDown')spherical.phi=Math.min(Math.PI*.9,spherical.phi+.1);if(e.key==='+'||e.key==='=')spherical.radius=Math.max(4,spherical.radius*.9);if(e.key==='-')spherical.radius=Math.min(1500,spherical.radius*1.1);camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical));controls.update();});
const raycaster=new THREE.Raycaster();let press=null;
function isVisible(obj){let p=obj;while(p){if(!p.visible)return false;p=p.parent;}return obj.material.visible!==false;}
renderer.domElement.addEventListener('pointerdown',e=>{press={x:e.clientX,y:e.clientY};});
function wallMeasurementFace(mesh,hit){
 const d=mesh.userData;if(d.isWallLabel)return d.face;
 if(!d.isWall)return null;
 const wall=walls.find(w=>w.id===d.wallId);if(!wall)return null;
 const frame=systems.structure[wall.floor],point=frame.worldToLocal((hit?.point??mesh.getWorldPosition(new THREE.Vector3())).clone());
 const length=Math.hypot(wall.b[0]-wall.a[0],wall.b[1]-wall.a[1]);
 const along=((point.x-wall.a[0])*(wall.b[0]-wall.a[0])+(point.z-wall.a[1])*(wall.b[1]-wall.a[1]))/length;
 const normal=hit?.face?.normal.clone().transformDirection(mesh.matrixWorld).transformDirection(root.matrixWorld.clone().invert());
 const axis=wall.a[0]===wall.b[0]?'x':'z',side=normal&&Math.abs(normal[axis])>.1?Math.sign(normal[axis]):null;
 const candidates=wallSurfaceDefinitions.filter(f=>f.wallId===wall.id&&along>=f.start-.001&&along<=f.end+.001&&(!side||f.normal===side));
 return candidates.find(f=>!!f.extension===(wall.floor===1&&point.y>secondFloorCeiling))??candidates[0];
}
function wallDimensions(face){
 const wall=walls.find(w=>w.id===face.wallId),length=Math.hypot(wall.b[0]-wall.a[0],wall.b[1]-wall.a[1]);
 const bottom=face.extension?secondFloorCeiling:wall.bottom;
 const topAt=along=>{
  const patches=wallPieces.filter(p=>p.wall===wall.id&&(!p.innerOnly||!activeUnit().end)&&(!p.endOnly||activeUnit().end)&&along>p.a-1e-6&&along<p.b+1e-6);
  let top=Math.max(wall.top,...patches.map(p=>p.joinedRoofClosure?innerRoofUndersideAt(wall.a[1]+(wall.b[1]-wall.a[1])*along/length):p.high));
  const slopeWall=objects.find(m=>m.userData.wallId===wall.id&&m.userData.slopedWallExtension&&m.visible);
  if(slopeWall&&!slopeWall.userData.joinedRoofClosure)top=Math.max(top,THREE.MathUtils.lerp(slopeWall.userData.topAtStart,slopeWall.userData.topAtEnd,along/length));
  return wall.floor===1&&!face.extension?Math.min(top,secondFloorCeiling):top;
 };
 const h0=topAt(face.start+.0001),h1=topAt(face.end-.0001);
 const point=(along,y)=>[wall.a[0]+(wall.b[0]-wall.a[0])*along/length+(face.axis==='x'?face.normal*.08:0),y,wall.a[1]+(wall.b[1]-wall.a[1])*along/length+(face.axis==='z'?face.normal*.08:0)];
 const tangent=[(wall.b[0]-wall.a[0])/length,0,(wall.b[1]-wall.a[1])/length];
 const specs=[{a:point(face.start,bottom),b:point(face.end,bottom),offset:[0,-.24,0],label:'Length'},
  {a:point(face.end,bottom),b:point(face.end,h1),offset:tangent.map(v=>v*.24),label:Math.abs(h0-h1)>.005?'End height':'Height'}];
 if(Math.abs(h0-h1)>.005)specs.push({a:point(face.start,bottom),b:point(face.start,h0),offset:tangent.map(v=>v*-.24),label:'Start height'});
 // The high front parapet travels with the roof group in separated-floor view.
 return transformDimensions(specs,face.extension&&face.wallId==='u-front'?systems.roof[2]:systems.structure[wall.floor]);
}
function floorSurfaceBounds(mesh){
 mesh.geometry.computeBoundingBox();mesh.updateMatrix();const b=mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrix);
 return {floor:mesh.userData.floor,x0:b.min.x,x1:b.max.x,z0:b.min.z,z1:b.max.z,y:b.max.y};
}
function floorRoom(mesh,hit){
 if(mesh.userData.carportSelectionArea)return {code:'CP',name:'Carport including inner footing',heading:mesh.userData.name,detail:mesh.userData.detail,dimensionPrefix:'Overall ',selectionArea:true,floor:0,regions:[carportAreaBounds],y:mesh.position.y};
 if(mesh.userData.measurementKind!=='floor')return null;
 const frame=systems.structure[mesh.userData.floor],point=frame.worldToLocal((hit?.point??mesh.getWorldPosition(new THREE.Vector3())).clone());
 const surfaces=objects.filter(m=>m.userData.measurementKind==='floor').map(floorSurfaceBounds);
 const rooms=buildRoomFloorPlans(walls,wallBaseSurfaces,surfaces),room=roomAtPoint(rooms,mesh.userData.floor,point.x,point.z);
 const surface=floorSurfaceBounds(mesh);
 // The service pad is an exterior space without room-coded enclosure walls.
 if(!room&&mesh.userData.serviceFloor)return {code:'SA',name:'Service area',floor:0,regions:[surface],y:surface.y};
 return room?{...room,name:roomNames[room.code],y:surface.y}:null;
}
function roomDimensions(room){
 const x0=Math.min(...room.regions.map(r=>r.x0)),x1=Math.max(...room.regions.map(r=>r.x1)),z0=Math.min(...room.regions.map(r=>r.z0)),z1=Math.max(...room.regions.map(r=>r.z1));
 const prefix=room.dimensionPrefix??(room.regions.length>1?'Overall clear ':'Clear ');
 return transformDimensions([{a:[x0,room.y,z0],b:[x1,room.y,z0],offset:[0,0,-.24],label:prefix+'width'},
  {a:[x1,room.y,z0],b:[x1,room.y,z1],offset:[.24,0,0],label:prefix+'depth'}],systems.structure[room.floor]);
}
function innerSurfaceRegions(mesh,target){
 const d=mesh.userData;
 if(target.room)return target.room.regions.map((r,i)=>regionProjection(r,(x,z)=>[x,target.room.y+.015,z],systems.structure[target.room.floor],`${target.room.code} · ${i+1}`));
 if(target.face&&!target.face.extension){
  const face=target.face,wall=walls.find(w=>w.id===face.wallId),length=Math.hypot(wall.b[0]-wall.a[0],wall.b[1]-wall.a[1]);
  const point=(along,y)=>[wall.a[0]+(wall.b[0]-wall.a[0])*along/length+(face.axis==='x'?face.normal*.08:0),y,wall.a[1]+(wall.b[1]-wall.a[1])*along/length+(face.axis==='z'?face.normal*.08:0)];
  return reviewedOpenings.filter(o=>(activeUnit().end||!['guest-side','master-side'].includes(o.id))&&o.wall===wall.id&&o.at-o.w/2>=face.start-.001&&o.at+o.w/2<=face.end+.001).map(o=>regionProjection({x0:o.at-o.w/2,x1:o.at+o.w/2,z0:o.base+o.sill,z1:o.base+o.sill+o.h},point,systems.structure[wall.floor],({W1a:'W1b',W9b:'W9a'})[o.code]??o.code,'Height'));
 }
 if(d.continuousRoof){
  const side=walls.find(w=>w.id==='u-side'),bathSide=walls.find(w=>w.id==='u-bath-side'),party=walls.find(w=>w.id==='u-party'),front=walls.find(w=>w.id==='u-front'),rear=walls.find(w=>w.id==='u-rear');
  // Bound the inner footprint at exterior wall lines, excluding eave overhangs.
  const interior=[{x0:side.a[0],x1:bathSide.a[0],z0:side.a[1],z1:front.a[1]},{x0:bathSide.a[0],x1:party.a[0],z0:rear.a[1],z1:front.a[1]}];
  const raisedWalls=wallPieces.filter(p=>(!p.innerOnly||!activeUnit().end)&&(!p.endOnly||activeUnit().end)&&p.high>secondFloorCeiling+.25).map(p=>wallFootprint(walls.find(w=>w.id===p.wall),p.a,p.b));
  const rects=rectangularRegions(d.roofRegions,raisedWalls,interior);
  const point=(x,z)=>[x,d.roofHeightOrigin[1]+(z-d.roofHeightOrigin[0])*d.roofSlope+.025,z];
  return rects.map((r,i)=>regionProjection(r,point,mesh,`R${i+1}`,'Slope length'));
 }

 return [];
}
function updateMeasurements(){
 if(!selected||!measurementTarget){measurements.clear();return;}
 const t=measurementTarget;let dimensions=[];
 if(t.room)dimensions=roomDimensions(t.room);
 else if(t.face)dimensions=wallDimensions(t.face);
 else if(t.opening){
  const o=t.opening,y=o.base+o.sill,point=(along,up)=>o.axis==='x'?[o.x+along,y+up,o.z+.09]:[o.x+.09,y+up,o.z+along];
  const specs=[{a:point(-o.w/2,0),b:point(o.w/2,0),offset:[0,-.24,0],label:'Width'},
   {a:point(o.w/2,0),b:point(o.w/2,o.h),offset:o.axis==='x'?[.24,0,0]:[0,0,.24],label:'Height'}];
  if(o.system==='windows')specs.push({a:point(-o.w/2,-o.sill),b:point(-o.w/2,0),offset:o.axis==='x'?[-.28,0,0]:[0,0,-.28],label:'Sill height'});
  dimensions=transformDimensions(specs,systems[o.system][o.floor]);
 }else if(selected.userData.measurementSpecs)dimensions=transformDimensions(selected.userData.measurementSpecs,selected);
 else if(t.kind&&t.kind!=='floor')dimensions=surfaceDimensions(selected,t.kind);
 const regions=innerSurfaceRegions(selected,t);let outline;
 if(t.room)outline=regionBoundary(regions);
 else if((t.face||t.opening)&&dimensions.length>=2){
  const [span,height,startHeight]=dimensions;
  const topStart=t.face&&startHeight?startHeight.b:span.a.clone().add(height.b.clone().sub(height.a));
  outline=loopSegments([span.a,span.b,height.b,topStart]);
 }else{
  const edges=new THREE.EdgesGeometry(selected.geometry),vertices=edges.attributes.position;outline=[];
  selected.updateWorldMatrix(true,false);
  for(let i=0;i<vertices.count;i+=2)outline.push([new THREE.Vector3().fromBufferAttribute(vertices,i).applyMatrix4(selected.matrixWorld),new THREE.Vector3().fromBufferAttribute(vertices,i+1).applyMatrix4(selected.matrixWorld)]);
  edges.dispose();
 }
 // Measurements follow the visible party-wall crop on inner lots.
 const u=activeUnit();if(!u.end){
  const crop=p=>{const point=p.clone();point.x=THREE.MathUtils.clamp(point.x,u.west-.075,u.east+.075);return point;};
  dimensions=dimensions.map(d=>({...d,a:crop(d.a),b:crop(d.b)}));outline=outline.map(([a,b])=>[crop(a),crop(b)]);
 }
 measurements.show(dimensions,regions,outline);
}
function selectObject(mesh,hit){
 clearSelection();selected=mesh;const d=selected.userData;
 measurementTarget={room:floorRoom(mesh,hit),face:wallMeasurementFace(mesh,hit),opening:reviewedOpenings.find(o=>o.id===d.openingId),kind:d.measurementKind??(d.isWall||d.name==='High front parapet'?'wall':d.system==='roof'&&/soffit/i.test(d.name)?'roof':null)};
 updateMeasurements();
 const card=document.querySelector('#selection');card.dataset.selected='true';card.innerHTML='';
 const eyebrow=document.createElement('span');eyebrow.className='eyebrow';eyebrow.textContent=defs.find(a=>a[0]===d.system)[1].toUpperCase()+' · '+(d.floor===2?'ROOF':d.floor?'SECOND FLOOR':'GROUND FLOOR');
 const heading=document.createElement('h3');heading.textContent=measurementTarget.room?(measurementTarget.room.heading??`${measurementTarget.room.code} · ${measurementTarget.room.name} floor`):state.end==='right'?d.name.replace(/\b(Left|Right|W1a|W9b)\b/g,token=>({Left:'Right',Right:'Left',W1a:'W1b',W9b:'W9a'})[token]):d.name;
 const para=document.createElement('p');para.textContent=measurementTarget.room?.detail??(measurementTarget.room?'Clear floor dimensions follow this room’s wall faces. Open-plan divisions follow the room wall codes. Irregular room areas are split into rectangles; dimensions remain approximate.':d.detail);
 if(!d.isWallLabel){const u=activeUnit(),orient=text=>text.replace(/\b[A-Z0-9]+-[NSEW]\d*[IE](?:-X)?\b/g,code=>orientWallCode(code,u.row===1,u.mirrored));heading.textContent=orient(heading.textContent);para.textContent=orient(para.textContent);}
 card.append(eyebrow,heading);
 const dims=measurements.group.userData.dimensions;
 if(dims.length){const summary=document.createElement('p');summary.className='measurement-summary';summary.textContent=dims.map(s=>`${s.label}: ${measurements.format(s.a.distanceTo(s.b))}`).join(' · ');const note=document.createElement('small');note.textContent=measurementTarget.opening?.system==='windows'?(Math.abs(Math.abs(activeUnit().scaleX)-1)>.0001?'Scaled template dimensions · sill above local floor':'Opening dimensions · sill above local floor'):measurementTarget.opening?'Opening dimensions':measurementTarget.room?.selectionArea?'Includes inner footing · wall thickness excluded':measurementTarget.room?'Room dimensions · wall thickness excluded':'Model dimensions · approximate';summary.append(document.createElement('br'),note);card.append(summary);}
 const regions=measurements.group.userData.regions;
 if(regions.length){
  const section=document.createElement('div');section.className='region-summary';
  const title=document.createElement('b');title.textContent=measurementTarget.room?.selectionArea?'Combined plan area':measurementTarget.room?'Room rectangles':measurementTarget.face?'Openings':'Clear inner rectangles';section.append(title);
  for(const r of regions){const row=document.createElement('div');row.textContent=`${r.id} · ${measurements.format(r.width)} × ${measurements.format(r.depth)}`+(measurementTarget.room?.selectionArea?` · ${(r.width*r.depth).toFixed(2)} m²`:'');section.append(row);}
  const note=document.createElement('small');note.textContent=measurementTarget.face?'Width × height':d.continuousRoof?'Width × slope length · walls and overhangs excluded':'Width × depth · wall footprints excluded';section.append(note);card.append(section);
 }
 card.append(para);

}
renderer.domElement.addEventListener('pointerup',e=>{
 if(!press||e.button!==0||Math.hypot(e.clientX-press.x,e.clientY-press.y)>5)return;
 const rect=renderer.domElement.getBoundingClientRect();raycaster.setFromCamera(new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1),camera);
 if(state.scope==='block'){
  const hit=raycaster.intersectObjects([...blockView.pickables,...blockView.lotSurfaces],false).find(h=>isVisible(h.object)&&(h.object.material.clippingPlanes??[]).every(p=>p.distanceToPoint(h.point)>=0));
  if(hit)focusUnit(hit.object.userData.unitId);return;
 }
 const hits=raycaster.intersectObjects(objects,false).filter(h=>isVisible(h.object)&&(activeUnit().end||h.point.x>=activeUnit().west-.075&&h.point.x<=activeUnit().east+.075));
 // Translucent walls remain a fallback so openings and fittings are reachable.
 const hit=(state.opacity<=.7?hits.find(h=>!h.object.userData.isWall):hits[0])??hits[0];
 if(hit)selectObject(hit.object,hit);else clearSelection();
});
viewport.addEventListener('keydown',e=>{if(e.key==='Escape')clearSelection();});

// 2D floor plan: canonical walls, openings and room regions drawn north up in
// the active unit's orientation. Overall dimensions include wall thickness
// (centrelines and outer faces); clear dimensions run between wall faces.
const planView=document.querySelector('#plan-view'),planSvg=document.querySelector('#plan-svg'),planToggle=document.querySelector('#plan-toggle');
const planCamera2d={box:null,fit:null,key:''};
function planRooms(){
 const surfaces=objects.filter(m=>m.userData.measurementKind==='floor').map(floorSurfaceBounds);
 const rooms=buildRoomFloorPlans(walls,wallBaseSurfaces,surfaces).map(r=>({...r,name:roomNames[r.code]}));
 rooms.push({code:'SA',name:'Service area',floor:0,regions:[floorSurfaceBounds(serviceFloorMesh)]});
 return rooms;
}
function renderPlan(){
 const open=state.plan&&state.scope==='unit';
 planView.hidden=!open;planToggle.classList.toggle('active',open);planToggle.setAttribute('aria-pressed',String(open));planToggle.disabled=state.scope!=='unit';
 if(!open)return;
 const u=activeUnit();root.updateMatrixWorld(true);
 const project=([x,z])=>{const p=root.localToWorld(new THREE.Vector3(x,0,z));return [p.x,p.z];};
 const openings=reviewedOpenings.filter(o=>u.end||!['guest-side','master-side'].includes(o.id)),rooms=planRooms();
 const floors=state.level==='all'?[0,1]:[Number(state.level)];
 const {svg,viewBox}=renderFloorPlans(floors.map(f=>({title:f?'Second floor':'Ground floor',plan:buildFloorPlan({walls,faces:wallBaseSurfaces,openings,rooms,floor:f})})),project,state.planMode);
 planSvg.innerHTML=svg;
 const key=`${u.id}:${state.level}:${u.width}:${u.depth}`;
 if(planCamera2d.key!==key){planCamera2d.key=key;planCamera2d.fit=viewBox;planCamera2d.box=null;}
 planCamera2d.fit=viewBox;applyPlanBox();
 document.querySelectorAll('[data-plan-mode]').forEach(el=>{const on=el.dataset.planMode===state.planMode;el.classList.toggle('active',on);el.setAttribute('aria-pressed',String(on));});
 document.querySelector('#view-title').textContent='2D floor plan';
 document.querySelector('#view-subtitle').textContent=`Unit ${u.id} · 2D plan · north up · ${({overall:'Including walls',clear:'Clear of walls',both:'Including and clear of walls'})[state.planMode]}`;
 if(planCamera2d.room)selectPlanRoom(planCamera2d.room,planCamera2d.floor);
}
function applyPlanBox(){
 const rect=planSvg.getBoundingClientRect(),[x,y,w,h]=planCamera2d.box??planCamera2d.fit;
 if(!rect.width||!rect.height){planSvg.setAttribute('viewBox',[x,y,w,h].join(' '));return;}
 // Keep 1:1 metres on both axes; pad the short side of the fitted box.
 const aspect=rect.width/rect.height,fw=Math.max(w,h*aspect),fh=fw/aspect;
 planCamera2d.box=[x+(w-fw)/2,y+(h-fh)/2,fw,fh];planSvg.setAttribute('viewBox',planCamera2d.box.join(' '));
}
function planPoint(e){const rect=planSvg.getBoundingClientRect(),[x,y,w,h]=planCamera2d.box;return [x+(e.clientX-rect.left)/rect.width*w,y+(e.clientY-rect.top)/rect.height*h];}
function zoomPlan(factor,at){
 const [x,y,w,h]=planCamera2d.box,[px,py]=at??[x+w/2,y+h/2],fit=planCamera2d.fit,nw=Math.min(Math.max(w*factor,2),Math.max(fit[2],fit[3])*4);
 const k=nw/w;planCamera2d.box=[px-(px-x)*k,py-(py-y)*k,w*k,h*k];planSvg.setAttribute('viewBox',planCamera2d.box.join(' '));
}
planSvg.addEventListener('wheel',e=>{e.preventDefault();zoomPlan(Math.exp(e.deltaY*.0015),planPoint(e));},{passive:false});
let planDrag=null;
planSvg.addEventListener('pointerdown',e=>{if(e.button!==0)return;planDrag={x:e.clientX,y:e.clientY,box:[...planCamera2d.box],moved:false};planSvg.setPointerCapture(e.pointerId);});
planSvg.addEventListener('pointermove',e=>{
 if(!planDrag)return;const rect=planSvg.getBoundingClientRect(),dx=e.clientX-planDrag.x,dy=e.clientY-planDrag.y;
 if(Math.hypot(dx,dy)>4)planDrag.moved=true;if(!planDrag.moved)return;
 const [x,y,w,h]=planDrag.box;planCamera2d.box=[x-dx/rect.width*w,y-dy/rect.height*h,w,h];planSvg.setAttribute('viewBox',planCamera2d.box.join(' '));planSvg.classList.add('dragging');
});
planSvg.addEventListener('pointerup',e=>{
 const drag=planDrag;planDrag=null;planSvg.classList.remove('dragging');if(!drag||drag.moved)return;
 const room=e.target.closest?.('[data-room]');selectPlanRoom(room?.dataset.room??null,room?.closest('[data-floor]')?.dataset.floor);
});
planSvg.addEventListener('keydown',e=>{const room=e.target.closest?.('[data-room]');if(room&&(e.key==='Enter'||e.key===' ')){e.preventDefault();selectPlanRoom(room.dataset.room,room.closest('[data-floor]').dataset.floor);}if(e.key==='Escape')selectPlanRoom(null);});
function selectPlanRoom(code,floor){
 planSvg.querySelectorAll('.plan-room.selected').forEach(el=>el.classList.remove('selected'));
 planCamera2d.room=code;planCamera2d.floor=floor;const card=document.querySelector('#selection');
 if(!code){card.dataset.selected='false';card.innerHTML=initialInfo;return;}
 planSvg.querySelectorAll(`[data-room="${code}"]`).forEach(el=>el.classList.add('selected'));
 const u=activeUnit();root.updateMatrixWorld(true);
 const project=([x,z])=>{const p=root.localToWorld(new THREE.Vector3(x,0,z));return [p.x,p.z];};
 const room=planRooms().find(r=>r.code===code&&String(r.floor)===String(floor??r.floor));if(!room)return;
 const span=r=>{const a=project([r.x0,r.z0]),b=project([r.x1,r.z0]),c=project([r.x1,r.z1]);return [Math.hypot(b[0]-a[0],b[1]-a[1]),Math.hypot(c[0]-b[0],c[1]-b[1])];};
 const clear={x0:Math.min(...room.regions.map(g=>g.x0)),x1:Math.max(...room.regions.map(g=>g.x1)),z0:Math.min(...room.regions.map(g=>g.z0)),z1:Math.max(...room.regions.map(g=>g.z1))};
 const [cw,cd]=span(clear),[ow,od]=span(room.bounds??clear),area=room.regions.reduce((s,g)=>{const [w,d]=span(g);return s+w*d;},0);
 card.dataset.selected='true';
 card.innerHTML=`<span class="eyebrow">FLOOR PLAN · ${room.floor?'SECOND':'GROUND'} FLOOR</span><h3></h3><p class="measurement-summary">Clear ${formatMetres(cw)} × ${formatMetres(cd)} m<br>Including walls ${formatMetres(ow)} × ${formatMetres(od)} m<br><small>Clear area ${area.toFixed(2)} m² · ${room.regions.length} region${room.regions.length>1?'s':''}</small></p><p>Clear dimensions run between wall faces and exclude wall footprints. Including-walls dimensions run to wall centrelines, so each bounding wall adds half its 150 mm thickness. Open-plan edges use the room's span divisions.</p><div class="card-footer">Unit ${u.id} · select another room or press Escape</div>`;
 card.querySelector('h3').textContent=`${room.code} · ${room.name}`;
}
planToggle.onclick=()=>{state.plan=!state.plan;planCamera2d.room=null;clearSelection();sync();if(state.plan){planCamera2d.box=null;applyPlanBox();planSvg.focus();}};
document.querySelectorAll('[data-plan-mode]').forEach(el=>el.onclick=()=>{state.planMode=el.dataset.planMode;sync();});
document.querySelector('#plan-fit').onclick=()=>{planCamera2d.box=null;applyPlanBox();};
document.querySelector('#plan-zoom-in').onclick=()=>zoomPlan(1/1.3);
document.querySelector('#plan-zoom-out').onclick=()=>zoomPlan(1.3);
document.querySelectorAll('[data-view]').forEach(el=>el.addEventListener('click',()=>{if(state.plan){state.plan=false;sync();}}));
new ResizeObserver(()=>{if(state.plan&&planCamera2d.fit){planCamera2d.box=null;applyPlanBox();}}).observe(planSvg);

const modelContext=document.modelContext;
if(modelContext?.registerTool){const lifecycle=new AbortController();const tool={name:'configure_building_view',title:'Configure the building view',description:'Show chosen building systems and select a floor in the visible 3D model.',inputSchema:{type:'object',properties:{systems:{type:'array',items:{type:'string',enum:defs.map(d=>d[0])},uniqueItems:true},floor:{type:'string',enum:['all','0','1']}},required:['systems'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input){if(!input||typeof input!=='object'||Object.keys(input).some(k=>!['systems','floor'].includes(k))||!Array.isArray(input.systems)||input.systems.some(id=>!defs.some(d=>d[0]===id))||new Set(input.systems).size!==input.systems.length||(input.floor!==undefined&&!['all','0','1'].includes(input.floor)))throw new Error('Choose valid systems and floor.');for(const id in state.layers)state.layers[id]=input.systems.includes(id);if(input.floor!==undefined)state.level=input.floor;clearSelection();sync();return {visibleSystems:defs.filter(d=>state.layers[d[0]]).map(d=>d[0]),floor:state.level};}};try{Promise.resolve(modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});}
function resize(){const {width,height}=viewport.getBoundingClientRect();if(width<=0||height<=0)return;renderer.setSize(width,height,false);perspectiveCamera.aspect=width/height;perspectiveCamera.updateProjectionMatrix();const u=activeUnit(),bounds=state.scope==='block'?blockViewBounds():u;const span=Math.max(16,(bounds.depth+3),((bounds.width+3)/(width/height)));planCamera.left=-span*(width/height)/2;planCamera.right=-planCamera.left;planCamera.top=span/2;planCamera.bottom=-span/2;planCamera.updateProjectionMatrix();}new ResizeObserver(resize).observe(viewport);resize();setView('iso');sync();renderer.setAnimationLoop(()=>{controls.update();sizeSiteLabels();measurements.resize(camera,viewport.clientHeight,viewport.clientWidth);renderer.render(scene,camera);});
window.townhouse={renderPlan,planRooms,conduitSpec,ceilingPlans,kitchenSoffit,kitchenSoffitMeshes,kitchenSoffitUnderside,utilityBoxSize,embeddedMounts,electricalRecesses,panelCover,pullBoxCover,sanitaryStack,upperSanitaryX,sanitaryRoutes,upperVentPoints,masterRoofCutX,innerMainRoof,innerMainRoofOutline,innerMainRoofRegions,innerRoofUndersideAt,innerParapetHeight,balconyFirewall,balconyFirewallCoping,balconyFirewallTop,sharedSideSpan,masterFrontParapet,masterFrontParapetWall,masterFrontParapetCoping,block,lots,blockView,focusUnit,showBlock,configureLot,root,wallLabelFrame,dataLines,carportAreaSelection,carportAreaBounds,upperSoilExit,upperSoilExhaustPoints,measurements,selectObject,westRoofDrain,westRoofDrainUpperPoints,westRoofDrainLowerPoints,siteDrainagePoints,soilExit,balconyFloorDrain,balconyDrainDropPoints,floorChase,serviceInterconnect,serviceConnectionRoutes,pullBox,eastRoofDrain,eastRoofDrainUpperPoints,eastRoofDrainLowerPoints,freshWaterRoutes,rainDrainageRoutes,stairRailPoints,railEdgeOffset,soilExhaustPoints,copingHeight,state,systems,objects,renderer,camera,controls,sync,isolate,showAll,setView,reviewedOpenings,wallPieces,photoOnly,roofPlanes,balconyRoof,innerBalconyRoof,innerEastRoofDrainUpperPoints,balconyGap,canopyGroups,canopySoffits,plot,siteGroup,siteLabels,wallLabels,wallLabelGroups,wallSurfaceDefinitions,userElectrical,propertyElectrical,groundFinishedFloor,carportFooting,serviceFloor,carportDrain,terrain,stair,kitchenCounter,rearFirewall,bedroomConvenience,roofApexHeight,firewallApexHeight,westFirewallEndZ,rightRoofCut,rightRoofSpec,bathroomRoof,bathroomRoofRegions,frontParapet,southWallTop,bathSouthExtraHeight,bathSouthTop,stairwellLighting,electricalCircuits,circuitRoutes,powerOutlets,servicePanel,panel,isolateCircuit,showAllCircuits,guestRoomElectrical};
renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();document.querySelector('#error').hidden=false;});
