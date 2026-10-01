// Room-facing subdivisions of existing walls. No new partitions are introduced.
// Along-wall offsets are measured from wall.a; normal is in canonical plan space.
export const roomNames={LR:'Living room',DR:'Dining area',KT:'Kitchen',GR:'Guest bedroom',B0:'Ground bathroom',CP:'Carport',MB:'Master bedroom',R1:'Bedroom 1',B1:'Upper bathroom',LD:'Landing',ST:'Stairwell',BL:'Balcony'};
const spans=[
 // id, start, end, negative-axis room, positive-axis room (null = exterior)
 ['g-party',0,2.710,'KT',null],['g-party',2.710,4.950,'DR',null],['g-party',4.950,7.650,'LR',null],
 ['g-rear',0,3,null,'KT'],
 ['g-side',0,1.160,null,'B0'],['g-side',1.160,3.400,null,'GR'],['g-side',3.400,6.100,null,'CP'],
 ['g-bath-rear',0,2.050,null,'B0'],['g-service',0,1.550,null,'KT'],
 ['g-divider',0,2.240,'GR','DR'],['g-divider',2.240,4.940,'CP','LR'],
 ['g-front',0,2.500,'LR',null],['g-guest-front',0,2.550,'GR','CP'],
 ['g-bath-south',0,2.050,'B0','GR'],['g-bath-south',2.050,2.550,'KT','GR'],
 ['g-bath-door',0,1.160,'B0','KT'],
 ['u-party',0,2.300,'ST',null],['u-party',2.300,3.100,'LD',null],['u-party',3.100,6.150,'R1',null],['u-party',6.150,7.650,'R1',null],
 ['u-rear',0,2,null,'B1'],['u-rear',2,3,null,'ST'],
 ['u-side',0,4.600,null,'MB'],['u-master-rear',0,2.050,null,'MB'],['u-bath-side',0,1.550,null,'B1'],
 ['u-divider',0,1.550,'MB','LD'],['u-divider',1.550,4.600,'MB','R1'],['u-divider',4.600,6.100,'BL','R1'],
 ['u-balcony',0,2.550,'MB','BL'],['u-front',0,2.500,'R1',null],
 ['u-bath-south',0,.500,'B1','MB'],['u-bath-south',.500,2,'B1','LD'],
 ['u-stair',0,1.550,'B1','ST'],
 ['u-bedroom-entry',0,2.500,'LD','R1']
];
export function buildWallSurfaces(walls){
 const faces=[];
 for(const [wallId,start,end,minus,plus]of spans){
  const wall=walls.find(w=>w.id===wallId),axis=wall.a[0]===wall.b[0]?'x':'z';
  for(const [side,room,other]of [[-1,minus,plus],[1,plus,minus]])faces.push({id:`${wallId}:${start}:${side}`,wallId,start,end,floor:wall.floor,axis,normal:side,room:room||other,neighbor:other,type:room?'I':'E'});
 }
 return faces;
}
export function surfaceCodes(faces,right=true){
 const totals=new Map(),used=new Map();
 const entries=faces.filter(face=>!face.extension).map(face=>{const outward=face.normal*(face.type==='I'?-1:1),world=face.axis==='x'&&right?-outward:outward;const direction=face.axis==='x'?(world>0?'E':'W'):(world>0?'S':'N');const key=`${face.room}-${direction}${face.type}`;totals.set(key,(totals.get(key)||0)+1);return {...face,direction,key};});
 const codes=new Map(entries.map(face=>{const n=(used.get(face.key)||0)+1;used.set(face.key,n);const code=`${face.room}-${face.direction}${totals.get(face.key)>1?n:''}${face.type}`;
  // Preserve references to retained spans after removing the open stair partition.
  const retained=right&&({'u-stair:0:1':'ST-E1I','u-party:2.3:-1':'LD-W1I'})[face.id];
  return [face.id,{...face,code:retained||code}];}));
 return faces.map(face=>face.extension?{...codes.get(face.baseFaceId),...face,code:codes.get(face.baseFaceId).code+'-X'}:codes.get(face.id));
}
export function buildWallExtensions(faces,wallPieces,ceiling=5.65){
 return faces.filter(face=>face.floor===1&&wallPieces.some(p=>p.wall===face.wallId&&p.high>ceiling+.25&&Math.min(p.b,face.end)-Math.max(p.a,face.start)>.16)).map(face=>({...face,id:face.id+':extension',baseFaceId:face.id,extension:true,ceiling}));
}
