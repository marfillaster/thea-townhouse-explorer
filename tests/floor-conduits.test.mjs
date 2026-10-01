import test from 'node:test';
import assert from 'node:assert/strict';
import { planFloorConduits } from '../floor-conduits.mjs';
const wall={id:'partition',a:[0,0],b:[0,5]};
const outlet=(id,z,normal=[1,0],extra={})=>({id,wallCode:id,wall,normal,point:[normal[0]*.095,z],...extra});
const length=points=>Math.hypot(points[1][0]-points[0][0],points[1][1]-points[0][1]);
test('a lone outlet has a direct diagonal instead of an orthogonal detour',()=>{
 const {links}=planFloorConduits([3,4],[outlet('one',0)],0);
 assert.equal(links.length,1);assert.equal(length(links[0].points),5);
});
test('room aliases and opposite faces on one physical wall share one channel',()=>{
 const {groups,links}=planFloorConduits([3,2],[outlet('LR-EI',1),outlet('CP-WI',4,[-1,0]),outlet('GR-WI',2,[-1,0])]);
 assert.equal(groups.length,1);assert.equal(links.length,1);
 assert.deepEqual(groups[0].points,[[-.104,1],[-.104,4]]);
 assert.equal(groups[0].taps.length,3);
 assert.deepEqual(links[0].points,[[3,2],[-.104,2]]);
});
test('exterior and interior outlets share the room-side channel',()=>{
 const {groups}=planFloorConduits([2,2],[outlet('outside',1,[-1,0],{exterior:true}),outlet('inside',3)]);
 assert.deepEqual(groups[0].normal,[1,0]);
});
test('a nearby wall connects to the existing channel instead of a second panel run',()=>{
 const second={id:'second',a:[0,5],b:[5,5]};
 const plan=planFloorConduits([0,0],[outlet('first',4,[1,0],{wall:{...wall,a:[3,0],b:[3,5]},point:[3,4]}),outlet('second',5,[0,-1],{wall:second,point:[3,5]})],0);
 assert.equal(plan.links.length,2);assert.equal(plan.links.reduce((n,l)=>n+length(l.points),0),6);
});
test('separate walls stay separate and a single-point channel creates no detour',()=>{
 const plan=planFloorConduits([0,1],[outlet('one',1),outlet('two',1,[1,0],{wall:{...wall,id:'other',a:[2,0],b:[2,5]},point:[2,1]})],0);
 assert.equal(plan.groups.length,2);assert.equal(plan.links.length,1);
 assert.deepEqual(plan.links[0].points,[[0,1],[2,1]]);
});
test('a doorway is open at floor level, so a link under it is not a penetration',()=>{
 const far={id:'far',a:[2,0],b:[2,4]};
 const outlets=[outlet('beyond',1,[-1,0],{wall:{id:'beyond',a:[4,0],b:[4,4]},point:[4,1]})];
 const regions=[{x0:0,x1:4,z0:0,z1:4}];
 const solid=planFloorConduits([0,1],outlets,0,{walls:[far],regions});
 assert.equal(solid.links[0].crossings,1);
 const door=planFloorConduits([0,1],outlets,0,{walls:[{...far,a:[2,2],b:[2,4]}],regions});
 assert.equal(door.links[0].crossings,0);
});
test('links stay over the floor slab and fail loudly when none fits',()=>{
 const regions=[{x0:0,x1:1,z0:0,z1:4},{x0:0,x1:4,z0:3,z1:4}];
 const corner=outlet('corner',3.5,[-1,0],{wall:{id:'east',a:[4,0],b:[4,4]},point:[4,3.5]});
 assert.equal(planFloorConduits([.5,3.5],[corner],0,{regions}).links.length,1);
 assert.throws(()=>planFloorConduits([.5,.5],[corner],0,{regions}),/east/);
});
test('an exterior-only wall is fed from the room side',()=>{
 const {groups}=planFloorConduits([2,2],[outlet('outside',1,[-1,0],{exterior:true})]);
 assert.deepEqual(groups[0].normal,[1,0]);
});
test('a link turns once under a doorway instead of crossing a solid wall',()=>{
 const spans=[{id:'w',a:[2,0],b:[2,1.5]},{id:'w',a:[2,2.5],b:[2,4]}];
 const outlets=[outlet('beyond',.5,[-1,0],{wall:{id:'beyond',a:[4,0],b:[4,4]},point:[4,.5]})];
 const plan=planFloorConduits([0,.5],outlets,0,{walls:spans,regions:[{x0:0,x1:4,z0:0,z1:4}],doorways:[{point:[2,2],along:[0,1]}]});
 const [x,z]=plan.links[0].points[1];
 assert.equal(plan.links[0].crossings,0);assert.equal(x,2);assert.ok(z>1.5&&z<2.5);
});
test('a doorway on the same side is not used as a turning point',()=>{
 const outlets=[outlet('near',.5,[-1,0],{wall:{id:'near',a:[1,0],b:[1,4]},point:[1,.5]})];
 const plan=planFloorConduits([0,3],outlets,0,{doorways:[{point:[2,2],along:[0,1]}]});
 assert.equal(plan.links[0].points.length,2);
});
test('a link turns once just past a wall end instead of clipping it',()=>{
 const stub=[{id:'stub',a:[2,0],b:[2,2]}];
 const plan=planFloorConduits([1.5,1.8],[outlet('beyond',1.8,[-1,0],{wall:{id:'beyond',a:[4,0],b:[4,4]},point:[4,1.8]})],0,{walls:stub});
 assert.equal(plan.links[0].crossings,0);assert.equal(plan.links[0].points.length,3);
});
test('a channel moves to the side of its wall that stays clear of other walls',()=>{
 const cross={id:'cross',a:[-2,2],b:[0,2]};
 const plan=planFloorConduits([1,0],[outlet('a',1,[-1,0]),outlet('b',3,[-1,0])],.1,{walls:[cross]});
 assert.deepEqual(plan.groups[0].normal,[1,0]);
});
test('a doorway that would make the run double back is not used',()=>{
 const spans=[{id:'w',a:[2,0],b:[2,3]}];
 const outlets=[outlet('beyond',1,[-1,0],{wall:{id:'beyond',a:[4,0],b:[4,4]},point:[4,1]})];
 const plan=planFloorConduits([1,1],outlets,0,{walls:spans,regions:[{x0:0,x1:4,z0:0,z1:4}],doorways:[{point:[2,3.5],along:[0,1]}]});
 assert.ok(plan.links[0].points.every(p=>p[1]<3.4));
});
