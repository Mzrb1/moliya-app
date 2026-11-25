'use strict';
// ME Notes: Telegram financial management backend.
// Secrets required at runtime: BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET,
// TURSO_DATABASE_URL, TURSO_AUTH_TOKEN.
const http=require('node:http');
const {randomUUID,timingSafeEqual}=require('node:crypto');
const {createClient}=require('@libsql/client');
const F=require('../me-notes-sahifalab/finance-core.js');
const {listLineUpdateId,listRangeForId}=require('./list-utils.cjs');
const undo=require('./entry-undo.cjs');
const {makeFinanceApi}=require('./miniapp-api.cjs');
const early=require('./early-access.cjs');
const administrator=require('./admin-access.cjs');
const {createAdminBot}=require('./admin-bot.cjs');
const {createCommunityBot}=require('./community.cjs');
const backups=require('./automatic-backup.cjs');
const {requestRoute}=require('./request-route.cjs');
function env(key){const x=process.env[key];if(!x)throw Error('Missing '+key);return x;}
const token=env('BOT_TOKEN');
const secret=env('TELEGRAM_WEBHOOK_SECRET');
const url=env('TURSO_DATABASE_URL');
const authToken=env('TURSO_AUTH_TOKEN');
if(!/^[A-Za-z0-9_-]{1,256}$/.test(secret))throw Error('Invalid webhook secret');
if(!/^(libsql|https):\/\//.test(url))throw Error('Only secure Turso remote URLs supported');
const db=createClient({url,authToken});
const financeApi=makeFinanceApi({db,botToken:token,ensure:uid=>ensure(uid)});
const today=()=>F.today(),thisMonth=()=>today().slice(0,7);
const nextMonth=m=>{const [y,n]=m.split('-').map(Number);return (n===12?y+1:y)+'-'+String(n===12?1:n+1).padStart(2,'0');};
async function init(){
 await db.batch([
  "CREATE TABLE IF NOT EXISTS mn_users(uid TEXT PRIMARY KEY, active TEXT)",
  "CREATE TABLE IF NOT EXISTS mn_workspaces(id TEXT PRIMARY KEY, uid TEXT NOT NULL, kind TEXT NOT NULL, name TEXT NOT NULL, created TEXT NOT NULL)",
  "CREATE INDEX IF NOT EXISTS mn_idx_ws_uid ON mn_workspaces(uid)",
  "CREATE TABLE IF NOT EXISTS mn_transactions(id TEXT PRIMARY KEY, uid TEXT NOT NULL, workspace_id TEXT NOT NULL, update_id INTEGER NOT NULL UNIQUE, kind TEXT NOT NULL, category TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount>0), note TEXT, day TEXT NOT NULL, created TEXT NOT NULL)",
  "CREATE INDEX IF NOT EXISTS mn_idx_tx_day ON mn_transactions(workspace_id, day)",
  "CREATE TABLE IF NOT EXISTS mn_budgets(workspace_id TEXT NOT NULL, month TEXT NOT NULL, category TEXT NOT NULL, limit_amount INTEGER NOT NULL CHECK(limit_amount>=0), PRIMARY KEY(workspace_id,month,category))",
  "CREATE TABLE IF NOT EXISTS mn_processed_lists(update_id INTEGER PRIMARY KEY, uid TEXT NOT NULL, workspace_id TEXT NOT NULL, created TEXT NOT NULL)"
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
const FINANCE_MINI_APP_URL='https://me-notes-sahifalab.onrender.com/finance-unified.html';
const financeMenuButton=()=>({type:'web_app',text:'Moliya boshqaruvi',web_app:{url:FINANCE_MINI_APP_URL}});
const send=(chat_id,text,extra={})=>api('sendMessage',{chat_id,text,...extra});
const communityBot=createCommunityBot({db,telegram:api,send,answerCallback:(id)=>api('answerCallbackQuery',{callback_query_id:id})});
const adminBot=createAdminBot({db,send,answerCallback:(id,message)=>api('answerCallbackQuery',{
 callback_query_id:id,...(message?{text:message,show_alert:true}:{})
}),lookupName:async(uid)=>{
 try{
  const person=await api('getChat',{chat_id:Number(uid)});
  if(person?.type!=='private'||String(person.id)!==String(uid))return false;
  return await administrator.capture(db,person);
 }catch(_){return false;}
}});
async function ensure(uid){
 uid=String(uid);
 await db.execute({sql:'INSERT OR IGNORE INTO mn_users(uid) VALUES(?)',args:[uid]});
 await early.register(db,uid);
 const existing=await db.execute({sql:"SELECT w.id FROM mn_workspaces w WHERE w.uid=? AND NOT EXISTS(SELECT 1 FROM mn_workspace_archive a WHERE a.workspace_id=w.id) ORDER BY w.created,w.id LIMIT 1",args:[uid]});
 if(!existing.rows.length){
  // Atomic INSERT ... SELECT prevents duplicate default workspaces from webhook retries.
  const id=randomUUID(),now=new Date().toISOString();
  await db.execute({sql:"INSERT INTO mn_workspaces(id,uid,kind,name,created) SELECT ?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM mn_workspaces w WHERE w.uid=? AND NOT EXISTS(SELECT 1 FROM mn_workspace_archive a WHERE a.workspace_id=w.id))",
   args:[id,uid,'personal',F.KINDS.personal,now,uid]});
 }
 const activeRows=await db.execute({sql:"SELECT w.id FROM mn_workspaces w WHERE w.uid=? AND NOT EXISTS(SELECT 1 FROM mn_workspace_archive a WHERE a.workspace_id=w.id) ORDER BY w.created,w.id",args:[uid]});
 if(!activeRows.rows.length)throw Error('Hisobni ochib bo‘lmadi');
 const current=await db.execute({sql:"SELECT u.active FROM mn_users u JOIN mn_workspaces w ON w.id=u.active AND w.uid=u.uid WHERE u.uid=? AND NOT EXISTS(SELECT 1 FROM mn_workspace_archive a WHERE a.workspace_id=w.id)",args:[uid]});
 if(!current.rows.length)await db.execute({sql:'UPDATE mn_users SET active=? WHERE uid=?',args:[activeRows.rows[0].id,uid]});
 return uid;
}
async function active(uid){
 const q=await db.execute({sql:'SELECT w.id,w.kind,w.name FROM mn_users u JOIN mn_workspaces w ON u.active=w.id WHERE u.uid=? AND w.uid=? AND NOT EXISTS (SELECT 1 FROM mn_workspace_archive a WHERE a.workspace_id=w.id)',args:[uid,uid]});
 return q.rows[0];
}
async function choose(uid,expanded=false){
 // The Mini App stays in the bottom Telegram Menu/Main Mini App.
 // Chat messages lead with the chat-based expense/income workflow instead.
 const keyboard=[
  [{text:'❓ Yordam',callback_data:'help:chat'}]
 ];
 keyboard.push([{text:'👥 Hamjamiyat',callback_data:'cm:group'},{text:'🔔 Xabarnomalar',callback_data:'cm:optmenu'}]);
 if(administrator.isAdmin(uid))keyboard.push([{text:'🛡 Admin boshqaruvi',callback_data:'adm:home'}]);
 if(expanded){
  const [q,w]=await Promise.all([
   db.execute({sql:'SELECT id,kind,name FROM mn_workspaces w WHERE uid=? AND NOT EXISTS (SELECT 1 FROM mn_workspace_archive a WHERE a.workspace_id=w.id) ORDER BY created,id',args:[uid]}),
   active(uid)
  ]);
  keyboard.push(...q.rows.map(x=>[{
   text:(x.id===w.id?'✅ ':'📂 ')+x.name+' · '+F.KINDS[x.kind]+' · '+String(x.id).slice(-6),
   callback_data:'use:'+x.id
  }]));
  keyboard.push([{text:'⚙️ Hisoblarni boshqarish yo‘li',callback_data:'help:accounts'}]);
 }
 return {inline_keyboard:keyboard};
}
const help='📒 ME Notes — tezkor yozuv\n\n25 ming taksi\ntushlik 35000\n+3 mln oylik\n\n'+
 '📋 Bir nechta xarajatni har qatorda yozing (20 tagacha):\nTushlik 98000\n18 ming yo‘lga\n\n'+
 '📁 /hisob — hisobni almashtirish\n📊 /hisobot yoki /hisobot 2026-10 — kerakli oy\n🧮 /taqsimot yoki /taqsimot 2026-10 — oylik reja\n'+
 '🎯 /limit Transport 100000 — limit\n↩️ /bekor — oxirgi yozuvni avval ko‘rsatib, tasdiq bilan bekor qilish\n'+
 'ℹ️ /yordam — yordam\n'+
 '👥 /guruh — hamjamiyatga qo‘shilish\n🔔 /obuna — yangilik va reklama xabarnomalari\n'+
 '📱 Mini App — pastdagi Menyu yoki bot profilidagi Ochish tugmasi';
function checkSecret(input){
 if(typeof input!=='string')return false;
 const a=Buffer.from(input),b=Buffer.from(secret);
 return a.length===b.length&&timingSafeEqual(a,b);
}
// Chatdagi rejalar serverdagi TURSO yozuvlaridan hisoblanadi, Mini App localStorage’dan emas.
async function monthlySalaryPlan(uid,w,range=thisMonth()){
 if(w.kind!=='personal')return null;
 if(!F.validMonth(range))throw Error('Oy noto‘g‘ri');
 const q=await db.execute({sql:"SELECT amount,day FROM mn_transactions WHERE uid=? AND workspace_id=? AND kind='income' AND category='Maosh' AND day>=? AND day<?",
 args:[uid,w.id,range+'-01',nextMonth(range)+'-01']});
 if(!q.rows.length)return null;
 const b=await db.execute({sql:'SELECT category,limit_amount FROM mn_budgets WHERE workspace_id=? AND month=?',args:[w.id,range]});
 const hard=Object.fromEntries(b.rows.map(row=>[row.category,Number(row.limit_amount)]));
 const prefs=await financeApi.preferences(w);
 const temp={kind:'personal',categories:prefs.categories,keywords:prefs.keywords,transactions:q.rows.map(row=>({kind:'income',category:'Maosh',amount:Number(row.amount),date:String(row.day)})),budgets:{[range]:hard}};
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
 return text+'\nBu haqiqiy pul o‘tkazmasi yoki qo‘shimcha xarajat emas. Yangi Yagona moliya Mini App ushbu Turso hisobi bilan birga ishlaydi.';
}

async function saveTelegramList(update,uid,w,chat_id,raw){
 const parsed=F.parseList(raw);
 if(!parsed)return false;
 if(parsed.errors.length){
  const sample=parsed.errors.slice(0,5).map(e=>e.line+'-qator: '+e.reason).join('\n');
  await send(chat_id,'⚠️ Ro‘yxatdagi ayrim qatorlarni tushunmadim:\n'+sample+
   (parsed.errors.length>5?'\n... yana '+(parsed.errors.length-5)+' ta xato':'')+
   '\n\n❌ Hech bir xarajat saqlanmadi. Qatorlarni tuzatib, ro‘yxatni qaytadan yuboring.');
  return true;
 }
 const prefs=await financeApi.preferences(w);
 const result=parsed.items.map((t,i)=>({
  ...t,category:F.categoryFor({kind:w.kind,categories:prefs.categories,keywords:prefs.keywords},t.kind,t.note),
  id:randomUUID(),updateId:listLineUpdateId(update.update_id,i)
 }));
 // The durable marker survives /bekor, so Telegram retries can never recreate
 // a list that a user has already deliberately undone.
 const exists=await db.execute({sql:'SELECT update_id FROM mn_processed_lists WHERE update_id=?',args:[update.update_id]});
 if(exists.rows.length)return true;
 const day=today(),now=new Date().toISOString();
 const commands=[
  {sql:'INSERT INTO mn_processed_lists(update_id,uid,workspace_id,created) VALUES(?,?,?,?)',
   args:[update.update_id,uid,w.id,now]},
  ...result.map(t=>({
   sql:'INSERT INTO mn_transactions(id,uid,workspace_id,update_id,kind,category,amount,note,day,created) VALUES(?,?,?,?,?,?,?,?,?,?)',
   args:[t.id,uid,w.id,t.updateId,t.kind,t.category,t.amount,t.note,day,now]
  }))
 ];
 try{
  // libSQL batch("write") is a transaction: never save half a list.
  await db.batch(commands,'write');
 }catch(error){
  // Another webhook retry can race with the first request.
  const already=await db.execute({sql:'SELECT update_id FROM mn_processed_lists WHERE update_id=?',args:[update.update_id]});
  if(already.rows.length)return true;
  throw error;
 }
 const totals={income:0,expense:0},cats=new Map();
 const lines=result.map((t,i)=>{
  totals[t.kind]+=t.amount;
  if(t.kind==='expense')cats.set(t.category,(cats.get(t.category)||0)+t.amount);
  return (i+1)+'. '+(t.kind==='income'?'➕ ':'➖ ')+t.category+
   ' — '+F.money(t.amount)+' ('+t.note.slice(0,70)+')';
 });
 let answer='✅ '+result.length+' ta yozuv saqlandi\n📁 '+w.name+'\n\n'+lines.join('\n')+
  '\n\n➖ Jami xarajat: '+F.money(totals.expense)+
  (totals.income?'\n➕ Jami daromad: '+F.money(totals.income):'');
 const warnings=[];
 if(cats.size){
  const prior=await db.execute({sql:"SELECT category,COALESCE(SUM(amount),0) AS total FROM mn_transactions WHERE workspace_id=? AND kind='expense' AND day>=? AND day<? GROUP BY category",
   args:[w.id,thisMonth()+'-01',nextMonth(thisMonth())+'-01']});
  const full=Object.fromEntries(prior.rows.map(row=>[String(row.category),Number(row.total)]));
  const budget=await db.execute({sql:'SELECT category,limit_amount FROM mn_budgets WHERE workspace_id=? AND month=?',args:[w.id,thisMonth()]});
  const fixed=Object.fromEntries(budget.rows.map(row=>[String(row.category),Number(row.limit_amount)]));
  const plan=await monthlySalaryPlan(uid,w);
  for(const [cat,added] of cats){
   const limit=(fixed[cat]||0) || (plan?.targets[cat]?.limit||0);
   if(limit<=0)continue;
   const after=full[cat]||0,before=after-added;
   if(before<limit&&after>=limit)warnings.push('⛔ '+cat+': oylik limit tugadi yoki oshdi.');
   else if(before<limit*.8&&after>=limit*.8)warnings.push('⚠️ '+cat+': limitning 80% iga yetdingiz.');
  }
 }
 if(warnings.length)answer+='\n\n'+warnings.join('\n');
 if(result.some(x=>x.kind==='income'&&x.category==='Maosh')&&w.kind==='personal'){
  answer+='\n\n🧮 Oylik reja yangilandi. /taqsimot';
 }
 answer+='\n↩️ Shu ro‘yxatni bekor qilish uchun pastdagi tugmani bosing.';
 await send(chat_id,answer.slice(0,3900),{reply_markup:undo.listButton(update.update_id)});
 return true;
}

async function handleMessage(update){
 const m=update.message;
 if(!m)return;
 if(m.chat?.type==='group'||m.chat?.type==='supergroup'){
  await communityBot.handleGroupMessage(m);return;
 }
 if(m.chat?.type!=='private'||m.chat.id!==m.from?.id)return;
 const uid=await ensure(m.from.id),chat_id=m.chat.id;
 await administrator.capture(db,m.from);
 if(await communityBot.handlePrivateMessage(m))return;
 if(typeof m.text!=='string')return;
 const w=await active(uid);
 const text=m.text.trim(),command=text.split(/\s+/)[0].replace(/@[\w]+$/,'').toLowerCase();
 if(await adminBot.handleMessage(uid,text))return;
 if(command==='/start'){
  try{await api('setChatMenuButton',{chat_id,menu_button:financeMenuButton()});}
  catch(e){console.error('ME Notes chat menu setup failed:',String(e.message).slice(0,100));}
  await send(chat_id,'📒 ME Notes\n📂 Faol hisob: '+w.name+'\n\n✍️ Xarajat va daromadni shu chatning o‘zida yozishingiz mumkin!\n➖ Xarajat: 25 ming taksi\n➕ Daromad: +3 mln oylik\n📊 Hisobot: /hisobot\n\n❓ Quyidagi Yordam tugmasida boshqa buyruqlar ham bor.\n📱 Mini App: pastdagi Menyu yoki bot profilidagi Ochish.',{reply_markup:await choose(uid)});return;
 }
 if(command==='/hisob'){await send(chat_id,'Faol hisob: '+w.name+'\nHisobni tanlang yoki boshqaring:',{reply_markup:await choose(uid,true)});return;}
 if(command==='/yordam'||command==='/help'){await send(chat_id,help);return;}
 if(command==='/taqsimot'||command==='/hisobot'){
  const month=(text.split(/\s+/)[1]||thisMonth());
  if(!F.validMonth(month)){await send(chat_id,'Oy noto‘g‘ri. Misol: '+command+' 2026-10');return;}
  if(command==='/taqsimot'){await send(chat_id,salaryText(await monthlySalaryPlan(uid,w,month)));return;}
  const ledger=await financeApi.ledger(uid,w.id,month);
  const comparison=F.reportComparison({expense:ledger.totals.expense,budgets:ledger.categories});
  const f=F.money;
  let heading='📊 '+w.name+' — '+month+(ledger.closed_at?' · Arxiv':'')+'\n➕ Daromad: '+f(ledger.totals.income)+'\n➖ Xarajat: '+f(ledger.totals.expense)+'\n📌 Hisobiy farq: '+f(ledger.totals.net)+'\n(Bankdagi haqiqiy qoldiq emas)';
  if(comparison.hasPlan)heading+='\n\nReja: '+f(comparison.plannedTotal)+'\nLimitli xarajat: '+f(comparison.plannedSpent)+'\nLimitdan oshgan: '+f(comparison.over);
  else heading+='\n\nBu oyga limit belgilanmagan.';
  if(comparison.unplannedSpent>0)heading+='\nRejasiz xarajat: '+f(comparison.unplannedSpent);
  let chunk=heading;
  for(const row of comparison.rows){
   const diff=row.remaining===null?'Reja yo‘q':row.remaining<0?'Oshgan: '+f(-row.remaining):'Qolgan limit: '+f(row.remaining);
   const part='\n\n'+row.category+' ('+row.share.toFixed(1)+'%)\nReja: '+(row.limit===null?'—':f(row.limit))+' · Haqiqiy: '+f(row.spent)+'\n'+diff;
   if(chunk.length+part.length>3500){await send(chat_id,chunk);chunk='📊 Hisobot davomi';}
   chunk+=part;
  }
  await send(chat_id,chunk);
  return;
 }
 if(command==='/bekor'){
  // Old /bekor links cannot reveal which confirmation message was tapped.
  // Do NOT delete the latest entry immediately; ask the user to confirm the
  // precise last transaction/list with a scoped inline button instead.
  const last=await db.execute({sql:'SELECT id,update_id,category,kind,amount FROM mn_transactions WHERE uid=? AND workspace_id=? ORDER BY rowid DESC LIMIT 1',args:[uid,w.id]});
  if(!last.rows.length){await send(chat_id,'Bekor qilinadigan yozuv yo‘q.');return;}
  const item=last.rows[0],tag=Number(item.update_id);
  if(tag<0){
   const {source,lower,upper}=listRangeForId(tag);
   const data=await db.execute({sql:'SELECT COUNT(*) AS n,COALESCE(SUM(amount),0) AS total FROM mn_transactions WHERE uid=? AND workspace_id=? AND update_id BETWEEN ? AND ?',args:[uid,w.id,lower,upper]});
   await send(chat_id,'⚠️ Eski /bekor havolasi xabarga bog‘lanmagan.\n\nOxirgi ro‘yxat: '+Number(data.rows[0].n)+' ta yozuv · '+F.money(Number(data.rows[0].total))+'\nFaqat shu ro‘yxatni bekor qilishni tasdiqlaysizmi?',{reply_markup:undo.listButton(source)});
  }else{
   await send(chat_id,'⚠️ Eski /bekor havolasi xabarga bog‘lanmagan.\n\nOxirgi yozuv: '+(item.kind==='income'?'Daromad':'Xarajat')+' · '+item.category+' · '+F.money(Number(item.amount))+'\nFaqat shu yozuvni bekor qilishni tasdiqlaysizmi?',{reply_markup:undo.singleButton(String(item.id))});
  }
  return;
 }
 if(command==='/limit'){
  const m2=text.match(/^\/limit(?:@\w+)?\s+(.+?)\s+(\d[\d .,]*(?:\s*(?:ming|mln|k))?)$/i);
  if(!m2){await send(chat_id,'Misol: /limit Transport 100000');return;}
  const prefs=await financeApi.preferences(w);
   const cat=prefs.categories.expense.find(c=>c.toLowerCase()===m2[1].toLowerCase());
  let parsed;try{parsed=F.parseFast(m2[2]+' limit');}catch(e){parsed=null;}
  if(!cat||!parsed){await send(chat_id,'Kategoriya yoki summa noto‘g‘ri. /limit Transport 100000');return;}
  await db.execute({sql:'INSERT INTO mn_budgets(workspace_id,month,category,limit_amount) VALUES(?,?,?,?) ON CONFLICT(workspace_id,month,category) DO UPDATE SET limit_amount=excluded.limit_amount',args:[w.id,thisMonth(),cat,parsed.amount]});
  await send(chat_id,'🎯 '+cat+' uchun limit: '+F.money(parsed.amount));return;
 }
 if(command.startsWith('/')){await send(chat_id,'Buyruq topilmadi. /yordam');return;}
 if(await saveTelegramList(update,uid,w,chat_id,text))return;
 let parsed;try{parsed=F.parseFast(text);}catch(e){parsed=null;}
 if(!parsed){await send(chat_id,'Yozuvni tushunmadim. Masalan:\n25 ming taksi\n+3 mln oylik');return;}
 const prefs=await financeApi.preferences(w);
 const cat=F.categoryFor({kind:w.kind,categories:prefs.categories,keywords:prefs.keywords},parsed.kind,parsed.note);
 const beforeQuery=await db.execute({sql:"SELECT COALESCE(SUM(amount),0) AS total FROM mn_transactions WHERE workspace_id=? AND kind='expense' AND category=? AND day>=? AND day<?",args:[w.id,cat,thisMonth()+'-01',nextMonth(thisMonth())+'-01']});
 const before=Number(beforeQuery.rows[0].total);
 const savedId=await undo.saveSingle(db,{
  uid,workspaceId:w.id,updateId:update.update_id,kind:parsed.kind,category:cat,
  amount:parsed.amount,note:parsed.note,day:today()
 });
 if(!savedId)return; // durable duplicate webhook marker survives cancellation
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
 await send(chat_id,(parsed.kind==='income'?'✅ Daromad':'✅ Xarajat')+' saqlandi\n📁 '+w.name+'\n🏷 '+cat+'\n💰 '+F.money(parsed.amount)+'\n📝 '+parsed.note+warning+salaryInfo+'\n↩️ Xato bo‘lsa, pastdagi tugmani bosing.',{reply_markup:undo.singleButton(savedId)});
}
async function handleCallback(update){
 const cb=update.callback_query;
 if(!cb||cb.message?.chat?.type!=='private'||cb.message.chat.id!==cb.from?.id)return;
 const uid=await ensure(cb.from.id),cmd=String(cb.data||'');
 await administrator.capture(db,cb.from);
 if(await communityBot.handleCallback(uid,cmd,cb.id))return;
 if(await adminBot.handleCallback(uid,cmd,cb.id))return;
 const cancelled=await undo.fromCallback(db,uid,cmd);
 if(cancelled){
  const successful=cancelled.status==='deleted';
  const response=successful?'Yozuv bekor qilindi.':
   cancelled.status==='closed'?'Bu oy arxivlangan. Avval oyni qayta oching.':
   cancelled.status==='archived'?'Hisob yopilgan. Avval hisobni qayta oching.':
   cancelled.status==='gone'?'Bu yozuv allaqachon o‘chirilgan.':
   cancelled.status==='invalid'?'Eski yoki noto‘g‘ri tugma.':'Yozuv o‘zgarmadi. Hisob holatini tekshiring.';
  try{await api('answerCallbackQuery',{callback_query_id:cb.id,text:response,show_alert:!successful});}
  catch(e){console.error('Undo callback answer failed:',String(e.message).slice(0,100));}
  if(successful){
   try{await api('editMessageReplyMarkup',{chat_id:cb.message.chat.id,message_id:cb.message.message_id,reply_markup:{inline_keyboard:[]}});}
   catch(e){console.error('Undo button cleanup failed:',String(e.message).slice(0,100));}
   const summary=cancelled.list?
    '↩️ Shu xabardagi '+cancelled.count+' ta yozuv bekor qilindi. Jami '+F.money(cancelled.total)+' (hisobiy).':
    '↩️ Shu '+(cancelled.kind==='income'?'daromad':'xarajat')+' bekor qilindi: '+cancelled.category+' '+F.money(cancelled.amount);
   await send(cb.message.chat.id,summary);
  }
  return;
 }
 await api('answerCallbackQuery',{callback_query_id:cb.id});
 if(cmd==='help:chat'){await send(cb.message.chat.id,help);return;}
 if(cmd==='help:accounts'){
  await send(cb.message.chat.id,'📁 Hisoblarni almashtirish: /hisob buyrug‘ini yuboring va ro‘yxatdan tanlang.\n\n➕ Yangi hisob yaratish, nomini o‘zgartirish, yopish va tiklash: pastdagi Menyu → ⚙️ Boshqarish.\n\n✍️ Xarajat va daromadni shu chatning o‘zida yozishingiz mumkin.');
  return;
 }
 if(cmd.startsWith('use:')){
  const id=cmd.slice(4);
  const q=await db.execute({sql:'SELECT id,name FROM mn_workspaces w WHERE id=? AND uid=? AND NOT EXISTS (SELECT 1 FROM mn_workspace_archive a WHERE a.workspace_id=w.id)',args:[id,uid]});
  if(!q.rows.length)return;
  await db.execute({sql:'UPDATE mn_users SET active=? WHERE uid=?',args:[id,uid]});
  await send(cb.message.chat.id,'✅ Tanlangan hisob: '+q.rows[0].name);
 }
 if(cmd.startsWith('new:')){
  // Old Telegram messages may contain obsolete quick-create callback buttons.
  // Never create duplicate accounts from stale messages.
  await send(cb.message.chat.id,'Hisob yaratish va boshqarish: pastdagi Menyu → ⚙️ Boshqarish. Hisobni almashtirish: /hisob.');
 }
}
async function main(){
 await init();
 await financeApi.init();
 await communityBot.init();
 communityBot.start();
 http.createServer(async(req,res)=>{
  const route=requestRoute(req.method,req.url);
  if(route==='health'){res.writeHead(200,{'content-type':'application/json'});res.end('{"ok":true}');return;}
  if(route==='api'){await financeApi.handle(req,res);return;}
  if(route==='not_found'){res.writeHead(404);res.end();return;}
  if(!checkSecret(req.headers['x-telegram-bot-api-secret-token'])){res.writeHead(403);res.end();return;}
  try{
   let body='';for await(const part of req){body+=part;if(body.length>64000){res.writeHead(413);res.end();return;}}
   const update=JSON.parse(body);
   if(!Number.isSafeInteger(update.update_id)){res.writeHead(400);res.end();return;}
   if(update.message)await handleMessage(update);
   if(update.callback_query)await handleCallback(update);
   res.writeHead(200);res.end('ok');
  }catch(e){console.error('Webhook handling failed:',String(e.message).slice(0,120));res.writeHead(503);res.end('retry');}
 }).listen(Number(process.env.PORT||10000),'0.0.0.0',async()=>{
  console.log('ME Notes Telegram chat listener started');
  // Faqat Render environmentda maxsus yoqilgandagina webhook almashtiriladi.
  // Daily encrypted recovery copies; catch missed days on service restart.
  // This is a logical, same-Turso-DB backup, not an external disaster copy.
  let backupKey=null;
  try{backupKey=backups.keyFromEnv();}
  catch(e){console.error('ME Notes backup disabled:',String(e.message).slice(0,120));}
  if(backupKey){
   let working=false;
   const cycle=async()=>{
    if(working)return;
    working=true;
    try{
     const result=await backups.sweep(db,{key:backupKey});
     console.log('ME Notes daily backup cycle:',JSON.stringify(result));
    }catch(e){console.error('ME Notes daily backup cycle failed:',String(e.message).slice(0,120));}
    finally{working=false;}
   };
   setTimeout(cycle,3000).unref();
   setInterval(cycle,6*60*60*1000).unref();
  }else console.warn('ME Notes daily backup is not enabled: ME_NOTES_BACKUP_KEY_B64 missing');
  if(process.env.AUTO_SET_WEBHOOK==='true'){
   const base=String(process.env.PUBLIC_BASE_URL||'').trim();
   if(!/^https:\/\/[a-zA-Z0-9.-]+(?::443)?\/?$/.test(base)){
    console.error('AUTO_SET_WEBHOOK skipped: PUBLIC_BASE_URL is not a clean HTTPS domain');
    return;
   }
   try{
    await api('setWebhook',{url:base.replace(/\/$/,'')+'/telegram/webhook',
      secret_token:secret,allowed_updates:['message','callback_query'],drop_pending_updates:false});
    console.log('Telegram webhook installed by explicit AUTO_SET_WEBHOOK flag');
   }catch(err){console.error('Telegram webhook setup failed:',String(err.message).slice(0,120));}
   try{
    await api('setChatMenuButton',{menu_button:financeMenuButton()});
    console.log('ME Notes default menu is finance Mini App');
   }catch(err){console.error('ME Notes default menu setup failed:',String(err.message).slice(0,120));}
  }
 });
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exit(1);});
module.exports={nextMonth,checkSecret};
