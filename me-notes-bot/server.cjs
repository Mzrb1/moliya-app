'use strict';
// ME Notes: Telegram chat backend (separate from Sahifalab lesson data).
// Secrets required at runtime: BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET,
// TURSO_DATABASE_URL, TURSO_AUTH_TOKEN.
const http=require('node:http');
const {randomUUID,timingSafeEqual}=require('node:crypto');
const {createClient}=require('@libsql/client');
const F=require('../me-notes-sahifalab/finance-core.js');
function env(key){const x=process.env[key];if(!x)throw Error('Missing '+key);return x;}
const token=env('BOT_TOKEN');
const secret=env('TELEGRAM_WEBHOOK_SECRET');
const url=env('TURSO_DATABASE_URL');
const authToken=env('TURSO_AUTH_TOKEN');
if(!/^[A-Za-z0-9_-]{1,256}$/.test(secret))throw Error('Invalid webhook secret');
if(!/^(libsql|https):\/\//.test(url))throw Error('Only secure Turso remote URLs supported');
const db=createClient({url,authToken});
const today=()=>F.today(),thisMonth=()=>today().slice(0,7);
const nextMonth=m=>{const [y,n]=m.split('-').map(Number);return (n===12?y+1:y)+'-'+String(n===12?1:n+1).padStart(2,'0');};
async function init(){
 await db.batch([
  "CREATE TABLE IF NOT EXISTS mn_users(uid TEXT PRIMARY KEY, active TEXT)",
  "CREATE TABLE IF NOT EXISTS mn_workspaces(id TEXT PRIMARY KEY, uid TEXT NOT NULL, kind TEXT NOT NULL, name TEXT NOT NULL, created TEXT NOT NULL)",
  "CREATE INDEX IF NOT EXISTS mn_idx_ws_uid ON mn_workspaces(uid)",
  "CREATE TABLE IF NOT EXISTS mn_transactions(id TEXT PRIMARY KEY, uid TEXT NOT NULL, workspace_id TEXT NOT NULL, update_id INTEGER NOT NULL UNIQUE, kind TEXT NOT NULL, category TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount>0), note TEXT, day TEXT NOT NULL, created TEXT NOT NULL)",
  "CREATE INDEX IF NOT EXISTS mn_idx_tx_day ON mn_transactions(workspace_id, day)",
  "CREATE TABLE IF NOT EXISTS mn_budgets(workspace_id TEXT NOT NULL, month TEXT NOT NULL, category TEXT NOT NULL, limit_amount INTEGER NOT NULL CHECK(limit_amount>=0), PRIMARY KEY(workspace_id,month,category))"
 ],'write');
}
async function api(method,params){
 const res=await fetch('https://api.telegram.org/bot'+token+'/'+method,{
  method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(params),
  signal:AbortSignal.timeout(12000)
 });
 const x=await res.json().catch(()=>({ok:false}));
 if(!res.ok||!x.ok)throw Error('Telegram '+method+' status '+res.status);
 return x.result;
}
const send=(chat_id,text,extra={})=>api('sendMessage',{chat_id,text,...extra});
async function ensure(uid){
 uid=String(uid);
 await db.execute({sql:'INSERT OR IGNORE INTO mn_users(uid) VALUES(?)',args:[uid]});
 let q=await db.execute({sql:'SELECT active FROM mn_users WHERE uid=?',args:[uid]});
 if(!q.rows[0]?.active){
  const id=randomUUID();
  await db.batch([
   {sql:'INSERT INTO mn_workspaces(id,uid,kind,name,created) VALUES(?,?,?,?,?)',args:[id,uid,'personal',F.KINDS.personal,new Date().toISOString()]},
   {sql:'UPDATE mn_users SET active=COALESCE(active,?) WHERE uid=?',args:[id,uid]}
  ],'write');
 }
 return uid;
}
async function active(uid){
 const q=await db.execute({sql:'SELECT w.id,w.kind,w.name FROM mn_users u JOIN mn_workspaces w ON u.active=w.id WHERE u.uid=? AND w.uid=?',args:[uid,uid]});
 return q.rows[0];
}
async function choose(uid){
 const q=await db.execute({sql:'SELECT id,kind,name FROM mn_workspaces WHERE uid=? ORDER BY created',args:[uid]});
 return {inline_keyboard:[
  ...q.rows.map(w=>[{text:w.name+' ('+F.KINDS[w.kind]+')',callback_data:'use:'+w.id}]),
  [{text:'➕ Shaxsiy',callback_data:'new:personal'},{text:'➕ Oilaviy',callback_data:'new:family'}],
  [{text:'➕ Biznes',callback_data:'new:business'}]
 ]};
}
const help='📒 ME Notes — tezkor yozuv\n\n25 ming taksi\ntushlik 35000\n+3 mln oylik\n\n'+
 '📁 /hisob — hisobni almashtirish\n📊 /hisobot — oylik natija\n🧮 /taqsimot — oylik pul rejasini ko‘rish\n'+
 '🎯 /limit Transport 100000 — limit\n↩️ /bekor — oxirgi yozuvni bekor qilish\n'+
 'ℹ️ /yordam — yordam\n\n'+
 'Eslatma: chat hisoblari hozircha Mini Appning telefon xotirasi bilan sinxronlanmaydi.';
function checkSecret(input){
 if(typeof input!=='string')return false;
 const a=Buffer.from(input),b=Buffer.from(secret);
 return a.length===b.length&&timingSafeEqual(a,b);
}
// Chatdagi rejalar serverdagi TURSO yozuvlaridan hisoblanadi, Mini App localStorage’dan emas.
async function monthlySalaryPlan(uid,w){
 if(w.kind!=='personal')return null;
 const range=thisMonth();
 const q=await db.execute({sql:"SELECT amount,day FROM mn_transactions WHERE uid=? AND workspace_id=? AND kind='income' AND category='Maosh' AND day>=? AND day<?",
 args:[uid,w.id,range+'-01',nextMonth(range)+'-01']});
 if(!q.rows.length)return null;
 const b=await db.execute({sql:'SELECT category,limit_amount FROM mn_budgets WHERE workspace_id=? AND month=?',args:[w.id,range]});
 const hard=Object.fromEntries(b.rows.map(row=>[row.category,Number(row.limit_amount)]));
 const temp={kind:'personal',categories:F.BASE.personal,transactions:q.rows.map(row=>({kind:'income',category:'Maosh',amount:Number(row.amount),date:String(row.day)})),budgets:{[range]:hard}};
 return F.salaryAllocation(temp,range);
}
function salaryText(plan){
 if(!plan)return 'Hozircha bu oyda shaxsiy hisobga Maosh kategoriyasida daromad kiritilmagan. Misol: +5 mln oylik';
 const f=F.money;
 let text='🧮 Oylik taqsimot ('+plan.month+')\n'+
   '💰 Jami maosh: '+f(plan.salary)+'\n'+
   '🤲 Ehson: '+f(plan.ehson)+'\n'+
   '🌱 Kelajak: '+f(plan.kelajak)+'\n'+
   '🎉 O‘yin-kulgi: '+f(plan.oyin)+'\n'+
   '🏠 Ro‘zg‘or: '+f(plan.rozgor)+'\n'+
   '💼 Biznes: '+f(plan.biznes)+'\n';
 if(plan.hardShortfall>0)text+='\n⚠️ Ro‘zg‘or qat’iy limitlariga '+f(plan.hardShortfall)+' YETMAYDI. Qat’iy limitlar o‘zgarmadi.\n';
 if(plan.leisureShortfall>0)text+='\n⚠️ Dam olish qat’iy limitiga '+f(plan.leisureShortfall)+' YETMAYDI.\n';
 return text+'\nBu haqiqiy pul o‘tkazmasi yoki qo‘shimcha xarajat emas. Mini App hisoblari hozircha chat bilan sinxron emas.';
}

async function handleMessage(update){
 const m=update.message;
 if(!m||m.chat?.type!=='private'||m.chat.id!==m.from?.id||typeof m.text!=='string')return;
 const uid=await ensure(m.from.id),w=await active(uid),chat_id=m.chat.id;
 const text=m.text.trim(),command=text.split(/\s+/)[0].replace(/@[\w]+$/,'').toLowerCase();
 if(command==='/start'){await send(chat_id,'Assalomu alaykum! 👋\n'+help,{reply_markup:await choose(uid)});return;}
 if(command==='/hisob'){await send(chat_id,'Hozirgi hisob: '+w.name+'\nHisobni tanlang:',{reply_markup:await choose(uid)});return;}
 if(command==='/yordam'||command==='/help'){await send(chat_id,help);return;}
 if(command==='/taqsimot'){await send(chat_id,salaryText(await monthlySalaryPlan(uid,w)));return;}
 if(command==='/hisobot'){
  const q=await db.execute({sql:'SELECT kind, SUM(amount) AS total FROM mn_transactions WHERE workspace_id=? AND day>=? AND day<? GROUP BY kind',args:[w.id,thisMonth()+'-01',nextMonth(thisMonth())+'-01']});
  const totals=Object.fromEntries(q.rows.map(r=>[r.kind,Number(r.total)]));
  const inc=totals.income||0,out=totals.expense||0;
  await send(chat_id,'📊 '+w.name+' — '+thisMonth()+'\n➕ Daromad: '+F.money(inc)+'\n➖ Xarajat: '+F.money(out)+'\n📌 Farq: '+F.money(inc-out)+'\n(Bankdagi haqiqiy qoldiq emas)');
  return;
 }
 if(command==='/bekor'){
  const q=await db.execute({sql:'SELECT id,category,amount FROM mn_transactions WHERE uid=? AND workspace_id=? ORDER BY created DESC,rowid DESC LIMIT 1',args:[uid,w.id]});
  if(!q.rows.length){await send(chat_id,'Bekor qilinadigan yozuv yo‘q.');return;}
  const t=q.rows[0];
  await db.execute({sql:'DELETE FROM mn_transactions WHERE id=? AND workspace_id=? AND uid=?',args:[t.id,w.id,uid]});
  await send(chat_id,'↩️ Bekor qilindi: '+t.category+' '+F.money(t.amount));return;
 }
 if(command==='/limit'){
  const m2=text.match(/^\/limit(?:@\w+)?\s+(.+?)\s+(\d[\d .,]*(?:\s*(?:ming|mln|k))?)$/i);
  if(!m2){await send(chat_id,'Misol: /limit Transport 100000');return;}
  const cat=F.BASE[w.kind].expense.find(c=>c.toLowerCase()===m2[1].toLowerCase());
  let parsed;try{parsed=F.parseFast(m2[2]+' limit');}catch(e){parsed=null;}
  if(!cat||!parsed){await send(chat_id,'Kategoriya yoki summa noto‘g‘ri. /limit Transport 100000');return;}
  await db.execute({sql:'INSERT INTO mn_budgets(workspace_id,month,category,limit_amount) VALUES(?,?,?,?) ON CONFLICT(workspace_id,month,category) DO UPDATE SET limit_amount=excluded.limit_amount',args:[w.id,thisMonth(),cat,parsed.amount]});
  await send(chat_id,'🎯 '+cat+' uchun limit: '+F.money(parsed.amount));return;
 }
 if(command.startsWith('/')){await send(chat_id,'Buyruq topilmadi. /yordam');return;}
 let parsed;try{parsed=F.parseFast(text);}catch(e){parsed=null;}
 if(!parsed){await send(chat_id,'Yozuvni tushunmadim. Masalan:\n25 ming taksi\n+3 mln oylik');return;}
 const cat=F.categoryFor({kind:w.kind,categories:F.BASE[w.kind]},parsed.kind,parsed.note);
 const beforeQuery=await db.execute({sql:"SELECT COALESCE(SUM(amount),0) AS total FROM mn_transactions WHERE workspace_id=? AND kind='expense' AND category=? AND day>=? AND day<?",args:[w.id,cat,thisMonth()+'-01',nextMonth(thisMonth())+'-01']});
 const before=Number(beforeQuery.rows[0].total);
 const saved=await db.execute({sql:'INSERT OR IGNORE INTO mn_transactions(id,uid,workspace_id,update_id,kind,category,amount,note,day,created) VALUES(?,?,?,?,?,?,?,?,?,?)',
  args:[randomUUID(),uid,w.id,update.update_id,parsed.kind,cat,parsed.amount,parsed.note,today(),new Date().toISOString()]});
 if(!saved.rowsAffected)return; // idempotence: duplicate Telegram update does not duplicate money
 let warning='';
 if(parsed.kind==='expense'){
  const q=await db.execute({sql:'SELECT limit_amount FROM mn_budgets WHERE workspace_id=? AND month=? AND category=?',args:[w.id,thisMonth(),cat]});
  const fixed=Number(q.rows[0]?.limit_amount||0);
   const plan=await monthlySalaryPlan(uid,w);
   const limit=fixed>0?fixed:(plan?.targets[cat]?.limit||0),after=before+parsed.amount;
  if(limit>0&&before<limit&&after>=limit)warning='\n⛔ Limit tugadi yoki oshdi!';
  else if(limit>0&&before<.8*limit&&after>=.8*limit)warning='\n⚠️ Limitning 80% iga yetdingiz.';
 }
 const salaryInfo=(parsed.kind==='income'&&cat==='Maosh'&&w.kind==='personal')?'\n\n'+salaryText(await monthlySalaryPlan(uid,w)):'';
 await send(chat_id,(parsed.kind==='income'?'✅ Daromad':'✅ Xarajat')+' saqlandi\n📁 '+w.name+'\n🏷 '+cat+'\n💰 '+F.money(parsed.amount)+'\n📝 '+parsed.note+warning+salaryInfo+'\nXato bo‘lsa: /bekor');
}
async function handleCallback(update){
 const cb=update.callback_query;
 if(!cb||cb.message?.chat?.type!=='private'||cb.message.chat.id!==cb.from?.id)return;
 const uid=await ensure(cb.from.id),cmd=String(cb.data||'');
 await api('answerCallbackQuery',{callback_query_id:cb.id});
 if(cmd.startsWith('use:')){
  const id=cmd.slice(4);
  const q=await db.execute({sql:'SELECT id,name FROM mn_workspaces WHERE id=? AND uid=?',args:[id,uid]});
  if(!q.rows.length)return;
  await db.execute({sql:'UPDATE mn_users SET active=? WHERE uid=?',args:[id,uid]});
  await send(cb.message.chat.id,'✅ Tanlangan hisob: '+q.rows[0].name);
 }
 if(cmd.startsWith('new:')){
  const kind=cmd.slice(4);if(!F.KINDS[kind])return;
  const q=await db.execute({sql:'SELECT COUNT(*) AS count FROM mn_workspaces WHERE uid=?',args:[uid]});
  if(Number(q.rows[0].count)>=12){await send(cb.message.chat.id,'12 tadan ortiq hisob ochilmaydi.');return;}
  const id=randomUUID(),name=F.KINDS[kind];
  await db.batch([
   {sql:'INSERT INTO mn_workspaces(id,uid,kind,name,created) VALUES(?,?,?,?,?)',args:[id,uid,kind,name,new Date().toISOString()]},
   {sql:'UPDATE mn_users SET active=? WHERE uid=?',args:[id,uid]}
  ],'write');
  await send(cb.message.chat.id,'✅ Yangi hisob ochildi: '+name+'\nYozuvlar shu hisobga tushadi.');
 }
}
async function main(){
 await init();
 http.createServer(async(req,res)=>{
  if(req.url==='/health'&&req.method==='GET'){res.writeHead(200,{'content-type':'application/json'});res.end('{"ok":true}');return;}
  if(req.url!=='/telegram/webhook'||req.method!=='POST'){res.writeHead(404);res.end();return;}
  if(!checkSecret(req.headers['x-telegram-bot-api-secret-token'])){res.writeHead(403);res.end();return;}
  try{
   let body='';for await(const part of req){body+=part;if(body.length>64000){res.writeHead(413);res.end();return;}}
   const update=JSON.parse(body);
   if(!Number.isSafeInteger(update.update_id)){res.writeHead(400);res.end();return;}
   if(update.message)await handleMessage(update);
   if(update.callback_query)await handleCallback(update);
   res.writeHead(200);res.end('ok');
  }catch(e){console.error('Webhook handling failed:',String(e.message).slice(0,120));res.writeHead(503);res.end('retry');}
 }).listen(Number(process.env.PORT||10000),'0.0.0.0');
 console.log('ME Notes Telegram chat listener started');
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exit(1);});
module.exports={nextMonth,checkSecret};
