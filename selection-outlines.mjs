import * as THREE from './vendor/three.module.js';

// Screen-space quads give reliable line widths on WebGL implementations that
// clamp native GL lines to one pixel. A dark underlay contrasts on pale slabs.
export function createOutline(segments,{color=0xff00ff,width=2,order=18}={}){
 const group=new THREE.Group();group.userData.selectionOutline=true;
 const layers=[{color:0x030911,width:width+1.5},{color,width}].map((style,i)=>{
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(segments.length*18),3));
  const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:style.color,side:THREE.DoubleSide,transparent:true,depthTest:false,depthWrite:false,fog:false}));
  mesh.frustumCulled=false;mesh.renderOrder=order+i;group.add(mesh);return {mesh,width:style.width};
 });
 group.userData.updateOutline=(camera,width,height)=>{
  const near=-camera.near*1.01;
  for(const layer of layers){
   const positions=layer.mesh.geometry.attributes.position;
   segments.forEach(([start,end],index)=>{
    const a=start.clone().applyMatrix4(camera.matrixWorldInverse),b=end.clone().applyMatrix4(camera.matrixWorldInverse);
    if(a.z>=near&&b.z>=near){for(let i=0;i<6;i++)positions.setXYZ(index*6+i,0,0,0);return;}
    if(a.z>near)a.lerp(b,(near-a.z)/(b.z-a.z));
    if(b.z>near)b.lerp(a,(near-b.z)/(a.z-b.z));
    a.applyMatrix4(camera.projectionMatrix);b.applyMatrix4(camera.projectionMatrix);
    const dx=(b.x-a.x)*width,dy=(b.y-a.y)*height,length=Math.hypot(dx,dy);
    if(length<1e-7){for(let i=0;i<6;i++)positions.setXYZ(index*6+i,0,0,0);return;}
    const ox=-dy/length*layer.width/width,oy=dx/length*layer.width/height;
    const capX=dx/length*layer.width/width,capY=dy/length*layer.width/height;
    const corners=[new THREE.Vector3(a.x-capX+ox,a.y-capY+oy,a.z),new THREE.Vector3(a.x-capX-ox,a.y-capY-oy,a.z),new THREE.Vector3(b.x+capX-ox,b.y+capY-oy,b.z),new THREE.Vector3(b.x+capX+ox,b.y+capY+oy,b.z)];
    corners.forEach(p=>p.unproject(camera));
    [0,1,2,0,2,3].forEach((corner,i)=>positions.setXYZ(index*6+i,...corners[corner].toArray()));
   });
   positions.needsUpdate=true;
  }
 };
 return group;
}

export function loopSegments(corners){return corners.map((p,i)=>[p,corners[(i+1)%corners.length]]);}

// Cancel shared rectangle edges, including partial overlaps, so a room's outer
// outline does not include its internal subdivision boundaries.
export function regionBoundary(regions){
 const edges=regions.flatMap(r=>loopSegments(r.corners)),points=edges.flat(),boundary=new Map();
 const key=p=>p.toArray().map(v=>v.toFixed(6)).join(',');
 for(const [a,b] of edges){
  const delta=b.clone().sub(a),length=delta.lengthSq();if(length<1e-12)continue;
  const cuts=[0,1];for(const p of points){const t=p.clone().sub(a).dot(delta)/length;if(t>1e-6&&t<1-1e-6&&a.clone().addScaledVector(delta,t).distanceTo(p)<1e-6)cuts.push(t);}
  const sorted=[...new Set(cuts.map(t=>Math.round(t*1e8)/1e8))].sort((x,y)=>x-y);
  for(let i=1;i<sorted.length;i++){const p=a.clone().addScaledVector(delta,sorted[i-1]),q=a.clone().addScaledVector(delta,sorted[i]),k=[key(p),key(q)].sort().join('|');if(boundary.has(k))boundary.delete(k);else boundary.set(k,[p,q]);}
 }
 return [...boundary.values()];
}
