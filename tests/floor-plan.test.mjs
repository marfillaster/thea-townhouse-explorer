import test from 'node:test';
import assert from 'node:assert/strict';
import { walls, reviewedOpenings } from '../openings.mjs';
import { buildWallSurfaces } from '../wall-surfaces.mjs';
import { buildRoomFloorPlans } from '../room-floors.mjs';
import { exteriorChains, planWallSolids, planOpenings, buildFloorPlan, renderFloorPlans } from '../floor-plan.mjs';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} ≠ ${b}`);
const faces=buildWallSurfaces(walls),sum=s=>s.reduce((t,x)=>t+x.b-x.a,0);
const chain=(floor,side)=>exteriorChains(walls,faces,floor).find(c=>c.side===side);

test('including-walls chains run outer face to outer face through wall centrelines',()=>{
 const north=chain(0,'north');
 assert.deepEqual(north.overall.map(s=>+(s.b-s.a).toFixed(3)),[2.125,3.075]);
 close(sum(north.overall),5.2);close(north.total.overall.b-north.total.overall.a,5.2);
 assert.deepEqual(chain(1,'north').overall.map(s=>+(s.b-s.a).toFixed(3)),[2.125,2,1.075]);
});
test('clear chains separate wall thickness from clear spans',()=>{
 const north=chain(0,'north');
 assert.deepEqual(north.clear.map(s=>[s.wall,+(s.b-s.a).toFixed(3)]),[[true,.15],[false,1.9],[true,.15],[false,2.85],[true,.15]]);
 close(sum(north.clear),5.2);close(north.total.clear.b-north.total.clear.a,4.9);
 close(chain(0,'east').total.clear.b-chain(0,'east').total.clear.a,7.5);
});
test('wall solids leave gaps at openings and close corners',()=>{
 const front=planWallSolids(walls,reviewedOpenings,0).filter(s=>s.wallId==='g-front');
 assert.equal(front.length,3);close(front[0].x0,2.475);close(front.at(-1).x1,5.125);
});
test('doors swing into the room they serve unless marked to open out',()=>{
 const doors=Object.fromEntries(planOpenings(walls,faces,reviewedOpenings,0).filter(o=>o.kind==='door').map(o=>[o.id,o.normal]));
 assert.deepEqual(doors['main-entry'],[0,-1]);assert.deepEqual(doors['guest-door'],[-1,0]);
 assert.deepEqual(doors['service-door'],[-1,0]);// opens out toward the bathroom exterior
 assert.deepEqual(doors['ground-bath-door'],[-1,0]);// opens into the bathroom
 const groundBath=planOpenings(walls,faces,reviewedOpenings,0).find(o=>o.id==='ground-bath-door');
 assert.ok(groundBath.start[1]>groundBath.end[1],'hinged toward the guest room wall');
 const service=planOpenings(walls,faces,reviewedOpenings,0).find(o=>o.id==='service-door');
 assert.ok(service.start[1]>service.end[1],'hinged on the bathroom (south) jamb');
 const upper=Object.fromEntries(planOpenings(walls,faces,reviewedOpenings,1).filter(o=>o.kind==='door').map(o=>[o.id,o.normal]));
 const hinge=id=>planOpenings(walls,faces,reviewedOpenings,1).find(o=>o.id===id);
 assert.ok(hinge('balcony-door').start[0]>hinge('balcony-door').end[0],'hinged toward the party wall');
 assert.ok(hinge('upper-bath-door').start[0]>hinge('upper-bath-door').end[0],'hinged toward the stairwell wall');
 assert.deepEqual(upper['upper-bath-door'],[0,-1]);// opens into the bathroom
 assert.deepEqual(upper['balcony-door'],[0,-1]);// opens into the master bedroom
});
test('rooms report clear regions and centreline bounds',()=>{
 const surfaces=[{floor:1,x0:0,x1:2.55,z0:-2.275,z1:3.825}];
 const rooms=buildRoomFloorPlans(walls,faces,surfaces).map(r=>({...r,name:r.code}));
 const plan=buildFloorPlan({walls,faces,openings:reviewedOpenings,rooms,floor:1}),mb=plan.rooms.find(r=>r.code==='MB');
 close(mb.clear.x1-mb.clear.x0,2.4);close(mb.overall.x1-mb.overall.x0,2.55);close(mb.area,2.4*4.45);
 const {svg}=renderFloorPlans([{title:'Second floor',plan}],p=>p,'clear');
 assert.match(svg,/data-room="MB"/);assert.doesNotMatch(svg,/dim-overall/);
});
