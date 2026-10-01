import * as THREE from './vendor/three.module.js';
import { createOutline, loopSegments } from './selection-outlines.mjs';

const vector=p=>new THREE.Vector3(...p);
const format=value=>`${value.toFixed(3).replace(/0+$/,'').replace(/\.$/,'')} m`;

// Dimensions live in world space, outside the mirrored house. Their text stays
// upright, and geometry follows the selected floor's actual transform.
export function createMeasurements(scene){
 const group=new THREE.Group();group.name='Selection measurements';scene.add(group);
 function clear(){
  group.traverse(o=>{o.geometry?.dispose();if(o.material){o.material.map?.dispose();o.material.dispose();}});
  group.clear();group.userData.dimensions=[];group.userData.regions=[];
 }
 function show(dimensions,regions=[],selectionSegments=[]){
  clear();group.userData.dimensions=dimensions;group.userData.regions=regions;
  if(selectionSegments.length)group.add(createOutline(selectionSegments));
  for(const {a,b,offset,label} of dimensions){
   const delta=b.clone().sub(a),length=delta.length();if(length<.001)continue;
   const p=a.clone().add(offset),q=b.clone().add(offset),out=offset.clone().normalize();
   const tick=delta.clone().normalize().add(out).normalize().multiplyScalar(.065);
   const points=[a,p.clone().addScaledVector(out,.07),b,q.clone().addScaledVector(out,.07),p,q,p.clone().sub(tick),p.clone().add(tick),q.clone().sub(tick),q.clone().add(tick)];
   const line=new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:0x76dfca,depthTest:false,depthWrite:false}));line.renderOrder=20;group.add(line);
   const text=`${label} ${format(length)}`,canvas=document.createElement('canvas');
   canvas.width=640;canvas.height=96;const ctx=canvas.getContext('2d');
   ctx.font='600 40px system-ui';const width=Math.min(640,Math.ceil(ctx.measureText(text).width)+36);canvas.width=width;
   ctx.fillStyle='#102d31';ctx.beginPath();ctx.roundRect(1,1,width-2,94,14);ctx.fill();ctx.strokeStyle='#76dfca';ctx.lineWidth=2;ctx.stroke();
   ctx.font='600 40px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#e8fff8';ctx.fillText(text,width/2,48);
   const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
   const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:false,depthWrite:false,transparent:true}));
   sprite.position.copy(p).add(q).multiplyScalar(.5).addScaledVector(out,.10);
   const leader=new THREE.Line(new THREE.BufferGeometry().setFromPoints([sprite.position,sprite.position]),new THREE.LineBasicMaterial({color:0x76dfca,depthTest:false,depthWrite:false,transparent:true,opacity:.8}));leader.renderOrder=20;group.add(leader);
   sprite.userData={aspect:width/96,text,anchor:sprite.position.clone(),leader};sprite.renderOrder=21;group.add(sprite);
  }
  for(const region of regions){
   const {corners,width,depth,id}=region,color=0xff00ff;
   group.add(createOutline(loopSegments(corners),{color,width:1.5,order:16}));
   const u=corners[1].clone().sub(corners[0]).normalize(),v=corners[3].clone().sub(corners[0]).normalize(),ticks=[];
   for(const corner of corners){const tick=u.clone().add(v).normalize().multiplyScalar(.045);ticks.push(corner.clone().sub(tick),corner.clone().add(tick));}
   const marks=new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(ticks),new THREE.LineBasicMaterial({color,depthTest:false,depthWrite:false}));marks.renderOrder=22;group.add(marks);
   const canvas=document.createElement('canvas');canvas.width=640;canvas.height=144;const ctx=canvas.getContext('2d');
   const text=`${format(width)} × ${format(depth)}`;ctx.font='600 40px system-ui';canvas.width=Math.ceil(Math.max(ctx.measureText(text).width,ctx.measureText(id).width))+32;
   ctx.fillStyle='#342a1c';ctx.beginPath();ctx.roundRect(1,1,canvas.width-2,142,14);ctx.fill();ctx.strokeStyle='#ffcc80';ctx.lineWidth=2;ctx.stroke();ctx.fillStyle='#ffe1b0';ctx.font='600 40px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(id,canvas.width/2,40);ctx.fillText(text,canvas.width/2,99);
   const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
   const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:false,depthWrite:false,transparent:true}));sprite.position.copy(corners.reduce((p,c)=>p.add(c),new THREE.Vector3()).multiplyScalar(.25));const leader=new THREE.Line(new THREE.BufferGeometry().setFromPoints([sprite.position,sprite.position]),new THREE.LineBasicMaterial({color,depthTest:false,depthWrite:false,transparent:true,opacity:.8}));leader.renderOrder=22;group.add(leader);
   sprite.userData={aspect:canvas.width/144,text:`${id}: ${text}`,pixelHeight:44,anchor:sprite.position.clone(),leader};sprite.renderOrder=23;group.add(sprite);
  }
 }
 function resize(camera,height,width){
  group.children.forEach(o=>o.userData.updateOutline?.(camera,width,height));
  const occupied=[],sprites=group.children.filter(o=>o.isSprite);
  for(const s of sprites){
   if(s.userData.anchor)s.position.copy(s.userData.anchor);
   const depth=-s.position.clone().applyMatrix4(camera.matrixWorldInverse).z;
   s.visible=depth>camera.near;
   if(s.userData.leader)s.userData.leader.visible=s.visible;
   if(!s.visible)continue;
   const unit=camera.isOrthographicCamera?(camera.top-camera.bottom)/(height*camera.zoom):2*depth*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))/height;
   const pixels=s.userData.pixelHeight??30,w=pixels*s.userData.aspect;
   s.scale.set(w*unit,pixels*unit,1);
   const projected=s.position.clone().project(camera),x=(projected.x+1)*width/2,y=(1-projected.y)*height/2;
   let chosen={x,y};
   if(s.userData.anchor){
    // Keep measurement values readable when surfaces or regions are small.
    // Shift colliding labels in screen space and retain a leader to the region.
    const candidates=[];
    for(let row=-5;row<=5;row++)for(let col=-3;col<=3;col++)candidates.push({x:x+col*(w+12),y:y+row*(pixels+8),cost:(col*(w+12))**2+(row*(pixels+8))**2});
    candidates.sort((a,b)=>a.cost-b.cost);
    chosen=candidates.find(p=>p.x-w/2>6&&p.x+w/2<width-6&&p.y-pixels/2>6&&p.y+pixels/2<height-6&&!occupied.some(r=>Math.abs(p.x-r.x)<(w+r.w)/2+5&&Math.abs(p.y-r.y)<(pixels+r.h)/2+5))??chosen;
    s.position.set(chosen.x/width*2-1,1-chosen.y/height*2,projected.z).unproject(camera);
    const positions=s.userData.leader.geometry.attributes.position;positions.setXYZ(0,...s.userData.anchor.toArray());positions.setXYZ(1,...s.position.toArray());positions.needsUpdate=true;s.userData.leader.geometry.computeBoundingSphere();
   }
   occupied.push({...chosen,w,h:pixels});
  }
 }

 return {group,show,clear,resize,format};
}

// Rectangular local surfaces: rotation, mirroring and floor separation are
// applied to endpoints, never to a world-axis bounding box.
export function surfaceDimensions(mesh,kind){
 mesh.geometry.computeBoundingBox();const {min,max}=mesh.geometry.boundingBox;
 let specs;
 if(kind==='floor'||kind==='roof')specs=[
  {a:[min.x,max.y,min.z],b:[max.x,max.y,min.z],offset:[0,0,-.24],label:'Width'},
  {a:[max.x,max.y,min.z],b:[max.x,max.y,max.z],offset:[.24,0,0],label:kind==='roof'?'Slope length':'Depth'}
 ];
 else specs=[
  {a:[min.x,min.y,max.z],b:[max.x,min.y,max.z],offset:[0,-.24,0],label:'Width'},
  {a:[max.x,min.y,max.z],b:[max.x,max.y,max.z],offset:[.24,0,0],label:'Height'}
 ];
 return transformDimensions(specs,mesh);
}
export function transformDimensions(specs,frame){
 frame.updateWorldMatrix(true,false);
 const origin=frame.localToWorld(new THREE.Vector3());
 return specs.map(s=>({...s,a:frame.localToWorld(vector(s.a)),b:frame.localToWorld(vector(s.b)),offset:frame.localToWorld(vector(s.offset)).sub(origin)}));
}

// Exact union/subtraction for axis-aligned plan regions. Scan horizontal bands,
// join occupied cells into runs, then merge identical runs between bands.
// Every returned rectangle is disjoint and excludes every wall footprint.
export function rectangularRegions(outline,obstacles=[],limits=outline){
 const valid=r=>r.x1-r.x0>1e-6&&r.z1-r.z0>1e-6;
 const intersects=(a,b)=>a.x0<b.x1&&a.x1>b.x0&&a.z0<b.z1&&a.z1>b.z0;
 const domain=outline.flatMap(a=>limits.map(b=>({x0:Math.max(a.x0,b.x0),x1:Math.min(a.x1,b.x1),z0:Math.max(a.z0,b.z0),z1:Math.min(a.z1,b.z1)}))).filter(valid);
 if(!domain.length)return [];
 const cuts=obstacles.filter(b=>domain.some(a=>intersects(a,b)));
 const bounds=[...domain,...cuts],xs=[...new Set(bounds.flatMap(r=>[r.x0,r.x1]))].sort((a,b)=>a-b),zs=[...new Set(bounds.flatMap(r=>[r.z0,r.z1]))].sort((a,b)=>a-b);
 const contains=(r,x,z)=>x>r.x0&&x<r.x1&&z>r.z0&&z<r.z1;
 const result=[];let active=new Map();
 for(let j=0;j<zs.length-1;j++){
  const z0=zs[j],z1=zs[j+1],z=(z0+z1)/2,runs=[];let start=null;
  for(let i=0;i<xs.length-1;i++){
   const x=(xs[i]+xs[i+1])/2,clear=domain.some(r=>contains(r,x,z))&&!cuts.some(r=>contains(r,x,z));
   if(clear&&start===null)start=xs[i];
   if(start!==null&&(!clear||i===xs.length-2)){runs.push({x0:start,x1:clear?xs[i+1]:xs[i],z0,z1});start=null;}
  }
  const next=new Map();
  for(const run of runs.filter(valid)){const key=`${run.x0}:${run.x1}`,prior=active.get(key);if(prior&&Math.abs(prior.z1-z0)<1e-6){prior.z1=z1;next.set(key,prior);}else{result.push(run);next.set(key,run);}}
  active=next;
 }
 return result;
}

export function regionProjection(rect,point,frame,id,depthLabel='Depth'){
 frame.updateWorldMatrix(true,false);
 const corners=[[rect.x0,rect.z0],[rect.x1,rect.z0],[rect.x1,rect.z1],[rect.x0,rect.z1]].map(([x,z])=>frame.localToWorld(vector(point(x,z))));
 return {id,corners,width:corners[0].distanceTo(corners[1]),depth:corners[1].distanceTo(corners[2]),depthLabel};
}
