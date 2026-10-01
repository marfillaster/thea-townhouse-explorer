import test from 'node:test';
import assert from 'node:assert/strict';
import { wallsWithoutDoors, wallCrossings } from '../conduit-geometry.mjs';
test('doors split a wall into solid spans',()=>{
 const spans=wallsWithoutDoors([{id:'w',a:[0,0],b:[4,0]}],[{wall:'w',code:'D1',x:2,z:0,w:1},{wall:'w',code:'W1',x:3.5,z:0,w:.5}]);
 assert.deepEqual(spans.map(s=>[s.a,s.b]),[[[0,0],[1.5,0]],[[2.5,0],[4,0]]]);
 assert.equal(wallCrossings([2,-1],[2,1],spans),0);
 assert.equal(wallCrossings([1,-1],[1,1],spans),1);
});
