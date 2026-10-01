// User-specified planning limits, in metres. These are viewer rules.
export const lotRules={minimumArea:50,minimumWidth:5,frontClearance:1,sideClearance:1,buildingWidth:5.05,buildingDepth:7.65};
export function defaultLots(){
 return Array.from({length:8},(_,i)=>({id:i+1,width:i%4===3?7:i%4===0?6:5,depth:i%4===3?12:10,rearSpace:0}));
}
// The overview uses the smallest standard lots, independently of saved unit lots.
export function minimumLots(){
 return Array.from({length:8},(_,i)=>({id:i+1,width:lotRules.minimumWidth+(i%4===0||i%4===3?lotRules.sideClearance:0),depth:10,rearSpace:0}));
}
function validateLotDimensions(lot,index){
 const end=index%4===0||index%4===3,minWidth=lotRules.minimumWidth+(end?lotRules.sideClearance:0);
 if(!Number.isFinite(lot.width)||!Number.isFinite(lot.depth))return 'Enter a width and depth in metres.';
 if(lot.width<minWidth)return `${end?'End':'Inner'} lots need at least ${minWidth} m width${end?' to allow the 1 m open-side clearance':''}.`;
 const rearSpace=lot.rearSpace??0;
 if(!Number.isFinite(rearSpace)||rearSpace<0)return 'Rear space must be zero or a positive distance.';
 if(lot.depth<lotRules.buildingDepth+lotRules.frontClearance+rearSpace)return 'Leave at least 1 m in front after the house depth and rear space.';
 if(lot.width*lot.depth<lotRules.minimumArea-1e-7)return 'Lot area must be at least 50 m².';
 if(lot.width>50||lot.depth>50)return 'The viewer supports lot dimensions up to 50 m.';
 return null;
}
export function validateLot(lot,index){
 const error=validateLotDimensions(lot,index);if(error)return error;
 if(index%4!==0&&index%4!==3&&lot.width!==lotRules.minimumWidth)return 'Inner-unit lot width is fixed at 5 m.';
 return null;
}
export function layoutBlock(lots){
 if(lots.length!==8)throw new Error('The block needs eight lots.');
 lots.forEach((lot,i)=>{const error=validateLot(lot,i);if(error)throw new Error(error);});
 const rowWidths=[0,1].map(row=>lots.slice(row*4,row*4+4).reduce((sum,l)=>sum+l.width,0));
 const width=Math.max(...rowWidths),units=[];
 for(let row=0;row<2;row++){
  let west=-rowWidths[row]/2;
  for(let col=0;col<4;col++){
   const lot=lots[row*4+col],end=col===0||col===3,openSide=col===0?'west':col===3?'east':null;
   const buildingWidth=end?Math.min(lotRules.buildingWidth,lot.width-lotRules.sideClearance):lot.width;
   const rearSpace=lot.rearSpace??0;
   const east=west+lot.width,north=row===0?0:-lot.depth,south=row===0?lot.depth:0;
   const houseWest=west+(openSide==='west'?lot.width-buildingWidth:0);
   // The original template opens on canonical x=0. Mirror/rotate to the open boundary.
   const mirrored=row===0?col%2===1:col%2===0;
   const sign=(mirrored?-1:1)*(row===0?1:-1);
   units.push({...lot,row,col,end,openSide,west,east,north,south,area:lot.width*lot.depth,
    buildingWidth,buildingDepth:lotRules.buildingDepth,houseWest,houseEast:houseWest+buildingWidth,
    rearSpace,frontClearance:lot.depth-lotRules.buildingDepth-rearSpace,sideClearance:end?lot.width-buildingWidth:0,
    frontDirection:row===0?'south':'north',mirrored,rotation:row===0?0:Math.PI,
    modelX:houseWest+(sign<0?buildingWidth:0),modelZ:(row===0?1:-1)*(3.825+rearSpace),scaleX:(mirrored?-1:1)*buildingWidth/lotRules.buildingWidth});
   west=east;
  }
 }
 for(const u of units){
  const neighbors=units.filter(v=>v.row!==u.row&&Math.min(u.east,v.east)-Math.max(u.west,v.west)>1e-7);
  u.rearNeighbors=neighbors.map(v=>v.id);
  u.rearAdjoining=u.rearSpace===0&&neighbors.some(v=>v.rearSpace===0&&Math.min(u.houseEast,v.houseEast)-Math.max(u.houseWest,v.houseWest)>1e-7);
 }
 const north=Math.min(...units.map(u=>u.north)),south=Math.max(...units.map(u=>u.south));
 return {units,bounds:{west:-width/2,east:width/2,north,south,width,depth:south-north},area:units.reduce((sum,u)=>sum+u.area,0)};
}
export function restoreLots(value){
 try{
  const saved=JSON.parse(value);if(!Array.isArray(saved)||saved.length!==8)throw new Error('The block needs eight lots.');
  const lots=saved.map((lot,i)=>{
   const error=validateLotDimensions(lot,i);if(error)throw new Error(error);
   const end=i%4===0||i%4===3;
   // Migrate older wider inner lots, retaining depth/rear space when valid at 5 m.
   return {id:i+1,width:end?lot.width:lotRules.minimumWidth,depth:end?lot.depth:Math.max(lot.depth,lotRules.minimumArea/lotRules.minimumWidth),rearSpace:lot.rearSpace??0};
  });
  layoutBlock(lots);return lots;
 }catch{return defaultLots();}
}
export function orientWallCode(code,northFacing,mirrored=true){
 if(!mirrored)code=code.replace(/-([EW])/,(_,d)=>'-'+({E:'W',W:'E'})[d]);
 return northFacing?code.replace(/-([NSEW])/,(_,d)=>'-'+({N:'S',S:'N',E:'W',W:'E'})[d]):code;
}
