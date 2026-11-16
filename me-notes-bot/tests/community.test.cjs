'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createClient}=require('@libsql/client');
const {createCommunityBot,validInvite}=require('../community.cjs');
const {erase,CONFIRM}=require('../account-erasure.cjs');
const {makeFinanceApi}=require('../miniapp-api.cjs');
const OWNER='7989269946';
async function fixture(){
 const db=createClient({url:':memory:'});
 const sent=[],methods=[];
 await db.batch([
  'CREATE TABLE mn_users(uid TEXT PRIMARY KEY,active TEXT)',
  'CREATE TABLE mn_workspaces(id TEXT PRIMARY KEY,uid TEXT NOT NULL,kind TEXT NOT NULL,name TEXT NOT NULL,created TEXT NOT NULL)',
  'CREATE TABLE mn_transactions(id TEXT PRIMARY KEY,uid TEXT NOT NULL,workspace_id TEXT NOT NULL,update_id INTEGER NOT NULL UNIQUE,kind TEXT NOT NULL,category TEXT NOT NULL,amount INTEGER NOT NULL CHECK(amount>0),note TEXT,day TEXT NOT NULL,created TEXT NOT NULL)',
  'CREATE TABLE mn_budgets(workspace_id TEXT NOT NULL,month TEXT NOT NULL,category TEXT NOT NULL,limit_amount INTEGER NOT NULL CHECK(limit_amount>=0),PRIMARY KEY(workspace_id,month,category))',
  'CREATE TABLE mn_processed_lists(update_id INTEGER PRIMARY KEY,uid TEXT NOT NULL,workspace_id TEXT NOT NULL,created TEXT NOT NULL)',
  {sql:'INSERT INTO mn_users(uid,active) VALUES(?,?)',args:['111','ws111']},
  {sql:'INSERT INTO mn_users(uid,active) VALUES(?,?)',args:['222','ws222']},
  {sql:'INSERT INTO mn_users(uid,active) VALUES(?,?)',args:[OWNER,'adminws']},
  {sql:'INSERT INTO mn_workspaces(id,uid,kind,name,created) VALUES(?,?,?,?,?)',args:['ws111','111','personal','Shaxsiy','2026-11-01']},
  {sql:'INSERT INTO mn_workspaces(id,uid,kind,name,created) VALUES(?,?,?,?,?)',args:['ws222','222','personal','Shaxsiy','2026-11-01']},
  {sql:'INSERT INTO mn_workspaces(id,uid,kind,name,created) VALUES(?,?,?,?,?)',args:['adminws',OWNER,'personal','Shaxsiy','2026-11-01']},
  {sql:'INSERT INTO mn_transactions(id,uid,workspace_id,update_id,kind,category,amount,note,day,created) VALUES(?,?,?,?,?,?,?,?,?,?)',
   args:['tx1','111','ws111',1,'expense','Boshqa',1357911,'private-secret-note','2026-11-15','2026-11-15']}
 ],'write');
 const api=makeFinanceApi({db,botToken:'123:TEST_TOKEN',ensure:async()=>{}});
 await api.init();
 let memberStatus='administrator',botStatus='administrator';
 const telegram=async(method,args)=>{
  methods.push({method,args});
  if(method==='getChatMember')return {status:args.user_id===999?botStatus:memberStatus};
  if(method==='getMe')return {id:999};
  if(method==='sendPhoto')return {message_id:1};
  throw Error('Unexpected method '+method);
 };
 const send=async(chat_id,text,extra={})=>{sent.push({chat_id:String(chat_id),text,extra});return {message_id:1};};
 const bot=createCommunityBot({db,telegram,send,answerCallback:async()=>{},isAdmin:uid=>String(uid)===OWNER,inviteUrl:'https://t.me/+KIigYjm1EUIzOWEy'});
 await bot.init();
 return {db,bot,sent,methods,setMemberStatus:x=>memberStatus=x,setBotStatus:x=>botStatus=x};
}
const group=(uid,text='/ulash')=>({chat:{type:'supergroup',id:-10098765},from:{id:Number(uid)},text});
const message=(uid,text,more={})=>({chat:{type:'private',id:Number(uid)},from:{id:Number(uid)},text,...more});
const callback=(id,act)=>'cm:d:'+id+':'+act;
async function drafts(db){
 return (await db.execute({sql:'SELECT * FROM mn_notice_drafts ORDER BY created_at'})).rows;
}
test('group invite is valid but not a group ID; only configured owner and group admin can bind',async()=>{
 const {db,bot,sent,setMemberStatus,setBotStatus}=await fixture();
 assert.equal(validInvite('https://t.me/+KIigYjm1EUIzOWEy'),true);
 assert.equal(await bot.groupId(),'');
 await bot.handleGroupMessage(group('222'));
 assert.equal(await bot.groupId(),'');
 setMemberStatus('member');
 await bot.handleGroupMessage(group(OWNER));
 assert.equal(await bot.groupId(),'');
 setMemberStatus('administrator');setBotStatus('member');
 await bot.handleGroupMessage(group(OWNER));
 assert.equal(await bot.groupId(),'');
 setBotStatus('administrator');
 await bot.handleGroupMessage(group(OWNER));
 assert.equal(await bot.groupId(),'-10098765');
 assert.ok(sent.at(-1).text.includes('ulandi'));
 await bot.handlePrivateMessage(message('111','/guruh'));
 assert.equal(sent.at(-1).extra.reply_markup.inline_keyboard[0][0].url,'https://t.me/+KIigYjm1EUIzOWEy');
 db.close();
});
test('updates and promotions require separate explicit opt-in; outsiders cannot create ads',async()=>{
 const {db,bot,sent}=await fixture();
 assert.deepEqual(await bot.preferences('111'),{updates:false,promotions:false});
 await bot.handleCallback('111','cm:opt:updates:on','cb');
 assert.deepEqual(await bot.preferences('111'),{updates:true,promotions:false});
 await bot.handleCallback('111','cm:opt:promotions:on','cb');
 assert.deepEqual(await bot.preferences('111'),{updates:true,promotions:true});
 await bot.handleCallback('111','cm:opt:promotions:off','cb');
 assert.deepEqual(await bot.preferences('111'),{updates:true,promotions:false});
 assert.equal(await bot.handlePrivateMessage(message('111','/elon Bad ad')),false);
 assert.equal((await drafts(db)).length,0);
 await bot.handleCallback('111','cm:optmenu','cb');
 assert.ok(sent.at(-1).text.includes('Reklama'));
 db.close();
});
test('admin previews image, then consent-scope sends once to group and opted-in subscribers',async()=>{
 const {db,bot,sent,methods}=await fixture();
 await bot.handleGroupMessage(group(OWNER));
 await bot.setPreference('111','updates',true);
 await bot.setPreference('222','promotions',true);
 const photo={photo:[{file_id:'small'},{file_id:'large'}],reply_to_message:undefined,caption:'/elon Yangi imkoniyat!'};
 await bot.handlePrivateMessage(message(OWNER,undefined,photo));
 const d=(await drafts(db))[0];
 assert.equal(d.photo_id,'large');
 assert.equal(d.kind,'update');
 assert.equal(d.audience,'group');
 assert.ok(methods.some(x=>x.method==='sendPhoto'&&x.args.chat_id===Number(OWNER)));
 await bot.handleCallback(OWNER,callback(d.id,'ab'),'cb');
 const before=sent.length;
 await bot.handleCallback(OWNER,callback(d.id,'send'),'cb');
 await bot.handleCallback(OWNER,callback(d.id,'send'),'cb');
 await bot.processQueue();
 const rows=(await db.execute({sql:'SELECT target,status FROM mn_notice_outbox WHERE notice_id=? ORDER BY target',args:[d.id]})).rows;
 assert.deepEqual(rows.map(x=>x.target),['g:-10098765','u:111']);
 assert.ok(rows.every(x=>x.status==='sent'));
 assert.ok(methods.some(x=>x.method==='sendPhoto'&&x.args.chat_id==='-10098765'));
 assert.ok(methods.some(x=>x.method==='sendPhoto'&&x.args.chat_id==='111'));
 assert.ok(!methods.some(x=>x.method==='sendPhoto'&&x.args.chat_id==='222'));
 assert.ok(sent.slice(before).every(x=>!x.text.includes('private-secret-note')&&!x.text.includes('1357911')));
 db.close();
});
test('promotion goes only to promotion subscribers; old callbacks cannot re-publish',async()=>{
 const {db,bot,sent}=await fixture();
 await bot.setPreference('111','updates',true);
 await bot.setPreference('222','promotions',true);
 await bot.handlePrivateMessage(message(OWNER,'/elon Maxsus taklif'));
 const d=(await drafts(db))[0];
 await bot.handleCallback(OWNER,callback(d.id,'kp'),'cb');
 await bot.handleCallback(OWNER,callback(d.id,'au'),'cb');
 await bot.handleCallback(OWNER,callback(d.id,'send'),'cb');
 await bot.processQueue();
 const targets=(await db.execute({sql:'SELECT target FROM mn_notice_outbox WHERE notice_id=?',args:[d.id]})).rows.map(x=>x.target);
 assert.deepEqual(targets,['u:222']);
 await bot.handleCallback(OWNER,callback(d.id,'send'),'cb');
 assert.equal((await db.execute({sql:'SELECT COUNT(*) AS n FROM mn_notice_outbox WHERE notice_id=?',args:[d.id]})).rows[0].n,1);
 assert.ok(sent.at(-1).text.includes('allaqachon'));
 db.close();
});
test('interrupted sending is never resent blindly; complete account erasure removes opt-ins',async()=>{
 const {db,bot}=await fixture();
 await bot.setPreference('111','updates',true);
 await bot.handlePrivateMessage(message(OWNER,'/elon Xabar'));
 const d=(await drafts(db))[0];
 await bot.handleCallback(OWNER,callback(d.id,'au'),'cb');
 await bot.handleCallback(OWNER,callback(d.id,'send'),'cb');
 await db.execute({sql:"UPDATE mn_notice_outbox SET status='sending' WHERE notice_id=?",args:[d.id]});
 await bot.processQueue();
 assert.equal((await db.execute({sql:'SELECT status FROM mn_notice_outbox WHERE notice_id=?',args:[d.id]})).rows[0].status,'sending');
 await erase(db,'111',{confirm:CONFIRM,telegram_id:'111',workspace_count:1});
 assert.deepEqual(await bot.preferences('111'),{updates:false,promotions:false});
 assert.equal((await db.execute({sql:"SELECT COUNT(*) AS n FROM mn_notice_outbox WHERE target='u:111'"})).rows[0].n,0);
 assert.equal((await db.execute({sql:"SELECT COUNT(*) AS n FROM mn_transactions WHERE uid='111'"})).rows[0].n,0);
 db.close();
});
