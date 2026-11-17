'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createClient}=require('@libsql/client');
const {singleButton,listButton,saveSingle,one,list,fromCallback}=require('../entry-undo.cjs');
const {listLineUpdateId}=require('../list-utils.cjs');
const {randomUUID}=require('node:crypto');

async function fixture(){
 const db=createClient({url:':memory:'});
 await db.batch([
  'CREATE TABLE mn_users(uid TEXT PRIMARY KEY,active TEXT)',
  'CREATE TABLE mn_workspaces(id TEXT PRIMARY KEY,uid TEXT NOT NULL,kind TEXT NOT NULL,name TEXT NOT NULL,created TEXT NOT NULL)',
  'CREATE TABLE mn_transactions(id TEXT PRIMARY KEY,uid TEXT NOT NULL,workspace_id TEXT NOT NULL,update_id INTEGER NOT NULL UNIQUE,kind TEXT NOT NULL,category TEXT NOT NULL,amount INTEGER NOT NULL CHECK(amount>0),note TEXT,day TEXT NOT NULL,created TEXT NOT NULL)',
  'CREATE TABLE mn_processed_lists(update_id INTEGER PRIMARY KEY,uid TEXT NOT NULL,workspace_id TEXT NOT NULL,created TEXT NOT NULL)',
  'CREATE TABLE mn_workspace_archive(workspace_id TEXT PRIMARY KEY,uid TEXT NOT NULL,archived_at TEXT NOT NULL)',
  'CREATE TABLE mn_closed_months(workspace_id TEXT NOT NULL,uid TEXT NOT NULL,month TEXT NOT NULL,closed_at TEXT NOT NULL,PRIMARY KEY(workspace_id,month))',
  {sql:'INSERT INTO mn_users(uid,active) VALUES(?,?)',args:['111','personal-111']},
  {sql:'INSERT INTO mn_users(uid,active) VALUES(?,?)',args:['222','personal-222']},
  ...[['personal-111','111'],['family-111','111'],['personal-222','222']].map(([id,uid])=>({
   sql:'INSERT INTO mn_workspaces(id,uid,kind,name,created) VALUES(?,?,?,?,?)',
   args:[id,uid,'personal','Personal','2026-11-17']
  }))
 ],'write');
 return db;
}
async function add(db,updateId,uid='111',workspaceId='personal-111',amount=25000){
 return saveSingle(db,{uid,workspaceId,updateId,kind:'expense',category:'Oziq-ovqat',amount,
  note:'magazin',day:'2026-11-17'});
}
async function row(db,id){
 return (await db.execute({sql:'SELECT id,uid,workspace_id,amount FROM mn_transactions WHERE id=?',args:[id]})).rows[0]||null;
}
test('Each receipt cancels its own older entry, not the newest entry',async()=>{
 const db=await fixture();
 const old=await add(db,101),latest=await add(db,102,'111','personal-111',190000);
 const action=singleButton(old).inline_keyboard[0][0];
 assert.equal(action.callback_data,'undo:tx:'+old);
 assert.ok(action.callback_data.length<=64);
 assert.equal((await fromCallback(db,'111',action.callback_data)).status,'deleted');
 assert.equal(await row(db,old),null);
 assert.equal(Number((await row(db,latest)).amount),190000);
 assert.equal((await fromCallback(db,'111',action.callback_data)).status,'gone');
 assert.equal((await db.execute({sql:'SELECT 1 FROM mn_processed_lists WHERE update_id=101'})).rows.length,1);
 assert.equal(await add(db,101),null,'redelivered webhook must not recreate cancelled money');
 db.close();
});
test('Forged or cross-user callbacks cannot cancel someone else’s expense',async()=>{
 const db=await fixture();
 const own=await add(db,103),foreign=await add(db,104,'222','personal-222');
 assert.equal((await fromCallback(db,'222','undo:tx:'+own)).status,'gone');
 assert.equal((await fromCallback(db,'111','undo:tx:'+foreign)).status,'gone');
 assert.equal((await fromCallback(db,'111','undo:tx:bad')).status,'invalid');
 assert.ok(await row(db,own));assert.ok(await row(db,foreign));
 db.close();
});
test('Receipt remains tied to its original workspace after switching active account',async()=>{
 const db=await fixture();
 const old=await add(db,105);
 await db.execute({sql:'UPDATE mn_users SET active=? WHERE uid=?',args:['family-111','111']});
 const newer=await add(db,106,'111','family-111');
 assert.equal((await one(db,'111',old)).status,'deleted');
 assert.ok(await row(db,newer));
 db.close();
});
test('Archived workspace and closed month never lose records via old buttons',async()=>{
 const db=await fixture();
 const a=await add(db,107);
 await db.execute({sql:'INSERT INTO mn_workspace_archive(workspace_id,uid,archived_at) VALUES(?,?,?)',
  args:['personal-111','111','2026-11-17']});
 assert.equal((await one(db,'111',a)).status,'archived');
 await db.execute({sql:'DELETE FROM mn_workspace_archive WHERE workspace_id=?',args:['personal-111']});
 await db.execute({sql:'INSERT INTO mn_closed_months(workspace_id,uid,month,closed_at) VALUES(?,?,?,?)',
  args:['personal-111','111','2026-11','2026-11-17']});
 assert.equal((await one(db,'111',a)).status,'closed');
 assert.ok(await row(db,a));
 db.close();
});
test('List cancellation applies only to the originating message and never the last list',async()=>{
 const db=await fixture();
 async function seed(source,amounts){
  const wid='personal-111';
  await db.execute({sql:'INSERT INTO mn_processed_lists(update_id,uid,workspace_id,created) VALUES(?,?,?,?)',
   args:[source,'111',wid,'2026-11-17']});
  for(let i=0;i<amounts.length;i++)await db.execute({
   sql:'INSERT INTO mn_transactions(id,uid,workspace_id,update_id,kind,category,amount,note,day,created) VALUES(?,?,?,?,?,?,?,?,?,?)',
   args:[randomUUID(),'111',wid,listLineUpdateId(source,i),'expense','Oziq-ovqat',amounts[i],'test','2026-11-17','2026-11-17']
  });
 }
 await seed(201,[25000,15000]);await seed(202,[190000]);
 assert.equal(listButton(201).inline_keyboard[0][0].callback_data,'undo:list:201');
 assert.equal((await fromCallback(db,'222','undo:list:201')).status,'gone');
 const d=await fromCallback(db,'111','undo:list:201');
 assert.deepEqual(d,{status:'deleted',count:2,total:40000,list:true});
 assert.equal((await list(db,'111',201)).status,'gone');
 const latest=await db.execute({sql:'SELECT amount FROM mn_transactions WHERE uid=?',args:['111']});
 assert.deepEqual(latest.rows.map(x=>Number(x.amount)),[190000]);
 assert.equal((await db.execute({sql:'SELECT 1 FROM mn_processed_lists WHERE update_id=?',args:[201]})).rows.length,1);
 db.close();
});
test('Closed month within multi-entry list prevents partial deletion',async()=>{
 const db=await fixture(),source=203,wid='personal-111';
 await db.execute({sql:'INSERT INTO mn_processed_lists(update_id,uid,workspace_id,created) VALUES(?,?,?,?)',
  args:[source,'111',wid,'2026-11-17']});
 for(const [i,date] of ['2026-10-30','2026-11-17'].entries())await db.execute({
  sql:'INSERT INTO mn_transactions(id,uid,workspace_id,update_id,kind,category,amount,note,day,created) VALUES(?,?,?,?,?,?,?,?,?,?)',
  args:[randomUUID(),'111',wid,listLineUpdateId(source,i),'expense','Boshqa',1000,'test',date,'2026-11-17']
 });
 await db.execute({sql:'INSERT INTO mn_closed_months(workspace_id,uid,month,closed_at) VALUES(?,?,?,?)',
  args:[wid,'111','2026-10','2026-11-17']});
 assert.equal((await list(db,'111',source)).status,'closed');
 assert.equal((await db.execute({sql:'SELECT id FROM mn_transactions WHERE uid=?',args:['111']})).rows.length,2);
 db.close();
});
