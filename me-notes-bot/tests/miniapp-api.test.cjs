'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createHmac}=require('node:crypto');
const {createClient}=require('@libsql/client');
const {validateInitData}=require('../miniapp-auth.cjs');
const {makeFinanceApi,prepareEntries,updateId}=require('../miniapp-api.cjs');

const TOKEN='123456:FAKE_TOKEN_ONLY_FOR_UNIT_TESTS';
function makeSigned(uid=12345,authDate=Math.floor(Date.now()/1000),withSignature=false){
 const user=JSON.stringify({id:uid,first_name:'Unit Test'});
 const fields=new URLSearchParams({auth_date:String(authDate),user});
 if(withSignature)fields.set('signature','telegram-signed-data-for-test_only');
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
test('Modern Telegram initData with signature is accepted by bot-token HMAC',()=>{
 assert.equal(validateInitData(makeSigned(12345,Math.floor(Date.now()/1000),true),TOKEN).uid,'12345');
});
test('Changing Telegram signature field invalidates HMAC',()=>{
 const signed=makeSigned(12345,Math.floor(Date.now()/1000),true);
 assert.throws(()=>validateInitData(signed.replace('telegram-signed-data-for-test_only','tampered-value'),TOKEN));
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
 entries:[{source_id:'oldtx2',date:'2026-11-13',kind:'expense',amount:50000,category:'Uy hayvonlari',note:'mushuk yemagi'}]});
 const r=await api.ledger('111','personal-111','2026-11');
 assert.equal(r.transactions[0].category,'Boshqa');
 assert.match(r.transactions[0].note,/Uy hayvonlari/);
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


test('Mini App custom categories are stored separately per account',async()=>{
 const {db,api}=await freshDb();
 const op={op_id:'web_custom_category_00001',workspace_id:'personal-111',action:'category_add',kind:'expense',name:'Uy hayvonlari'};
 await api.execute('111',op);
 assert.equal((await api.execute('111',op)).already,true);
 const a=await api.ledger('111','personal-111','2026-11');
 const b=await api.ledger('222','personal-222','2026-11');
 assert.ok(a.category_options.expense.includes('Uy hayvonlari'));
 assert.ok(!b.category_options.expense.includes('Uy hayvonlari'));
 db.close();
});
test('Custom keyword controls automatic chat category selection',async()=>{
 const {db,api}=await freshDb();
 const wid='personal-111';
 await api.execute('111',{op_id:'web_custom_keyword_00001',workspace_id:wid,action:'category_add',kind:'expense',name:'Uy hayvonlari'});
 await api.execute('111',{op_id:'web_custom_keyword_00002',workspace_id:wid,action:'keyword_add',kind:'expense',category:'Uy hayvonlari',word:'mushuk'});
 const prefs=await api.preferences({id:wid,kind:'personal'});
 const F=require('../../me-notes-sahifalab/finance-core.js');
 assert.equal(F.categoryFor({categories:prefs.categories,keywords:prefs.keywords},'expense','mushukka'), 'Uy hayvonlari');
 await api.execute('111',{op_id:'web_custom_keyword_00003',workspace_id:wid,action:'keyword_delete',kind:'expense',category:'Uy hayvonlari',word:'mushuk'});
 const after=await api.preferences({id:wid,kind:'personal'});
 assert.equal(after.keywords.expense['Uy hayvonlari']?.length||0,0);
 db.close();
});
test('Duplicate keyword for a different category is rejected',async()=>{
 const {db,api}=await freshDb();
 await api.execute('111',{op_id:'web_kw_unique_00001',workspace_id:'personal-111',action:'keyword_add',kind:'expense',category:'Transport',word:'mytrip'});
 await assert.rejects(()=>api.execute('111',{op_id:'web_kw_unique_00002',workspace_id:'personal-111',action:'keyword_add',kind:'expense',category:'Oziq-ovqat',word:'mytrip'}));
 db.close();
});
test('Edit transaction updates amount, category and date without creating duplicate row',async()=>{
 const {db,api}=await freshDb();
 await api.execute('111',{op_id:'web_edit_transaction_00001',workspace_id:'personal-111',action:'add',entry:{kind:'expense',amount:98000,date:'2026-11-13',note:'Tushlik'}});
 const prior=await api.ledger('111','personal-111','2026-11');
 const tx=prior.transactions[0];
 const op={op_id:'web_edit_transaction_00002',workspace_id:'personal-111',action:'edit',transaction_id:tx.id,
  entry:{kind:'expense',amount:18000,category:'Transport',date:'2026-11-14',note:'yo‘lga'}};
 assert.equal((await api.execute('111',op)).updated,1);
 assert.equal((await api.execute('111',op)).already,true);
 const after=await api.ledger('111','personal-111','2026-11');
 assert.equal(after.transactions.length,1);
 assert.equal(after.transactions[0].id,tx.id);
 assert.equal(after.transactions[0].amount,18000);
 assert.equal(after.transactions[0].category,'Transport');
 assert.equal(after.transactions[0].date,'2026-11-14');
 db.close();
});
test('Editing another person transaction cannot alter it',async()=>{
 const {db,api}=await freshDb();
 await api.execute('111',{op_id:'web_edit_ownership_001',workspace_id:'personal-111',action:'add',entry:{kind:'expense',amount:98000,date:'2026-11-13',note:'Tushlik'}});
 const tx=(await api.ledger('111','personal-111','2026-11')).transactions[0];
 await assert.rejects(()=>api.execute('222',{op_id:'web_edit_ownership_002',workspace_id:'personal-222',action:'edit',transaction_id:tx.id,entry:{amount:1}}));
 assert.equal((await api.ledger('111','personal-111','2026-11')).totals.expense,98000);
 db.close();
});
test('Built-in categories cannot be deleted',async()=>{
 const {db,api}=await freshDb();
 await assert.rejects(()=>api.execute('111',{op_id:'web_delete_default_001',workspace_id:'personal-111',action:'category_delete',kind:'expense',name:'Transport'}));
 db.close();
});
test('Used extra category cannot be deleted or orphan existing rows',async()=>{
 const {db,api}=await freshDb();
 const wid='personal-111';
 await api.execute('111',{op_id:'web_add_extra_category_001',workspace_id:wid,action:'category_add',kind:'expense',name:'Uy hayvonlari'});
 await api.execute('111',{op_id:'web_add_extra_tx_00001',workspace_id:wid,action:'add',entry:{kind:'expense',amount:13000,date:'2026-11-13',category:'Uy hayvonlari',note:'mushuk yemagi'}});
 await assert.rejects(()=>api.execute('111',{op_id:'web_delete_extra_cat_001',workspace_id:wid,action:'category_delete',kind:'expense',name:'Uy hayvonlari'}));
 assert.equal((await api.ledger('111',wid,'2026-11')).totals.expense,13000);
 db.close();
});
test('Custom categories still honor monthly fixed limits',async()=>{
 const {db,api}=await freshDb();
 const wid='personal-111';
 await api.execute('111',{op_id:'web_add_custom_cat_001',workspace_id:wid,action:'category_add',kind:'expense',name:'Uy hayvonlari'});
 await api.execute('111',{op_id:'web_add_custom_budget_001',workspace_id:wid,action:'budget',month:'2026-11',category:'Uy hayvonlari',limit:25000});
 const ledger=await api.ledger('111',wid,'2026-11');
 assert.equal(ledger.categories.find(x=>x.category==='Uy hayvonlari').limit,25000);
 db.close();
});


test('Monthly history separates October and November for one user',async()=>{
 const {db,api}=await freshDb();
 await api.execute('111',{op_id:'web_months_one_00001',workspace_id:'personal-111',action:'add',entry:{kind:'income',amount:50000,date:'2026-10-31',note:'October salary',category:'Maosh'}});
 await api.execute('111',{op_id:'web_months_two_00002',workspace_id:'personal-111',action:'add',entry:{kind:'expense',amount:8000,date:'2026-11-01',note:'taksi'}});
 const october=await api.ledger('111','personal-111','2026-10');
 const november=await api.ledger('111','personal-111','2026-11');
 assert.equal(october.totals.income,50000);
 assert.equal(october.totals.expense,0);
 assert.equal(november.totals.income,0);
 assert.equal(november.totals.expense,8000);
 const months=await api.monthHistory('111','personal-111');
 assert.equal(months.find(m=>m.month==='2026-10').count,1);
 assert.equal(months.find(m=>m.month==='2026-11').count,1);
 assert.ok(!((await api.monthHistory('222','personal-222')).some(m=>m.month==='2026-10')));
 db.close();
});
test('Closing a past month preserves rows and makes them read-only',async()=>{
 const {db,api}=await freshDb();
 const wid='personal-111',month='2026-10';
 await api.execute('111',{op_id:'web_archived_add_001',workspace_id:wid,action:'add',
  entry:{kind:'expense',amount:55000,date:'2026-10-21',note:'bozorga'}});
 const tx=(await api.ledger('111',wid,month)).transactions[0];
 const archive={op_id:'web_month_close_001',workspace_id:wid,action:'month_close',month};
 await api.execute('111',archive);
 assert.equal((await api.execute('111',archive)).already,true);
 const ledger=await api.ledger('111',wid,month);
 assert.equal(ledger.totals.expense,55000);
 assert.ok(ledger.closed_at);
 await assert.rejects(()=>api.execute('111',{op_id:'web_archived_add_002',workspace_id:wid,action:'add',entry:{kind:'expense',amount:100,date:'2026-10-21',note:'non'}}),/arxivlangan/);
 await assert.rejects(()=>api.execute('111',{op_id:'web_archived_edit_003',workspace_id:wid,action:'edit',transaction_id:tx.id,entry:{amount:1000}}),/arxivlangan/);
 await assert.rejects(()=>api.execute('111',{op_id:'web_archived_del_004',workspace_id:wid,action:'delete',transaction_id:tx.id}),/arxivlangan/);
 await assert.rejects(()=>api.execute('111',{op_id:'web_archived_budget_005',workspace_id:wid,action:'budget',month,category:'Transport',limit:200000}),/arxivlangan/);
 const newer=await api.execute('111',{op_id:'web_new_month_ok_006',workspace_id:wid,action:'add',
  entry:{kind:'expense',amount:7000,date:'2026-11-01',note:'taksi'}});
 assert.equal(newer.saved,1);
 assert.equal((await api.ledger('111',wid,'2026-11')).totals.expense,7000);
 const backup=await api.exportMonth('111',wid,month);
 assert.equal(backup.transactions.length,1);
 assert.equal(backup.totals.expense,55000);
 assert.ok(backup.closed_at);
 db.close();
});
test('Reopen archived month allows editing without altering another month',async()=>{
 const {db,api}=await freshDb();
 const wid='personal-111';
 await api.execute('111',{op_id:'web_reopen_close_001',workspace_id:wid,action:'month_close',month:'2026-10'});
 assert.ok((await api.ledger('111',wid,'2026-10')).closed_at);
 await api.execute('111',{op_id:'web_reopen_action_001',workspace_id:wid,action:'month_reopen',month:'2026-10'});
 assert.equal((await api.ledger('111',wid,'2026-10')).closed_at,null);
 const r=await api.execute('111',{op_id:'web_reopen_insert_001',workspace_id:wid,action:'add',
  entry:{kind:'expense',amount:11000,date:'2026-10-02',note:'yo‘lga'}});
 assert.equal(r.saved,1);
 assert.equal((await api.ledger('111',wid,'2026-11')).transactions.length,0);
 db.close();
});
test('Current month cannot be accidentally closed',async()=>{
 const {db,api}=await freshDb();
 const F=require('../../me-notes-sahifalab/finance-core.js');
 await assert.rejects(()=>api.execute('111',{op_id:'web_close_current_001',workspace_id:'personal-111',action:'month_close',month:F.today().slice(0,7)}),/Faqat tugagan/);
 db.close();
});
test('Archived month cannot be changed through old offline import',async()=>{
 const {db,api}=await freshDb();
 await api.execute('111',{op_id:'web_import_close_001',workspace_id:'personal-111',action:'month_close',month:'2026-10'});
 await assert.rejects(()=>api.execute('111',{op_id:'web_import_closed_002',workspace_id:'personal-111',action:'import',source_workspace:'old_my_personal',source_kind:'personal',
  entries:[{source_id:'old002',kind:'expense',amount:99000,date:'2026-10-10',category:'Transport',note:'taksi'}]}),/arxivlangan/);
 assert.equal((await api.ledger('111','personal-111','2026-10')).transactions.length,0);
 db.close();
});
test('An attacker cannot archive or export another user workspace',async()=>{
 const {db,api}=await freshDb();
 await assert.rejects(()=>api.execute('222',{op_id:'web_cross_user_close_001',workspace_id:'personal-111',action:'month_close',month:'2026-10'}));
 await assert.rejects(()=>api.exportMonth('222','personal-111','2026-10'));
 await assert.rejects(()=>api.monthHistory('222','personal-111'));
 db.close();
});
test('Monthly cloud backup includes budgets and month metadata',async()=>{
 const {db,api}=await freshDb();
 await api.execute('111',{op_id:'web_export_budget_001',workspace_id:'personal-111',action:'budget',month:'2026-10',category:'Transport',limit:140000});
 const exported=await api.exportMonth('111','personal-111','2026-10');
 assert.equal(exported.format,'me-notes-finance-month-v1');
 assert.equal(exported.month,'2026-10');
 assert.equal(exported.budgets.Transport,140000);
 assert.equal(exported.workspace.kind,'personal');
 db.close();
});


test('Tanlangan oy testi bir operatsiyada zaxiralanib tozalanadi, oylik maosh ham',async()=>{
 const {db,api}=await freshDb(),wid='personal-111';
 await api.execute('111',{op_id:'web_reset_add_salary_0001',workspace_id:wid,action:'add',entry:{kind:'income',amount:5600000,category:'Maosh',date:'2026-11-13',note:'test maosh'}});
 await api.execute('111',{op_id:'web_reset_add_taxi_00002',workspace_id:wid,action:'add',entry:{kind:'expense',amount:18000,date:'2026-11-13',note:'yo‘lga'}});
 await api.execute('111',{op_id:'web_reset_add_oct_00003',workspace_id:wid,action:'add',entry:{kind:'expense',amount:12000,date:'2026-10-13',note:'taksi'}});
 await api.execute('111',{op_id:'web_reset_budget_00004',workspace_id:wid,action:'budget',month:'2026-11',category:'Transport',limit:200000});
 const op={op_id:'web_reset_month_00005',workspace_id:wid,action:'month_clear',month:'2026-11',include_budgets:true,confirm:'TOZALA'};
 const cleared=await api.execute('111',op);
 assert.equal(cleared.cleared,2);
 assert.equal(cleared.cleared_budgets,1);
 assert.equal((await api.execute('111',op)).already,true);
 const now=await api.ledger('111',wid,'2026-11');
 assert.equal(now.totals.income,0);
 assert.equal(now.totals.expense,0);
 assert.deepEqual(now.budgets,{});
 assert.equal(now.reset_backup.count,2);
 assert.equal(now.reset_backup.income,5600000);
 assert.equal((await api.ledger('111',wid,'2026-10')).totals.expense,12000);
 assert.equal((await api.ledger('222','personal-222','2026-11')).reset_backup,null);
 db.close();
});
test('Tozalashdan so‘ng asl IDlar, daromad va limitlar qayta tiklanadi',async()=>{
 const {db,api}=await freshDb(),wid='personal-111';
 await api.execute('111',{op_id:'web_clean_salary_00001',workspace_id:wid,action:'add',entry:{kind:'income',amount:5000000,category:'Maosh',date:'2026-11-13',note:'test'}});
 await api.execute('111',{op_id:'web_clean_budget_00001',workspace_id:wid,action:'budget',month:'2026-11',category:'Transport',limit:300000});
 const id=(await api.ledger('111',wid,'2026-11')).transactions[0].id;
 await api.execute('111',{op_id:'web_clean_month_00001',workspace_id:wid,action:'month_clear',month:'2026-11',include_budgets:true,confirm:'TOZALA'});
 const restored=await api.execute('111',{op_id:'web_clean_restore_0001',workspace_id:wid,action:'month_unclear',month:'2026-11',confirm:'TIKLA'});
 assert.equal(restored.restored,1);
 assert.equal(restored.restored_budgets,1);
 const after=await api.ledger('111',wid,'2026-11');
 assert.equal(after.transactions[0].id,id);
 assert.equal(after.totals.income,5000000);
 assert.equal(after.budgets.Transport,300000);
 assert.equal(after.reset_backup,null);
 db.close();
});
test('Tasdiqsiz va begona hisobda oy tozalash rad etiladi',async()=>{
 const {db,api}=await freshDb(),wid='personal-111';
 await assert.rejects(()=>api.execute('111',{op_id:'web_missing_confirm_1',workspace_id:wid,action:'month_clear',month:'2026-11',include_budgets:true}),/tasdiq/);
 await assert.rejects(()=>api.execute('222',{op_id:'web_wrong_user_0001',workspace_id:wid,action:'month_clear',month:'2026-11',include_budgets:true,confirm:'TOZALA'}));
 db.close();
});
test('Tozalashdan so‘ng yangi real yozuv bor oyga zaxirani ko‘r-ko‘rona tiklamaydi',async()=>{
 const {db,api}=await freshDb(),wid='personal-111';
 await api.execute('111',{op_id:'web_reset_existing_0001',workspace_id:wid,action:'add',entry:{kind:'expense',amount:10000,date:'2026-11-13',note:'taksi'}});
 await api.execute('111',{op_id:'web_reset_first_00001',workspace_id:wid,action:'month_clear',month:'2026-11',include_budgets:false,confirm:'TOZALA'});
 await api.execute('111',{op_id:'web_reset_new_real_001',workspace_id:wid,action:'add',entry:{kind:'expense',amount:20000,date:'2026-11-14',note:'non'}});
 await assert.rejects(()=>api.execute('111',{op_id:'web_reset_restore_no_1',workspace_id:wid,action:'month_unclear',month:'2026-11',confirm:'TIKLA'}),/xavfsizligi/);
 assert.equal((await api.ledger('111',wid,'2026-11')).totals.expense,20000);
 await assert.rejects(()=>api.execute('111',{op_id:'web_reset_again_00111',workspace_id:wid,action:'month_clear',month:'2026-11',include_budgets:false,confirm:'TOZALA'}),/oldingi tozalash/);
 db.close();
});
test('Arxivlangan oy tozalanmaydi va tarixga tegilmaydi',async()=>{
 const {db,api}=await freshDb(),wid='personal-111';
 await api.execute('111',{op_id:'web_restrict_oct_close',workspace_id:wid,action:'month_close',month:'2026-10'});
 await assert.rejects(()=>api.execute('111',{op_id:'web_restrict_oct_reset',workspace_id:wid,action:'month_clear',month:'2026-10',include_budgets:false,confirm:'TOZALA'}),/arxivlangan/);
 db.close();
});
