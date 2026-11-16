'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createClient}=require('@libsql/client');
const {createHmac}=require('node:crypto');
const early=require('../early-access.cjs');
const backup=require('../automatic-backup.cjs');
const {erase,CONFIRM}=require('../account-erasure.cjs');
const {restoreMissing}=require('../backup-recovery.cjs');
const {makeFinanceApi}=require('../miniapp-api.cjs');
const TOKEN='123456:FAKE_ONLY_UNIT_TESTS';
const KEY=Buffer.alloc(32,71);
async function fixture(){
 const db=createClient({url:':memory:'});
 await db.batch([
  'CREATE TABLE mn_users(uid TEXT PRIMARY KEY,active TEXT)',
  'CREATE TABLE mn_workspaces(id TEXT PRIMARY KEY,uid TEXT NOT NULL,kind TEXT NOT NULL,name TEXT NOT NULL,created TEXT NOT NULL)',
  'CREATE TABLE mn_transactions(id TEXT PRIMARY KEY,uid TEXT NOT NULL,workspace_id TEXT NOT NULL,update_id INTEGER NOT NULL UNIQUE,kind TEXT NOT NULL,category TEXT NOT NULL,amount INTEGER NOT NULL CHECK(amount>0),note TEXT,day TEXT NOT NULL,created TEXT NOT NULL)',
  'CREATE TABLE mn_budgets(workspace_id TEXT NOT NULL,month TEXT NOT NULL,category TEXT NOT NULL,limit_amount INTEGER NOT NULL CHECK(limit_amount>=0),PRIMARY KEY(workspace_id,month,category))',
  'CREATE TABLE mn_processed_lists(update_id INTEGER PRIMARY KEY,uid TEXT NOT NULL,workspace_id TEXT NOT NULL,created TEXT NOT NULL)',
  {sql:'INSERT INTO mn_users(uid,active) VALUES(?,?)',args:['111','ws-111']},
  {sql:'INSERT INTO mn_workspaces(id,uid,kind,name,created) VALUES(?,?,?,?,?)',args:['ws-111','111','personal','Shaxsiy moliyam','2026-11-12']},
  {sql:'INSERT INTO mn_users(uid,active) VALUES(?,?)',args:['222','ws-222']},
  {sql:'INSERT INTO mn_workspaces(id,uid,kind,name,created) VALUES(?,?,?,?,?)',args:['ws-222','222','personal','Begona','2026-11-12']},
  {sql:'INSERT INTO mn_transactions(id,uid,workspace_id,update_id,kind,category,amount,note,day,created) VALUES(?,?,?,?,?,?,?,?,?,?)',
   args:['tx-111','111','ws-111',1,'expense','Transport',25000,'taksi','2026-11-15','2026-11-15']},
  {sql:'INSERT INTO mn_transactions(id,uid,workspace_id,update_id,kind,category,amount,note,day,created) VALUES(?,?,?,?,?,?,?,?,?,?)',
   args:['tx-222','222','ws-222',2,'income','Boshqa',1000000,'oylik','2026-11-15','2026-11-15']},
  {sql:'INSERT INTO mn_budgets(workspace_id,month,category,limit_amount) VALUES(?,?,?,?)',args:['ws-111','2026-11','Transport',150000]}
 ],'write');
 const api=makeFinanceApi({db,botToken:TOKEN,ensure:async()=>{}});
 await api.init();
 return {db,api};
}
function signed(uid,authDate=Math.floor(Date.now()/1000)){
 const p=new URLSearchParams({auth_date:String(authDate),user:JSON.stringify({id:uid})});
 const secret=createHmac('sha256','WebAppData').update(TOKEN).digest();
 const fields=[...p].map(([k,v])=>k+'='+v).sort().join('\n');
 p.set('hash',createHmac('sha256',secret).update(fields).digest('hex'));
 return p.toString();
}
async function call(api,uid,method,path,body,authDate){
 const request={method,url:'/api/v1'+path,headers:{'x-telegram-init-data':signed(uid,authDate)},
  async *[Symbol.asyncIterator](){if(body!==undefined)yield Buffer.from(JSON.stringify(body));}};
 const response={code:0,data:'',writeHead(n){this.code=n;},end(x=''){this.data+=x;}};
 await api.handle(request,response);
 return {code:response.code,json:JSON.parse(response.data)};
}
test('Early-access deadline uses Tashkent Nov 30 23:59:59 and excludes Dec 1',()=>{
 assert.equal(early.eligibleAt('2026-11-30T18:59:59.999Z'),true);
 assert.equal(early.eligibleAt('2026-11-30T19:00:00.000Z'),false);
 assert.equal(early.eligibleAt('2026-12-01T00:00:00.000+05:00'),false);
});
test('Existing users grandfathered without changing finance; new members after cutoff are not',async()=>{
 const {db}=await fixture();
 const first=await early.status(db,'111');
 assert.equal(first.free_forever,true);assert.equal(first.reason,'legacy');
 await db.execute({sql:'INSERT INTO mn_users(uid) VALUES(?)',args:['333']});
 await early.register(db,'333',new Date('2026-12-01T00:01:00+05:00'));
 const other=await early.status(db,'333');
 assert.equal(other.free_forever,false);
 await early.register(db,'111',new Date('2026-12-01T00:01:00+05:00'));
 assert.equal((await early.status(db,'111')).free_forever,true);
 db.close();
});
test('A daily backup is encrypted, owner-bound, integrity-checked and idempotent',async()=>{
 const {db}=await fixture(),now=new Date('2026-11-16T10:00:00Z');
 const snap=await backup.create(db,'111',{key:KEY,now});
 assert.equal(snap.day,'2026-11-16');
 const row=await db.execute({sql:'SELECT payload FROM mn_user_backups WHERE uid=?',args:['111']});
 assert.ok(!String(row.rows[0].payload).includes('taksi'));
 assert.equal((await backup.create(db,'111',{key:KEY,now})).skipped,'already_exists');
 const raw=await backup.exportBackup(db,'111','2026-11-16',{key:KEY});
 assert.equal(raw.tables.mn_transactions[0].amount,25000);
 assert.equal(raw.tables.mn_budgets[0].limit_amount,150000);
 assert.equal(raw.tables.mn_workspaces[0].name,'Shaxsiy moliyam');
 await assert.rejects(()=>backup.exportBackup(db,'222','2026-11-16',{key:KEY}),/topilmadi/);
 await assert.rejects(()=>backup.exportBackup(db,'111','2026-11-16',{key:Buffer.alloc(32,1)}));
 db.close();
});
test('Daily sweep creates one backup per user and removes copies older than 30 days',async()=>{
 const {db}=await fixture();
 const old=new Date('2026-10-01T04:00:00Z'),now=new Date('2026-11-16T04:00:00Z');
 await backup.create(db,'111',{key:KEY,now:old});
 const result=await backup.sweep(db,{key:KEY,now});
 assert.equal(result.created,2);
 assert.equal(result.failed,0);
 assert.deepEqual((await backup.list(db,'111')).map(x=>x.day),['2026-11-16']);
 assert.equal((await backup.sweep(db,{key:KEY,now})).created,0);
 db.close();
});
test('User deletion requires explicit name, uid and exact account count',async()=>{
 const {db}=await fixture();
 await assert.rejects(()=>erase(db,'111',{confirm:CONFIRM,telegram_id:'222',workspace_count:1}),/tasdiqlanmagan/);
 await assert.rejects(()=>erase(db,'111',{confirm:CONFIRM,telegram_id:'111',workspace_count:2}),/soni/);
 assert.equal((await db.execute({sql:'SELECT COUNT(*) AS n FROM mn_transactions WHERE uid=?',args:['111']})).rows[0].n,1);
 db.close();
});
test('Atomic profile deletion removes all owned tables and backups, not other users',async()=>{
 const {db}=await fixture();
 await db.execute({sql:'INSERT INTO mn_extra_categories(workspace_id,kind,name) VALUES(?,?,?)',args:['ws-111','expense','Uy hayvonlari']});
 await db.execute({sql:'INSERT INTO mn_workspace_archive(workspace_id,uid,archived_at) VALUES(?,?,?)',args:['ws-111','111','2026-11-15']});
 await db.execute({sql:'INSERT INTO mn_closed_months(workspace_id,uid,month,closed_at) VALUES(?,?,?,?)',args:['ws-111','111','2026-10','2026-11-14']});
 await backup.create(db,'111',{key:KEY});
 await backup.create(db,'222',{key:KEY});
 const gone=await erase(db,'111',{confirm:CONFIRM,telegram_id:'111',workspace_count:1});
 assert.equal(gone.deleted,true);
 for(const [table,column] of [
  ['mn_users','uid'],['mn_early_access','uid'],['mn_user_backups','uid'],
  ['mn_workspaces','uid'],['mn_transactions','uid'],
  ['mn_closed_months','uid'],['mn_workspace_archive','uid'],
  ['mn_extra_categories','workspace_id'],['mn_budgets','workspace_id']]){
   const param=column==='workspace_id'?'ws-111':'111';
   const r=await db.execute({sql:'SELECT COUNT(*) AS n FROM '+table+' WHERE '+column+'=?',args:[param]});
   assert.equal(Number(r.rows[0].n),0,'not deleted: '+table);
 }
 const other=await db.execute({sql:'SELECT COUNT(*) AS n FROM mn_transactions WHERE uid=?',args:['222']});
 assert.equal(Number(other.rows[0].n),1);
 assert.equal((await backup.list(db,'222')).length,1);
 db.close();
});
test('Short-lived signed Telegram auth is mandatory for irreversible deletion',async()=>{
 const {db,api}=await fixture();
 const payload={confirm:CONFIRM,telegram_id:'111',workspace_count:1};
 const stale=await call(api,111,'POST','/delete-account',payload,Math.floor(Date.now()/1000)-701);
 assert.equal(stale.code,401);
 const forged=await call(api,111,'POST','/delete-account',{...payload,telegram_id:'222'});
 assert.equal(forged.code,400);
 const intact=await db.execute({sql:'SELECT COUNT(*) AS n FROM mn_transactions WHERE uid=?',args:['111']});
 assert.equal(Number(intact.rows[0].n),1);
 const deleted=await call(api,111,'POST','/delete-account',payload);
 assert.equal(deleted.code,200);assert.equal(deleted.json.deleted,true);
 assert.equal(Number((await db.execute({sql:'SELECT COUNT(*) AS n FROM mn_users WHERE uid=?',args:['111']})).rows[0].n),0);
 db.close();
});

test('Backup recovery adds missing records but does not overwrite newer budget settings',async()=>{
 const {db}=await fixture(),day='2026-11-16',now=new Date('2026-11-16T12:00:00Z');
 await backup.create(db,'111',{key:KEY,now});
 await db.execute({sql:'DELETE FROM mn_transactions WHERE uid=?',args:['111']});
 await db.execute({sql:'UPDATE mn_budgets SET limit_amount=? WHERE workspace_id=?',args:[333333,'ws-111']});
 await assert.rejects(()=>restoreMissing(db,'111',day,{confirm:'NO'},{key:KEY}),/TIKLA/);
 const result=await restoreMissing(db,'111',day,{confirm:'TIKLA'},{key:KEY});
 assert.equal(result.restored,1);
 assert.equal((await db.execute({sql:'SELECT amount FROM mn_transactions WHERE uid=?',args:['111']})).rows[0].amount,25000);
 assert.equal((await db.execute({sql:'SELECT limit_amount FROM mn_budgets WHERE workspace_id=?',args:['ws-111']})).rows[0].limit_amount,333333);
 assert.equal((await restoreMissing(db,'111',day,{confirm:'TIKLA'},{key:KEY})).restored,0);
 await assert.rejects(()=>restoreMissing(db,'222',day,{confirm:'TIKLA'},{key:KEY}),/topilmadi/);
 db.close();
});
test('Encrypted backup cannot resurrect deliberately erased user data',async()=>{
 const {db}=await fixture();
 await backup.create(db,'111',{key:KEY,now:new Date('2026-11-16T05:00:00Z')});
 await erase(db,'111',{confirm:CONFIRM,telegram_id:'111',workspace_count:1});
 await assert.rejects(()=>backup.exportBackup(db,'111','2026-11-16',{key:KEY}),/topilmadi/);
 assert.equal((await backup.create(db,'111',{key:KEY})).skipped,'no_user');
 assert.equal((await backup.list(db,'111')).length,0);
 db.close();
});
