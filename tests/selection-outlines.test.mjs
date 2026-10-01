import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {createOutline,regionBoundary} from '../selection-outlines.mjs';
const v=(x,y,z)=>new THREE.Vector3(x,y,z);
test('outline width stays two pixels across perspective distances and orthographic zoom',()=>{
 const outline=createOutline([[v(-1,0,0),v(1,0,0)]]);
 const cameras=[new THREE.PerspectiveCamera(40,1,.1,100),new THREE.OrthographicCamera(-4,4,4,-4,.1,100)];
 for(const camera of cameras)for(const distance of [3,20]){
  camera.position.set(0,0,distance);camera.lookAt(0,0,0);camera.zoom=distance===3?2:1;camera.updateProjectionMatrix();camera.updateMatrixWorld();outline.userData.updateOutline(camera,800,800);
  const points=outline.children[1].geometry.attributes.position,a=v(0,0,0).fromBufferAttribute(points,0).project(camera),b=v(0,0,0).fromBufferAttribute(points,1).project(camera);
  assert.ok(Math.abs(Math.hypot(a.x-b.x,a.y-b.y)*400-2)<.001);
 }
});
test('room outline removes partial shared boundaries between rectangles',()=>{
 const corners=(x0,x1,z0,z1)=>[v(x0,0,z0),v(x1,0,z0),v(x1,0,z1),v(x0,0,z1)];
 const boundary=regionBoundary([{corners:corners(0,2,0,2)},{corners:corners(2,3,0,1)}]);
 assert.ok(Math.abs(boundary.reduce((n,[a,b])=>n+a.distanceTo(b),0)-10)<1e-6);
 assert.ok(!boundary.some(([a,b])=>a.x===2&&b.x===2&&Math.max(a.z,b.z)<=1));
});
