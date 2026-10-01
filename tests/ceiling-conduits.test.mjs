import test from 'node:test';
import assert from 'node:assert/strict';
import { planCeilingConduits } from '../ceiling-conduits.mjs';
import { wallCrossings, withinRegions } from '../conduit-geometry.mjs';
const partition={id:'partition',a:[2,0],b:[2,4]};
test('a lone light gets one straight diagonal run from the riser',()=>{
 const plan=planCeilingConduits({seeds:[[[0,0]]],terminals:[{id:'light',point:[3,4]}]});
 assert.equal(plan.links.length,1);assert.equal(plan.length,5);assert.deepEqual(plan.links[0].from,[0,0]);
});
test('later runs tee into the nearest point of an existing run',()=>{
 const plan=planCeilingConduits({seeds:[[[0,0],[4,0]]],terminals:[{id:'side',point:[2,1]}]});
 assert.deepEqual(plan.links[0].from,[2,0]);assert.equal(plan.length,1);
});
test('a run ending on a wall line does not penetrate it',()=>{
 assert.equal(wallCrossings([0,1],[2,1],[partition]),0);
 assert.equal(wallCrossings([0,1],[3,1],[partition]),1);
 assert.equal(wallCrossings([0,5],[3,5],[partition]),0);
});
test('rooms behind one wall share a single penetration',()=>{
 const plan=planCeilingConduits({seeds:[[[0,2]]],walls:[partition],terminals:[{id:'a',point:[3,1]},{id:'b',point:[3,3]}]});
 assert.equal(plan.crossings,1);
});
test('a switch drop inside the wall carries the run across without a penetration',()=>{
 const plan=planCeilingConduits({seeds:[[[0,2]]],walls:[partition],terminals:[{id:'switch',point:[2,2]},{id:'light',point:[3,2]}]});
 assert.equal(plan.crossings,0);assert.deepEqual(plan.links[1].from,[2,2]);
});
test('a straight run past the wall end avoids a penetration',()=>{
 const plan=planCeilingConduits({seeds:[[[0,2]]],walls:[partition],terminals:[{id:'beyond',point:[3,2]}],wallPenalty:3});
 assert.equal(plan.crossings,1);
 const around=planCeilingConduits({seeds:[[[1.9,5]]],walls:[partition],terminals:[{id:'beyond',point:[2.5,5]}]});
 assert.equal(around.crossings,0);
});
test('runs stay over slab regions and fail loudly when none fits',()=>{
 const regions=[{x0:0,x1:4,z0:0,z1:1},{x0:0,x1:1,z0:0,z1:4}];
 assert.equal(withinRegions([.5,3],[.9,.5],regions),true);
 assert.equal(withinRegions([.5,.5],[3.5,.5],regions),true);
 assert.equal(withinRegions([.5,3.5],[3.5,3.5],regions),false);
 assert.throws(()=>planCeilingConduits({seeds:[[[.5,3.5]]],regions,terminals:[{id:'void',point:[3.5,3.5]}]}),/void/);
});
