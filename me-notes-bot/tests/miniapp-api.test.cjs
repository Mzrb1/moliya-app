'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createHmac}=require('node:crypto');
const {createClient}=require('@libsql/client');
const {validateInitData}=require('../miniapp-auth.cjs');
const {makeFinanceApi,prepareEntries,updateId}=require('../miniapp-api.cjs');

const TOKEN='123456:FAKE_TOKEN_ONLY_FOR_UNIT_TESTS';
function makeSigned(uid=12345,authDate=Math.floor(Date.now()/1000)){
 const user=JSON.stringify({id:uid,first_name:'Unit Test'});
 const fields=new URLSearchParams({auth_date:String(authDate),user});
 const payload=[...fields].map(([k,v])=>k+'='+v).sort().join('\n');
 const secret=createHmac('sha256','WebAppData').update(TOKEN).digest();
 fields.set('hash',createHmac('sha256',secret).update(payload).digest('hex'));
 return fields.toString();
}
async function freshDb(){
 const db=createClient({url:':memory:'});
 await db.batch([
  'CREATE TABLE mn_users(uid TEXT PRIMARY KEY, active TEXT)',
  'CREATE TABLE mn_workspaces(id TEXT PRIMARY KEY, uid TEXT NOT NULL, kind TEXT NOT NULL, name TEXT NOT NULL, created TEXT NOT NULL)',
  'CREATE TABLE mn_transactions(id TEXT PRIMARY KEY, uid TEXT NOT NULL,workspace_id TEXT NOT NULL,update_id INTEGER NOT NULL UNIQUE,kind TEXT NOT NULL,category TEXT NOT NULL,amount INTEGER NOT NULL CHECK(amount>0),note TEXT,day TEXT NOT NULL,created TEXT NOT NULL)',
  'CREATE TABLE mn_budgets(workspace_id TEXT NOT NULL,month TEXT NOT NULL,category TEXT NOT NULL,limit_amount INTEGER NOT NULL CHECK(limit_amount>=0),PRIMARY KEY(workspace_id,month,category))',
  {sql:'INSERT INTO mn_users(uid,active) VALUES(?,?)',args:['111','personal-111']},
  {sql:'INSERT INTO mn_workspaces(id,uid,kind,name,created) VALUES(?,?,?,?,?)',args:['personal-111','111','personal','Shaxsiy','2026-11-13']},
  {sql:'INSERT INTO mn_users(uid,active) VALUES(?,?)',args:['222','personal-222']},
  {sql:'INSERT INTO mn_workspaces(id,uid,kind,name,created) VALUES(?,?,?,?,?)',args:['personal-222','222','personal','Begona','2026-11-13']}
 ],'write');
 const api=makeFinanceApi({db,botToken:TOKEN,ensure:async()=>{}});
 await api.init();
 return {db,api};
}
test('Telegram haqiqiy signed initData o‘tadi',()=>{
 assert.equal(validateInitData(makeSigned(),TOKEN).uid,'12345');
});
test('Telegram foydalanuvchi ID ni almashtirib bo‘lmaydi',()=>{
 const signed=makeSigned(),forged=signed.replace('12345','99999');
 assert.throws(()=>validateInitData(forged,TOKEN));
});
test('Telegram boshqa bot tokenini qabul qilmaydi',()=>assert.throws(()=>validateInitData(makeSigned(),'OTHER_TOKEN')));
test('Eski sessiya bloklanadi',()=>assert.throws(()=>validateInitData(makeSigned(123,Math.floor(Date.now()/1000)-172800),TOKEN)));
test('Imzosiz so‘rov rad qilinadi',()=>assert.throws(()=>validateInitData('user=123&auth_date=1',TOKEN)));
test('Takroriy imzolangan maydonlar rad qilinadi',()=>assert.throws(()=>validateInitData(makeSigned()+'&user=oops',TOKEN)));
test('Brauzerdan yuborilgan kirimlar tekshiriladi',()=>{
 assert.equal(prepareEntries([{kind:'expense',date:'2026-11-13',amount:25000,note:"yo‘lga"}],'personal')[0].category,'Transport');
 assert.throws(()=>prepareEntries([{kind:'expense',date:'2026-11-13',amount:-1,note:'yo‘lga'}],'personal'));
 assert.throws(()=>prepareEntries([{kind:'expense',date:'2026-11-13',amount:10,category:'xaker',note:'yo‘lga'}],'personal'));
});
test('Har bir offline amal va qator IDi takrorlanmaydi',()=>{
 const ids=new Set(Array.from({length:20},(_,i)=>updateId('web_AAAAAAA00001',i)));
 assert.equal(ids.size,20);
 assert.ok([...ids].every(Number.isSafeInteger));
});
test('Yozuv bir marta saqlanadi, API retry duplicate qilmaydi',async()=>{
 const {db,api}=await freshDb();
 const op={op_id:'web_aaaaaaaa00001',workspace_id:'personal-111',action:'add',entry:{kind:'expense',amount:25000,date:'2026-11-13',note:'taksi'}};
 assert.equal((await api.execute('111',op)).saved,1);
 assert.equal((await api.execute('111',op)).already,true);
 const report=await api.ledger('111','personal-111','2026-11');
 assert.equal(report.totals.expense,25000);
 assert.equal(report.transactions.length,1);
 db.close();
});
test('Chat bilan bitta Turso jadvali ishlatiladi',async()=>{
 const {db,api}=await freshDb();
 await db.execute({sql:'INSERT INTO mn_transactions(id,uid,workspace_id,update_id,kind,category,amount,note,day,created) VALUES(?,?,?,?,?,?,?,?,?,?)',
  args:['chat-1','111','personal-111',9000000,'expense','Transport',18000,'yo‘lga','2026-11-13','2026-11-13']});
 await api.execute('111',{op_id:'web_aaaaaaaa00002',workspace_id:'personal-111',action:'add',entry:{kind:'expense',amount:98000,date:'2026-11-13',note:'tushlik'}});
 const report=await api.ledger('111','personal-111','2026-11');
 assert.equal(report.totals.expense,116000);
 assert.equal(report.transactions.length,2);
 db.close();
});
test('Begona foydalanuvchining hisobi ko‘rinmaydi',async()=>{
 const {db,api}=await freshDb();
 await assert.rejects(()=>api.ledger('222','personal-111','2026-11'));
 await assert.rejects(()=>api.execute('222',{op_id:'web_aaaaaaaa00003',workspace_id:'personal-111',action:'add',entry:{kind:'expense',amount:1,date:'2026-11-13',note:'test'}}));
 db.close();
});
test('Ro‘yxat 2 xarajat atomik saqlanadi',async()=>{
 const {db,api}=await freshDb();
 const op={op_id:'web_aaaaaaaa00004',workspace_id:'personal-111',action:'add_many',entries:[
  {kind:'expense',amount:18000,date:'2026-11-13',note:'yo‘lga'},
  {kind:'expense',amount:98000,date:'2026-11-13',note:'tushlik'}
 ]};
 await api.execute('111',op);
 assert.equal((await api.ledger('111','personal-111','2026-11')).totals.expense,116000);
 await api.execute('111',op);
 assert.equal((await api.ledger('111','personal-111','2026-11')).transactions.length,2);
 db.close();
});
test('Xato qatordan hech bir ro‘yxat yozuvi saqlanmaydi',async()=>{
 const {db,api}=await freshDb();
 await assert.rejects(()=>api.execute('111',{op_id:'web_aaaaaaaa00005',workspace_id:'personal-111',action:'add_many',entries:[
  {kind:'expense',amount:18000,date:'2026-11-13',note:'yo‘lga'},
  {kind:'expense',amount:0,date:'2026-11-13',note:'noto‘g‘ri'}]}));
 assert.equal((await api.ledger('111','personal-111','2026-11')).transactions.length,0);
 db.close();
});
test('Qat’iy limit chat jadvaliga yoziladi',async()=>{
 const {db,api}=await freshDb();
 await api.execute('111',{op_id:'web_aaaaaaaa00006',workspace_id:'personal-111',action:'budget',month:'2026-11',category:'Transport',limit:200000});
 const report=await api.ledger('111','personal-111','2026-11');
 assert.equal(report.budgets.Transport,200000);
 db.close();
});
test('Eski yozuvlarni import qilish qayta yuborilganda ikki marta yozmaydi',async()=>{
 const {db,api}=await freshDb();
 const entry={source_id:'oldtx1',date:'2026-11-13',kind:'expense',amount:120000,category:'Transport',note:'taksi'};
 await api.execute('111',{op_id:'web_aaaaaaaa00007',workspace_id:'personal-111',action:'import',source_workspace:'legacy1',source_kind:'personal',entries:[entry]});
 await api.execute('111',{op_id:'web_aaaaaaaa00008',workspace_id:'personal-111',action:'import',source_workspace:'legacy1',source_kind:'personal',entries:[entry]});
 assert.equal((await api.ledger('111','personal-111','2026-11')).totals.expense,120000);
 db.close();
});
test('Import boshqa hisob turiga o‘tmaydi',async()=>{
 const {db,api}=await freshDb();
 await assert.rejects(()=>api.execute('111',{op_id:'web_aaaaaaaa00009',workspace_id:'personal-111',action:'import',source_workspace:'legacy1',source_kind:'family',
 entries:[{source_id:'oldtx1',date:'2026-11-13',kind:'expense',amount:120000,category:'Transport',note:'taksi'}]}));
 db.close();
});
test('Importdagi original kategoriya mos bo‘lmasa izohda saqlanadi',async()=>{
 const {db,api}=await freshDb();
 await api.execute('111',{op_id:'web_aaaaaaaa00010',workspace_id:'personal-111',action:'import',source_workspace:'legacy1',source_kind:'personal',
 entries:[{source_id:'oldtx2',date:'2026-11-13',kind:'expense',amount:50000,category:'Bolalar',note:'pampers'}]});
 const r=await api.ledger('111','personal-111','2026-11');
 assert.equal(r.transactions[0].category,'Boshqa');
 assert.match(r.transactions[0].note,/Bolalar/);
 db.close();
});
test('O‘chirish qayta yuborilsa yozuv qayta paydo bo‘lmaydi',async()=>{
 const {db,api}=await freshDb();
 await api.execute('111',{op_id:'web_aaaaaaaa00011',workspace_id:'personal-111',action:'add',entry:{kind:'expense',amount:100,date:'2026-11-13',note:'non'}});
 const report=await api.ledger('111','personal-111','2026-11');
 const del={op_id:'web_aaaaaaaa00012',workspace_id:'personal-111',action:'delete',transaction_id:report.transactions[0].id};
 await api.execute('111',del);
 await api.execute('111',del);
 assert.equal((await api.ledger('111','personal-111','2026-11')).transactions.length,0);
 db.close();
});
