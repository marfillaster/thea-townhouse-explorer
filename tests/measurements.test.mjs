import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { surfaceDimensions, transformDimensions } from '../measurements.mjs';
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-6,`${actual} ≠ ${expected}`);

test('roof dimensions follow the rotated slope rather than world bounding extents',()=>{
 const roof=new THREE.Mesh(new THREE.BoxGeometry(3,.04,5));roof.rotation.x=.2;
 const dims=surfaceDimensions(roof,'roof');
 close(dims[0].a.distanceTo(dims[0].b),3);close(dims[1].a.distanceTo(dims[1].b),5);
 close(Math.abs(dims[1].b.y-dims[1].a.y),5*Math.sin(.2));
});

test('mirroring and floor separation move dimensions without changing their values',()=>{
 const root=new THREE.Group(),floor=new THREE.Group();root.scale.x=-1;root.position.x=2.525;root.add(floor);floor.position.y=2;
 const slab=new THREE.Mesh(new THREE.BoxGeometry(2.5,.15,4.55));slab.position.set(3.8,3.025,1.55);floor.add(slab);
 const dims=surfaceDimensions(slab,'floor');close(dims[0].a.distanceTo(dims[0].b),2.5);close(dims[1].a.distanceTo(dims[1].b),4.55);
 close(dims[0].a.y,5.1);close(dims[1].offset.x,-.24);close(dims[1].offset.y,0);
});

test('opening projection offsets are vectors, unaffected by world translation',()=>{
 const frame=new THREE.Group();frame.position.set(10,3,-7);
 const [d]=transformDimensions([{a:[0,0,0],b:[0,2.1,0],offset:[.24,0,0],label:'Height'}],frame);
 close(d.a.y,3);close(d.b.y,5.1);close(d.offset.x,.24);close(d.offset.y,0);close(d.offset.z,0);
});

const {rectangularRegions,regionProjection}=await import('../measurements.mjs');
const area=rs=>rs.reduce((s,r)=>s+(r.x1-r.x0)*(r.z1-r.z0),0);
const overlap=(a,b)=>Math.max(0,Math.min(a.x1,b.x1)-Math.max(a.x0,b.x0))*Math.max(0,Math.min(a.z1,b.z1)-Math.max(a.z0,b.z0));
test('L-shaped regions split into disjoint rectangles without filling the notch',()=>{
 const outline=[{x0:0,x1:4,z0:0,z1:2},{x0:2,x1:4,z0:0,z1:6}];
 const rs=rectangularRegions(outline);assert.equal(rs.length,2);close(area(rs),16);close(overlap(rs[0],rs[1]),0);
});
test('inner regions exclude wall footprints and exterior overhangs',()=>{
 const roof=[{x0:-.4,x1:5.4,z0:-.4,z1:7.4}],walls=[{x0:0,x1:.15,z0:0,z1:7},{x0:4.85,x1:5,z0:0,z1:7},{x0:0,x1:5,z0:0,z1:.15},{x0:0,x1:5,z0:6.85,z1:7},{x0:2,x1:2.15,z0:.15,z1:3}];
 const rs=rectangularRegions(roof,walls,[{x0:0,x1:5,z0:0,z1:7}]);
 close(area(rs),4.7*6.7-.15*2.85);
 rs.forEach((r,i)=>{walls.forEach(w=>close(overlap(r,w),0));rs.slice(i+1).forEach(other=>close(overlap(r,other),0));assert.ok(r.x0>=.15&&r.x1<=4.85&&r.z0>=.15&&r.z1<=6.85);});
});
test('region projections retain slope length when mirrored and separated',()=>{
 const frame=new THREE.Group();frame.scale.x=-1;frame.position.set(2.525,4,0);
 const r=regionProjection({x0:1,x1:3,z0:0,z1:6},(x,z)=>[x,6+z*.1,z],frame,'R1','Slope length');
 close(r.width,2);close(r.depth,Math.hypot(6,.6));close(r.corners[0].y,10);
});
