'use strict';
// One confirmation message -> one immutable transaction ID (or one Telegram list update).
// Both routes check the signed Telegram sender against the stored owner, not the active workspace.
const {randomUUID}=require('node:crypto');
const {listLineUpdateId,listRangeForId}=require('./list-utils.cjs');

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function singleButton(id){
 if(!UUID.test(String(id)))throw Error('Yozuv identifikatori noto‘g‘ri');
 return {inline_keyboard:[[{text:'↩️ Shu yozuvni bekor qilish',callback_data:'undo:tx:'+id}]]};
}
function listButton(updateId){
 if(!Number.isSafeInteger(updateId)||updateId<0)throw Error('Ro‘yxat identifikatori noto‘g‘ri');
 return {inline_keyboard:[[{text:'↩️ Shu ro‘yxatni bekor qilish',callback_data:'undo:list:'+updateId}]]};
}
async function saveSingle(db,{uid,workspaceId,updateId,id=randomUUID(),kind,category,amount,note,day,created=new Date().toISOString()}){
 if(!Number.isSafeInteger(updateId)||updateId<0||!UUID.test(id))throw Error('Yozuv identifikatori noto‘g‘ri');
 uid=String(uid);
 // Keep a durable Telegram update marker even if the entry is later deleted.
 // A retried webhook can never recreate an intentionally cancelled expense.
 const previous=await db.execute({sql:'SELECT update_id FROM mn_processed_lists WHERE update_id=?',args:[updateId]});
 if(previous.rows.length)return null;
 try{
  const result=await db.batch([
   {sql:'INSERT INTO mn_processed_lists(update_id,uid,workspace_id,created) VALUES(?,?,?,?)',
    args:[updateId,uid,workspaceId,created]},
   {sql:'INSERT INTO mn_transactions(id,uid,workspace_id,update_id,kind,category,amount,note,day,created) VALUES(?,?,?,?,?,?,?,?,?,?)',
    args:[id,uid,workspaceId,updateId,kind,category,amount,note,day,created]}
  ],'write');
  return result[1].rowsAffected?id:null;
 }catch(e){
  // Handle two simultaneous deliveries of the same webhook, plus older rows
  // recorded before durable markers were introduced.
  const [marker,tx]=await Promise.all([
   db.execute({sql:'SELECT update_id FROM mn_processed_lists WHERE update_id=?',args:[updateId]}),
   db.execute({sql:'SELECT id FROM mn_transactions WHERE update_id=?',args:[updateId]})
  ]);
  if(marker.rows.length||tx.rows.length)return null;
  throw e;
 }
}
async function one(db,uid,id){
 uid=String(uid);
 if(!UUID.test(String(id)))return {status:'invalid'};
 const found=await db.execute({sql:'SELECT id,update_id,workspace_id,day FROM mn_transactions WHERE uid=? AND id=?',args:[uid,id]});
 if(!found.rows.length)return {status:'gone'};
 const row=found.rows[0],wid=String(row.workspace_id);
 if((await db.execute({sql:'SELECT 1 FROM mn_workspace_archive WHERE uid=? AND workspace_id=?',args:[uid,wid]})).rows.length)
  return {status:'archived'};
 if((await db.execute({sql:'SELECT 1 FROM mn_closed_months WHERE workspace_id=? AND month=?',args:[wid,String(row.day).slice(0,7)]})).rows.length)
  return {status:'closed'};
 // The transaction and (for pre-existing entries) retry marker are written atomically.
 // DELETE itself rechecks archive/month state, including if the entry was edited meanwhile.
 const results=await db.batch([
  {sql:'INSERT OR IGNORE INTO mn_processed_lists(update_id,uid,workspace_id,created) SELECT update_id,uid,workspace_id,? FROM mn_transactions WHERE id=? AND uid=? AND update_id>=0',
   args:[new Date().toISOString(),id,uid]},
  {sql:'DELETE FROM mn_transactions WHERE uid=? AND id=? AND NOT EXISTS (SELECT 1 FROM mn_workspace_archive a WHERE a.workspace_id=mn_transactions.workspace_id AND a.uid=?) AND NOT EXISTS (SELECT 1 FROM mn_closed_months c WHERE c.workspace_id=mn_transactions.workspace_id AND c.month=substr(mn_transactions.day,1,7)) RETURNING kind,category,amount',
   args:[uid,id,uid]}
 ],'write');
 const deleted=results[1].rows[0];
 if(!deleted)return {status:'gone_or_locked'};
 return {status:'deleted',kind:String(deleted.kind),category:String(deleted.category),amount:Number(deleted.amount),count:1};
}
async function list(db,uid,source){
 uid=String(uid);
 if(!Number.isSafeInteger(source)||source<0)return {status:'invalid'};
 const marker=await db.execute({sql:'SELECT workspace_id FROM mn_processed_lists WHERE uid=? AND update_id=?',args:[uid,source]});
 if(!marker.rows.length)return {status:'gone'};
 const wid=String(marker.rows[0].workspace_id);
 const {lower,upper}=listRangeForId(listLineUpdateId(source,0));
 const selected=await db.execute({sql:'SELECT day FROM mn_transactions WHERE uid=? AND workspace_id=? AND update_id BETWEEN ? AND ? LIMIT 21',
  args:[uid,wid,lower,upper]});
 if(!selected.rows.length)return {status:'gone'};
 if((await db.execute({sql:'SELECT 1 FROM mn_workspace_archive WHERE uid=? AND workspace_id=?',args:[uid,wid]})).rows.length)
  return {status:'archived'};
 const months=[...new Set(selected.rows.map(r=>String(r.day).slice(0,7)))];
 for(const month of months)if((await db.execute({sql:'SELECT 1 FROM mn_closed_months WHERE workspace_id=? AND month=?',args:[wid,month]})).rows.length)
  return {status:'closed'};
 // The NOT EXISTS guard applies to the whole list, so even a concurrent close
 // cannot lead to only some entries being removed.
 const removed=await db.execute({sql:
  'DELETE FROM mn_transactions WHERE uid=? AND workspace_id=? AND update_id BETWEEN ? AND ?'+
  ' AND NOT EXISTS (SELECT 1 FROM mn_workspace_archive a WHERE a.uid=? AND a.workspace_id=?)'+
  ' AND NOT EXISTS (SELECT 1 FROM mn_transactions t JOIN mn_closed_months c ON c.workspace_id=t.workspace_id AND c.month=substr(t.day,1,7) WHERE t.uid=? AND t.workspace_id=? AND t.update_id BETWEEN ? AND ?)'+
  ' RETURNING amount',
  args:[uid,wid,lower,upper,uid,wid,uid,wid,lower,upper]});
 if(!removed.rows.length)return {status:'gone_or_locked'};
 return {status:'deleted',count:removed.rows.length,total:removed.rows.reduce((n,r)=>n+Number(r.amount),0),list:true};
}
async function fromCallback(db,uid,data){
 if(typeof data!=='string'||!data.startsWith('undo:'))return null;
 if(data.startsWith('undo:tx:'))return one(db,uid,data.slice(8));
 if(data.startsWith('undo:list:')){
  const raw=data.slice(10);
  if(!/^(0|[1-9]\d{0,14})$/.test(raw))return {status:'invalid'};
  return list(db,uid,Number(raw));
 }
 return {status:'invalid'};
}
module.exports={singleButton,listButton,saveSingle,one,list,fromCallback};
