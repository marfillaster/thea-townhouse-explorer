import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultLots,minimumLots,lotRules,validateLot,layoutBlock,restoreLots,orientWallCode} from '../lot-block.mjs';
test('50 sqm inner lots and open-side end setbacks follow user limits',()=>{
 assert.equal(validateLot({width:5,depth:10},1),null);
 assert.match(validateLot({width:5,depth:9},1),/50/);
 assert.match(validateLot({width:5,depth:10},0),/6 m/);
 assert.equal(validateLot({width:6,depth:10},0),null);
 assert.match(validateLot({width:8,depth:8},1),/1 m/);
});
test('eight units form two touching rows with exterior frontage and adjoining sides',()=>{
 const b=layoutBlock(defaultLots());assert.equal(b.units.length,8);
 for(const u of b.units){assert.equal(u.rearAdjoining,true);assert.ok(u.frontClearance>=1);if(u.end)assert.ok(u.sideClearance>=1-1e-9);}
 for(let row=0;row<2;row++)for(let col=0;col<3;col++)assert.equal(b.units[row*4+col].east,b.units[row*4+col+1].west);
 assert.equal(b.units[0].north,b.units[4].south);
 assert.equal(b.units[0].frontDirection,'south');assert.equal(b.units[4].frontDirection,'north');
 assert.equal(b.units[1].buildingWidth,5);assert.equal(b.units[3].buildingWidth,5.05);
 assert.equal(b.area,2*(60+50+50+84));
});
test('model transforms put every house inside its lot and orient open sides correctly',()=>{
 for(const u of layoutBlock(defaultLots()).units){
  const x0=u.modelX,x1=u.modelX+u.scaleX*Math.cos(u.rotation)*5.05;
  assert.ok(Math.abs(Math.min(x0,x1)-u.houseWest)<1e-8);
  assert.ok(Math.abs(Math.max(x0,x1)-u.houseEast)<1e-8);
  assert.equal(u.row===0?u.modelZ-3.825:u.modelZ+3.825,0);
  if(u.end)assert.equal(u.openSide==='west'?Math.min(x0,x1):Math.max(x0,x1),u.openSide==='west'?u.west+u.sideClearance:u.east-u.sideClearance);
 }
});
test('resized rows remain contiguous and bad persisted configurations recover',()=>{
 const lots=defaultLots();lots[0].width=7;lots[6].depth=14;
 const b=layoutBlock(lots);assert.equal(b.bounds.depth,26);assert.equal(b.bounds.width,24);
 assert.deepEqual(restoreLots('broken'),defaultLots());
 assert.deepEqual(restoreLots(JSON.stringify(lots)),lots);
 assert.deepEqual(restoreLots(JSON.stringify([{width:2,depth:3}])),defaultLots());
 assert.equal(orientWallCode('MB-N1I',true),'MB-S1I');
 assert.equal(orientWallCode('R1-E2I-X',true),'R1-W2I-X');
});

test('rear space moves the house forward and consumes available front space',()=>{
 const lots=defaultLots();lots[1].rearSpace=1;
 const b=layoutBlock(lots),u=b.units[1];
 assert.equal(u.modelZ,4.825);assert.ok(Math.abs(u.frontClearance-1.35)<1e-8);
 assert.equal(u.rearAdjoining,false);assert.equal(b.units[5].rearAdjoining,false);
 assert.match(validateLot({...lots[1],rearSpace:2},1),/1 m/);
 assert.match(validateLot({...lots[1],rearSpace:-1},1),/positive/);
 lots[5].rearSpace=1;assert.equal(layoutBlock(lots).units[5].modelZ,-4.825);
});

test('adjacent units alternate mirrored orientation, retaining original right end',()=>{
 const units=layoutBlock(defaultLots()).units;
 for(let row=0;row<2;row++)for(let col=0;col<3;col++)assert.notEqual(units[row*4+col].mirrored,units[row*4+col+1].mirrored);
 assert.equal(units[3].mirrored,true);assert.equal(units[7].mirrored,false);
});

test('rear neighbors follow overlapping resized lots and fitting codes follow handedness',()=>{
 const lots=defaultLots();lots[0].width=11;
 const b=layoutBlock(lots),u=b.units[0];assert.ok(u.rearNeighbors.length>1);
 for(const id of u.rearNeighbors){const v=b.units[id-1];assert.ok(Math.min(u.east,v.east)>Math.max(u.west,v.west));}
 assert.equal(orientWallCode('LR-EI',false,false),'LR-WI');
 assert.equal(orientWallCode('LR-EI',true,false),'LR-EI');
});


test('minimum block lots keep both rows compact with end setbacks and no rear space',()=>{
 const block=layoutBlock(minimumLots());
 assert.equal(block.area,440);assert.equal(block.bounds.width,22);assert.equal(block.bounds.depth,20);
 for(const unit of block.units){
  assert.equal(unit.rearSpace,0);assert.equal(unit.rearAdjoining,true);assert.equal(unit.buildingWidth,5);
  assert.equal(unit.area,unit.end?60:50);assert.equal(unit.sideClearance,unit.end?1:0);
  assert.ok(unit.frontClearance>=lotRules.frontClearance);
 }
});


test('inner lot width stays at 5 m while depth, rear space and end width remain configurable',()=>{
 for(const i of [1,2,5,6]){
  assert.equal(validateLot({width:5,depth:14,rearSpace:1},i),null);
  assert.match(validateLot({width:6,depth:14,rearSpace:1},i),/fixed at 5 m/);
 }
 for(const i of [0,3,4,7])assert.equal(validateLot({width:8,depth:14,rearSpace:1},i),null);
});

test('legacy wider inner lots migrate without losing saved end dimensions or rear space',()=>{
 const saved=defaultLots();saved[1]={id:2,width:6,depth:9,rearSpace:0};saved[6]={id:7,width:8,depth:12,rearSpace:1};saved[3]={id:4,width:9,depth:15,rearSpace:2};
 const restored=restoreLots(JSON.stringify(saved));
 assert.deepEqual(restored[1],{id:2,width:5,depth:10,rearSpace:0});
 assert.deepEqual(restored[6],{id:7,width:5,depth:12,rearSpace:1});
 assert.deepEqual(restored[3],saved[3]);assert.ok(Math.abs(layoutBlock(restored).units[6].frontClearance-3.35)<1e-8);
 saved[1].width=4;assert.deepEqual(restoreLots(JSON.stringify(saved)),defaultLots());
});
