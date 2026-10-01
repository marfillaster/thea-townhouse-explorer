// Reviewed against Blueprint.pdf: A-2 floor plans/elevations and A-4 schedule.
// x=0 is the left building edge; front z=+3.825. Metres throughout.
// Scheduled widths/heights/sills are transcribed; center offsets are scaled
// from the scan and should not be treated as surveyed setting-out dimensions.
export const openingSchedule = {
 D1:{system:'doors',w:.90,h:2.10,sill:0,style:'panel',description:'Steel entrance door'},
 D2:{system:'doors',w:.80,h:2.10,sill:0,style:'panel',description:'Steel service / balcony door'},
 D3:{system:'doors',w:.80,h:2.10,sill:0,style:'panel',description:'Moulded bedroom door'},
 D4:{system:'doors',w:.60,h:2.12,sill:0,style:'louver',description:'PVC bathroom door'},
 W1a:{system:'windows',w:1.20,h:1.20,sill:.90,style:'acu-right',description:'Guest room steel casement with AC provision'},
 W2:{system:'windows',w:1.20,h:1.20,sill:.90,style:'four-pane',description:'Steel casement'},
 W3:{system:'windows',w:.60,h:1.20,sill:.90,style:'two-pane',description:'Living room steel casement'},
 W4:{system:'windows',w:.40,h:.90,sill:1.20,style:'single-column',description:'Kitchen steel casement'},
 W5:{system:'windows',w:.60,h:.40,sill:1.70,style:'awning',description:'Ground bathroom awning'},
 W6:{system:'windows',w:.60,h:.40,sill:1.70,style:'awning',description:'Upper bathroom awning'},
 W7:{system:'windows',w:.60,h:1.20,sill:.90,style:'two-pane',description:'Bedroom steel casement'},
 W8:{system:'windows',w:1.20,h:1.20,sill:.90,style:'four-pane',description:'Master bedroom steel casement'},
 W9b:{system:'windows',w:1.20,h:1.20,sill:.90,style:'acu-left',description:'Master bedroom steel casement with AC provision'},
 W10:{system:'windows',w:.60,h:1.20,sill:.90,style:'acu-full',description:'Bedroom 1 steel casement with AC provision'}
};
export const walls = [
 {id:'g-party',floor:0,a:[5.05,-3.825],b:[5.05,3.825],bottom:.25,top:3.1,name:'Right party wall'},
 {id:'g-rear',floor:0,a:[2.05,-3.825],b:[5.05,-3.825],bottom:.25,top:3.1,name:'Rear kitchen and stair wall'},
 {id:'g-side',floor:0,a:[0,-2.275],b:[0,3.825],bottom:.25,top:3.1,name:'Left exterior and carport wall'},
 {id:'g-bath-rear',floor:0,a:[0,-2.275],b:[2.05,-2.275],bottom:.20,top:3.1,name:'Ground bathroom exterior wall'},
 {id:'g-service',floor:0,a:[2.05,-3.825],b:[2.05,-2.275],bottom:.25,top:3.1,name:'Kitchen service wall'},
 {id:'g-divider',floor:0,a:[2.55,-1.115],b:[2.55,3.825],bottom:.25,top:3.1,name:'Living and dining partition'},
 {id:'g-front',floor:0,a:[2.55,3.825],b:[5.05,3.825],bottom:.25,top:3.1,name:'Living room front wall'},
 {id:'g-guest-front',floor:0,a:[0,1.125],b:[2.55,1.125],bottom:.25,top:3.1,name:'Guest room front wall'},
 {id:'g-bath-south',floor:0,a:[0,-1.115],b:[2.55,-1.115],bottom:.20,top:3.1,name:'Ground bathroom partition'},
 {id:'g-bath-door',floor:0,a:[2.05,-2.275],b:[2.05,-1.115],bottom:.20,top:3.1,name:'Ground bathroom door wall'},
 {id:'u-party',floor:1,a:[5.05,-3.825],b:[5.05,3.825],bottom:3.1,top:5.85,name:'Upper party wall'},
 {id:'u-rear',floor:1,a:[2.05,-3.825],b:[5.05,-3.825],bottom:3.1,top:5.85,name:'Upper rear wall'},
 {id:'u-side',floor:1,a:[0,-2.275],b:[0,2.325],bottom:3.1,top:5.85,name:'Master bedroom side wall'},
 {id:'u-master-rear',floor:1,a:[0,-2.275],b:[2.05,-2.275],bottom:3.1,top:5.85,name:'Master bedroom rear wall'},
 {id:'u-bath-side',floor:1,a:[2.05,-3.825],b:[2.05,-2.275],bottom:3.075,top:5.85,name:'Upper bathroom side wall'},
 {id:'u-divider',floor:1,a:[2.55,-2.275],b:[2.55,3.825],bottom:3.1,top:5.85,name:'Bedroom dividing wall'},
 {id:'u-balcony',floor:1,a:[0,2.325],b:[2.55,2.325],bottom:3.1,top:5.85,name:'Master bedroom balcony wall'},
 {id:'u-front',floor:1,a:[2.55,3.825],b:[5.05,3.825],bottom:3.1,top:5.85,name:'Bedroom 1 front wall'},
 {id:'u-bath-south',floor:1,a:[2.05,-2.275],b:[4.05,-2.275],bottom:3.075,top:5.85,name:'Upper bathroom partition'},
 {id:'u-stair',floor:1,a:[4.05,-3.825],b:[4.05,-2.275],bottom:3.1,top:5.85,name:'Stair enclosure'},
 {id:'u-bedroom-entry',floor:1,a:[2.55,-.725],b:[5.05,-.725],bottom:3.1,top:5.85,name:'Bedroom 1 landing wall'}
];
// at = distance from wall.a along the wall. Doors are modeled CLOSED in the
// actual wall gap, not at the swung-open leaf shown in the plan. In the 2D
// plan, swing:'out' opens a door away from the room it serves and hinge:'end'
// hinges it on the jamb farther from wall.a. The kitchen service door opens
// outward, hinged on the bathroom side; the balcony door hinges on the party
// wall side, the upper bathroom door on the stairwell wall side and the ground
// bathroom door on the guest room wall side.
export const openingPlacements = [
 {id:'main-entry',code:'D1',wall:'g-front',at:.50,name:'Main entrance'},
 {id:'service-door',code:'D2',wall:'g-service',at:1.10,name:'Service door',swing:'out',hinge:'end'},
 {id:'guest-door',code:'D3',wall:'g-divider',at:.50,name:'Guest bedroom door'},
 {id:'ground-bath-door',code:'D4',wall:'g-bath-door',at:.75,name:'Ground bathroom door',hinge:'end'},
 {id:'balcony-door',code:'D2',wall:'u-balcony',at:2.05,name:'Balcony door',hinge:'end'},
 {id:'master-door',code:'D3',wall:'u-divider',at:.50,name:'Master bedroom entry'},
 {id:'bedroom-door',code:'D3',wall:'u-bedroom-entry',at:.50,name:'Bedroom 1 entry'},
 {id:'upper-bath-door',code:'D4',wall:'u-bath-south',at:1.60,name:'Upper bathroom door',hinge:'end'},
 {id:'guest-front',code:'W1a',wall:'g-guest-front',at:1.275,name:'Guest room front window'},
 {id:'guest-side',code:'W2',wall:'g-side',at:2.30,name:'Guest room side window'},
 {id:'living-side',code:'W2',wall:'g-divider',at:3.59,name:'Living room carport-side window'},
 {id:'living-front',code:'W3',wall:'g-front',at:1.75,name:'Living room front window'},
 {id:'kitchen-window',code:'W4',wall:'g-service',at:.375,name:'Kitchen window'},
 {id:'ground-bath-window',code:'W5',wall:'g-bath-rear',at:1.40,name:'Ground bathroom awning'},
 {id:'upper-bath-window',code:'W6',wall:'u-bath-side',at:.80,name:'Upper bathroom awning'},
 {id:'master-balcony',code:'W7',wall:'u-balcony',at:.80,name:'Master bedroom balcony window'},
 {id:'bedroom-side',code:'W7',wall:'u-divider',at:5.375,name:'Bedroom 1 balcony-side window'},
 {id:'bedroom-front',code:'W7',wall:'u-front',at:1.80,name:'Bedroom 1 front casement'},
 {id:'master-side',code:'W8',wall:'u-side',at:2.30,name:'Master bedroom side window'},
 {id:'master-rear',code:'W9b',wall:'u-master-rear',at:1.25,name:'Master bedroom rear window'},
 {id:'bedroom-front-ac',code:'W10',wall:'u-front',at:.55,name:'Bedroom 1 front AC-provision window'}
];
export const reviewedOpenings = openingPlacements.map(p=>{
 const wall=walls.find(w=>w.id===p.wall),spec=openingSchedule[p.code];
 const length=Math.hypot(wall.b[0]-wall.a[0],wall.b[1]-wall.a[1]);
 return {...p,...spec,floor:wall.floor,base:wall.bottom,axis:wall.a[1]===wall.b[1]?'x':'z',
 x:wall.a[0]+(wall.b[0]-wall.a[0])*p.at/length,z:wall.a[1]+(wall.b[1]-wall.a[1])*p.at/length};
});
