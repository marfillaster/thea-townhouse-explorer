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
