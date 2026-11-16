'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createClient}=require('@libsql/client');
const {makeFinanceApi}=require('../miniapp-api.cjs');
const admin=require('../admin-access.cjs');
const {createAdminBot}=require('../admin-bot.cjs');
const early=require('../early-access.cjs');
const {erase,CONFIRM}=require('../account-erasure.cjs');
const ADMIN_UID='7989269946';
const TOKEN='123456:FAKE_ONLY_TEST';
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
   args:['tx-222','222','ws-222',2,'income','Boshqa',1000000,'oylik','2026-11-15','2026-11-15']}
 ],'write');
 const api=makeFinanceApi({db,botToken:TOKEN,ensure:async()=>{}});
 await api.init();
 return {db,api};
}
test('Only configured administrator ID is accepted, never a public user',()=>{
 assert.equal(admin.isAdmin(ADMIN_UID,ADMIN_UID),true);
 assert.equal(admin.isAdmin('222',ADMIN_UID),false);
 assert.equal(admin.isAdmin(ADMIN_UID,''),false);
 assert.equal(admin.isAdmin('invalid',ADMIN_UID),false);
 assert.equal(admin.isAdmin(ADMIN_UID,'123;'+ADMIN_UID),true);
});
test('Telegram user first/last name stored minimally, sanitized and shown beside ID',async()=>{
 const {db}=await fixture();
 assert.equal(await admin.capture(db,{id:111,first_name:'Ali',last_name:'Valiyev'}),true);
 const x=await admin.inspect(db,'111');
 assert.equal(x.name,'Ali Valiyev');
 assert.equal(x.uid,'111');
 await admin.capture(db,{id:111,first_name:'<Ali>\n',last_name:'\u0007 Karimov'});
 assert.equal((await admin.inspect(db,'111')).name,'Ali Karimov');
 assert.equal((await admin.inspect(db,'222')).name,'Ism hali olinmagan');
 db.close();
});
test('Admin manual lifetime grants are idempotent and override standard cohort',async()=>{
 const {db}=await fixture();
 const uid='333333333';
 await db.execute({sql:'INSERT INTO mn_users(uid) VALUES(?)',args:[uid]});
 await early.register(db,uid,new Date('2026-12-01T00:02:00+05:00'));
 assert.equal((await early.status(db,uid)).free_forever,false);
 const g=await admin.grant(db,ADMIN_UID,uid,new Date('2026-12-05T10:00:00Z'));
 assert.equal(g.created,true);assert.equal(g.manually_granted,true);
 assert.equal(g.reason,'admin');
 const status=await early.status(db,uid);
 assert.equal(status.free_forever,true);assert.equal(status.reason,'admin');
 assert.equal((await admin.grant(db,ADMIN_UID,uid)).created,false);
 assert.equal((await admin.list(db,'grants')).entries.length,1);
 assert.equal((await admin.stats(db)).manual,1);
 db.close();
});
test('Manual grant can be reserved for a person who has not yet started the bot',async()=>{
 const {db}=await fixture();
 const uid='999888777';
 const granted=await admin.grant(db,ADMIN_UID,uid);
 assert.equal(granted.registered,false);
 assert.equal(granted.name,'Ism hali olinmagan');
 const after=await early.status(db,uid);
 assert.equal(after.free_forever,true);assert.equal(after.manually_granted,true);
 await db.execute({sql:'INSERT INTO mn_users(uid) VALUES(?)',args:[uid]});
 await early.register(db,uid,new Date('2026-12-08T00:00:00Z'));
 assert.equal((await early.status(db,uid)).reason,'admin');
 db.close();
});
test('Unauthorized Telegram commands and callbacks cannot grant access or view any user list',async()=>{
 const {db}=await fixture();
 const sent=[],answers=[];
 const bot=createAdminBot({
  db,send:async(uid,text,more={})=>sent.push({uid,text,more}),
  answerCallback:async(id,message)=>answers.push([id,message]),
  isAdmin:uid=>String(uid)===ADMIN_UID
 });
 assert.equal(await bot.handleMessage('222','/admin'),false);
 assert.equal(await bot.handleMessage('222','/grant 444444444'),false);
 assert.equal(await bot.handleCallback('222','adm:grant:444444444','cb123'),true);
 assert.equal((await early.status(db,'444444444')),null);
 assert.equal((await admin.stats(db)).manual,0);
 assert.equal(sent.length,0);
 assert.equal(answers[0][1],'Ruxsat yo‘q');
 await admin.capture(db,{id:111,first_name:'Ali',last_name:'Valiyev'});
 assert.equal(await bot.handleMessage(ADMIN_UID,'/grant 111'),true);
 assert.match(sent.at(-1).text,/Ali Valiyev/);
 assert.match(sent.at(-1).text,/111/);
 assert.match(sent.at(-1).more.reply_markup.inline_keyboard[0][0].callback_data,/adm:grant:111/);
 await bot.handleCallback(ADMIN_UID,'adm:grant:111','cb1234');
 assert.match(sent.at(-1).text,/huquq berildi/);
 const member=await early.status(db,'111');
 assert.equal(member.free_forever,true);
 assert.equal(member.reason,'admin');
 await bot.handleMessage(ADMIN_UID,'/users');
 assert.match(sent.at(-1).text,/Ali Valiyev/);
 assert.match(sent.at(-1).text,/111/);
 assert.doesNotMatch(sent.map(x=>x.text).join(' '),/taksi|25000|1000000|oylik/);
 db.close();
});
test('Profiles and manual grants are removed with account erasure, other users untouched',async()=>{
 const {db}=await fixture();
 await admin.capture(db,{id:111,first_name:'Ali'});
 await admin.capture(db,{id:222,first_name:'Vali'});
 await admin.grant(db,ADMIN_UID,'111');
 await admin.grant(db,ADMIN_UID,'222');
 const deleted=await erase(db,'111',{confirm:CONFIRM,telegram_id:'111',workspace_count:1});
 assert.equal(deleted.deleted,true);
 assert.equal((await db.execute({sql:'SELECT COUNT(*) AS n FROM mn_user_profiles WHERE uid=?',args:['111']})).rows[0].n,0);
 assert.equal((await db.execute({sql:'SELECT COUNT(*) AS n FROM mn_manual_grants WHERE uid=?',args:['111']})).rows[0].n,0);
 assert.equal((await admin.inspect(db,'222')).name,'Vali');
 assert.equal((await early.status(db,'222')).free_forever,true);
 db.close();
});
