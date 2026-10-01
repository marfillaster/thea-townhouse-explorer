import * as THREE from 'three';

// Context houses share buffers with the detailed house. Only the focused house
// needs fittings, selectable wall labels and live system controls.
export function createBlockView(scene,systems,wallMaterials=[]){
 const houses=new THREE.Group(),siteGroup=new THREE.Group(),siteLabels=new THREE.Group();
 scene.add(houses,siteGroup);siteGroup.add(siteLabels);
 const pickables=[],shells=[],lotSurfaces=[],buckets=new Map();
 // Merge the exterior context by material. Eight copies must stay inexpensive
 // while the focused unit retains its original individual selectable parts.
 for(const id of ['structure','roof','doors','windows'])for(const original of systems[id]){
  function collect(node,parentMatrix){
   node.updateMatrix();const matrix=parentMatrix.clone().multiply(node.matrix),d=node.userData;
   if(d.carportSelectionArea||d.templateHidden)return;
   if(node.isMesh){
    const sideOpening=['guest-side','master-side'].includes(d.openingId);
    const key=[node.material.uuid,id,d.floor,d.isWall?'wall':'',d.innerOnly?'inner':'',d.endOnly?'end':'',d.roofVariant||'',sideOpening?'side':''].join(':');
    if(!buckets.has(key))buckets.set(key,{source:node.material,system:id,floor:d.floor,isWall:d.isWall,innerOnly:d.innerOnly,endOnly:d.endOnly,roofVariant:d.roofVariant,sideOpening,position:[],normal:[],uv:[]});
    const bucket=buckets.get(key),geometry=node.geometry,pos=geometry.attributes.position,norm=geometry.attributes.normal,uv=geometry.attributes.uv;
    const normalMatrix=new THREE.Matrix3().getNormalMatrix(matrix),v=new THREE.Vector3();
    const count=geometry.index?.count??pos.count;
    for(let n=0;n<count;n++){
     const index=geometry.index?geometry.index.getX(n):n;
     v.fromBufferAttribute(pos,index).applyMatrix4(matrix);bucket.position.push(v.x,v.y,v.z);
     if(norm)v.fromBufferAttribute(norm,index).applyNormalMatrix(normalMatrix);else v.set(0,1,0);bucket.normal.push(v.x,v.y,v.z);
     bucket.uv.push(uv?uv.getX(index):0,uv?uv.getY(index):0);
    }
   }
   for(const child of node.children)collect(child,matrix);
  }
  collect(original,new THREE.Matrix4());
 }
 const templates=[...buckets.values()].map(bucket=>{
  const geometry=new THREE.BufferGeometry();
  for(const [attribute,size] of [['position',3],['normal',3],['uv',2]])geometry.setAttribute(attribute,new THREE.Float32BufferAttribute(bucket[attribute],size));
  geometry.computeBoundingSphere();return {...bucket,geometry};
 });
 for(let i=0;i<8;i++){
  const shell=new THREE.Group();shell.userData.unitId=i+1;houses.add(shell);shells.push(shell);
  for(const t of templates){
   const mat=t.source.clone();mat.clippingPlanes=[];
   if(t.isWall){mat.color.set(t.floor?0xe8e5d8:0xd5b660);mat.transparent=false;mat.opacity=1;mat.depthWrite=true;mat.visible=true;}
   // Wall-material parts outside the wall set (the high front parapet) render solid in their own colour.
   else if(wallMaterials.includes(t.source)){mat.transparent=false;mat.opacity=1;mat.depthWrite=true;mat.visible=true;}
   const mesh=new THREE.Mesh(t.geometry,mat);mesh.userData={unitId:i+1,system:t.system,floor:t.floor,isWall:t.isWall,innerOnly:t.innerOnly,endOnly:t.endOnly,roofVariant:t.roofVariant,sideOpening:t.sideOpening};shell.add(mesh);pickables.push(mesh);
  }
 }
 function disposeSite(){
  siteGroup.traverse(node=>{if(node.geometry&&!node.isSprite)node.geometry.dispose();if(node.material){node.material.map?.dispose();node.material.dispose();}});
  siteLabels.clear();siteGroup.clear();siteGroup.add(siteLabels);lotSurfaces.length=0;
 }
 function line(points,color=0x76dfca){
  const geometry=new THREE.BufferGeometry().setFromPoints(points.map(([x,z])=>new THREE.Vector3(x,-.04,z)));
  const mesh=new THREE.Line(geometry,new THREE.LineBasicMaterial({color}));siteGroup.add(mesh);return mesh;
 }
 function text(label,x,z,unitId){
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');ctx.font='500 42px system-ui';canvas.width=Math.ceil(ctx.measureText(label).width)+40;canvas.height=80;
  ctx.fillStyle='rgba(17,31,46,.94)';ctx.beginPath();ctx.roundRect(0,0,canvas.width,80,10);ctx.fill();ctx.font='500 42px system-ui';ctx.fillStyle='#d8e7ef';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(label,canvas.width/2,40);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:false}));sprite.position.set(x,.1,z);sprite.userData={aspect:canvas.width/80,unitId};sprite.renderOrder=5;siteLabels.add(sprite);return sprite;
 }
 function update(block,activeId,scope,showRearUnits=true){
  disposeSite();houses.visible=scope==='block';
  for(const u of block.units){
   const rowVisible=scope!=='block'||showRearUnits||u.row===0;
   const shell=shells[u.id-1];shell.visible=rowVisible;shell.position.set(u.modelX,0,u.modelZ);shell.rotation.y=u.rotation;shell.scale.x=u.scaleX;
   const sideClips=u.end?[]:[new THREE.Plane(new THREE.Vector3(1,0,0),-u.west+.075),new THREE.Plane(new THREE.Vector3(-1,0,0),u.east+.075)];
   shell.traverse(node=>{
    const d=node.userData;
    if(d.innerOnly)node.visible=!u.end;
    if(d.endOnly)node.visible=u.end;
    if(d.sideOpening)node.visible=u.end;
    if(d.roofVariant)node.visible=d.roofVariant===(u.end?'end':'inner');
    if(node.material)node.material.clippingPlanes=sideClips;
    if(d.templateHidden)node.visible=false;
   });
   const visible=scope==='block'?rowVisible:u.id===activeId;
   const plane=new THREE.Mesh(new THREE.PlaneGeometry(u.width,u.depth).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({color:u.id===activeId?0x2f6c5d:0x223e38,transparent:true,opacity:.8,side:THREE.DoubleSide}));
   plane.position.set((u.west+u.east)/2,-.065,(u.north+u.south)/2);plane.userData.unitId=u.id;plane.visible=visible;siteGroup.add(plane);lotSurfaces.push(plane);
   const boundary=line([[u.west,u.north],[u.east,u.north],[u.east,u.south],[u.west,u.south],[u.west,u.north]],u.id===activeId?0xb6ffe2:0x6b978a);boundary.visible=visible;
   if(!visible)continue;
   if(scope==='block')text(`Unit ${u.id}`,(u.west+u.east)/2,u.row===0?u.south-.8:u.north+.8,u.id);
   else{
    const sign=u.row===0?1:-1,front=u.row===0?u.south:u.north;
    text(`Unit ${u.id} · ${u.width} × ${u.depth} m`,(u.west+u.east)/2,front+sign*.65,u.id);
    text(`${u.frontClearance.toFixed(2)} m front`,(u.west+u.east)/2,sign*(u.rearSpace+7.65+u.depth)/2,u.id);
    text(u.rearAdjoining?'Rear · adjoining unit':`${u.rearSpace.toFixed(2)} m rear space`,(u.west+u.east)/2,-sign*.65,u.id);
    if(u.end)text(`${u.sideClearance.toFixed(2)} m · ${u.openSide}`,u.openSide==='west'?(u.west+u.houseWest)/2:(u.east+u.houseEast)/2,sign*3,u.id);
    else text('Both sides adjoining',(u.west+u.east)/2,sign*.6,u.id);
   }
  }
  if(scope==='block'){
   if(showRearUnits)text('NORTH · FRONT',0,block.bounds.north-1.1);
   text('SOUTH · FRONT',0,block.bounds.south+1.1);
  }
  if(scope==='block'&&activeId){siteLabels.children.forEach(label=>label.material.depthTest=true);}
  houses.updateMatrixWorld(true);
 }
 function resizeLabels(camera,height){
  if(!height)return;
  siteLabels.children.forEach(sprite=>{
   const depth=-sprite.position.clone().applyMatrix4(camera.matrixWorldInverse).z;
   const unit=camera.isOrthographicCamera?(camera.top-camera.bottom)/(height*camera.zoom):2*Math.max(.1,depth)*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))/height;
   const size=22*unit;sprite.scale.set(size*sprite.userData.aspect,size,1);
  });
 }
 return {houses,shells,siteGroup,siteLabels,lotSurfaces,pickables,update,resizeLabels};
}
