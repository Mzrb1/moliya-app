'use strict';
const MAX_LIST_ITEMS=20;
// Single-message update IDs are positive; list entries use distinct negative IDs.
// Stable across Telegram redelivery; at most 20 entries per webhook update.
function listLineUpdateId(updateId,ordinal){
 if(!Number.isSafeInteger(updateId)||updateId<0||!Number.isInteger(ordinal)||ordinal<0||ordinal>=MAX_LIST_ITEMS)throw Error('Ro‘yxat identifikatori noto‘g‘ri');
 const result=-(updateId*100+ordinal+1);
 if(!Number.isSafeInteger(result))throw Error('Ro‘yxat identifikatori juda katta');
 return result;
}
function listRangeForId(lineUpdateId){
 if(!Number.isSafeInteger(lineUpdateId)||lineUpdateId>=0)throw Error('Ro‘yxat update ID noto‘g‘ri');
 const source=Math.floor((-lineUpdateId-1)/100);
 return {source,lower:listLineUpdateId(source,MAX_LIST_ITEMS-1),upper:listLineUpdateId(source,0)};
}
module.exports={MAX_LIST_ITEMS,listLineUpdateId,listRangeForId};
