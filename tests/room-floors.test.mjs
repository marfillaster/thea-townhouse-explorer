import test from 'node:test';
import assert from 'node:assert/strict';
import { walls } from '../openings.mjs';
import { buildWallSurfaces } from '../wall-surfaces.mjs';
import { buildRoomFloorPlans,roomAtPoint } from '../room-floors.mjs';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} ≠ ${b}`);
const surfaces=[
 {floor:0,x0:2.55,x1:5.05,z0:-1.115,z1:3.825},
 {floor:1,x0:0,x1:2.55,z0:-2.275,z1:3.825},
 {floor:1,x0:2.05,x1:4.05,z0:-3.825,z1:-.725},
 {floor:1,x0:3.15,x1:4.13,z0:-1.565,z1:-.725}
];
const plans=buildRoomFloorPlans(walls,buildWallSurfaces(walls),surfaces);
test('living and dining are separate rooms on the same slab',()=>{
 const living=roomAtPoint(plans,0,3.8,2.2),dining=roomAtPoint(plans,0,3.8,0);
 assert.equal(living.code,'LR');assert.equal(dining.code,'DR');
 close(living.regions[0].x1-living.regions[0].x0,2.35);close(living.regions[0].z1-living.regions[0].z0,2.625);
 close(dining.regions[0].z1-dining.regions[0].z0,2.24);
});
test('shared upper slab selects master bedroom or balcony at the clicked location',()=>{
 assert.equal(roomAtPoint(plans,1,1.2,0).code,'MB');assert.equal(roomAtPoint(plans,1,1.2,3).code,'BL');
 const master=plans.find(r=>r.code==='MB');close(master.regions[0].x1-master.regions[0].x0,2.4);close(master.regions[0].z1-master.regions[0].z0,4.45);
});
test('landing combines floor pieces without including the bathroom or stairwell void',()=>{
 assert.equal(roomAtPoint(plans,1,3,-3).code,'B1');assert.equal(roomAtPoint(plans,1,3,-1.8).code,'LD');
 const landing=roomAtPoint(plans,1,4.1,-1);assert.equal(landing.code,'LD');
 assert.ok(landing.regions.every(r=>r.x0>=2.625&&r.x1<=4.13&&r.z0>=-2.2));
 assert.equal(roomAtPoint(plans,1,4.6,-2.5),undefined);
});
test('changing slab segmentation does not change room floor regions',()=>{
 const split=[{floor:0,x0:2.55,x1:3.5,z0:-1.115,z1:3.825},{floor:0,x0:3.5,x1:5.05,z0:-1.115,z1:3.825}];
 const next=buildRoomFloorPlans(walls,buildWallSurfaces(walls),split);
 for(const code of ['LR','DR'])assert.deepEqual(next.find(r=>r.code===code).regions,plans.find(r=>r.code===code).regions);
});
