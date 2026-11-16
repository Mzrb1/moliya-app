'use strict';
// ME Notes: explicit-consent community announcements; never read or publish ledgers.
const {randomUUID}=require('node:crypto');
const admin=require('./admin-access.cjs');
const INVITE=String(process.env.ME_NOTES_GROUP_INVITE_URL||'').trim();
const validInvite=url=>/^https:\/\/t\.me\/(?:\+[A-Za-z0-9_-]{8,}|joinchat\/[A-Za-z0-9_-]{8,})$/.test(String(url||''));
const isGroup=chat=>chat&&(chat.type==='group'||chat.type==='supergroup');
const reply=(text,url)=>url?{reply_markup:{inline_keyboard:[[{text, url}]]}}:{};
const cleanText=(raw,max)=>String(raw||'').trim().slice(0,max);
const iso=()=>new Date().toISOString();
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function createCommunityBot({db,telegram,send,answerCallback,isAdmin=admin.isAdmin,inviteUrl=INVITE}){
 let running=false,timer=null,botId=null;
 async function init(){
  await db.batch([
   "CREATE TABLE IF NOT EXISTS mn_community_settings(k TEXT PRIMARY KEY,v TEXT NOT NULL,updated_at TEXT NOT NULL)",
   "CREATE TABLE IF NOT EXISTS mn_notice_prefs(uid TEXT PRIMARY KEY,updates INTEGER NOT NULL DEFAULT 0 CHECK(updates IN(0,1)),promotions INTEGER NOT NULL DEFAULT 0 CHECK(promotions IN(0,1)),updated_at TEXT NOT NULL)",
   "CREATE TABLE IF NOT EXISTS mn_notice_drafts(id TEXT PRIMARY KEY,admin_uid TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN('update','promo')),audience TEXT NOT NULL CHECK(audience IN('group','users','both')),text TEXT NOT NULL,photo_id TEXT,status TEXT NOT NULL CHECK(status IN('draft','queued','cancelled')),created_at TEXT NOT NULL,submitted_at TEXT)",
   "CREATE TABLE IF NOT EXISTS mn_notice_outbox(notice_id TEXT NOT NULL,target TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN('queued','sending','sent','failed')),created_at TEXT NOT NULL,finished_at TEXT,error TEXT,PRIMARY KEY(notice_id,target))",
   "CREATE INDEX IF NOT EXISTS mn_notice_outbox_pending ON mn_notice_outbox(status,created_at)"
  ],'write');
 }
 async function groupId(){
  const x=await db.execute({sql:"SELECT v FROM mn_community_settings WHERE k='group_id'"});
  return String(x.rows[0]?.v||'');
 }
 async function showGroup(uid){
  const id=await groupId();
  const text='👥 ME Notes hamjamiyati\n\nBu yerda takliflar, savollar va yangi imkoniyatlar muhokama qilinadi.'+
   (id?'\n✅ Guruh botga ulangan.':'\n⏳ E’lonlar uchun botga guruh hali ulanmagan.')+
   '\n\nMoliyaviy yozuvlar guruhga yuborilmaydi.';
  await send(uid,text,validInvite(inviteUrl)?reply('👥 Guruhga qo‘shilish',inviteUrl):{});
 }
 async function preferences(uid){
  const r=await db.execute({sql:'SELECT updates,promotions FROM mn_notice_prefs WHERE uid=?',args:[String(uid)]});
  return {updates:Number(r.rows[0]?.updates||0)===1,promotions:Number(r.rows[0]?.promotions||0)===1};
 }
 async function preferenceMenu(uid){
  const p=await preferences(uid);
  const text='🔔 ME Notes xabarnomalari\n\n'+
   '📰 Yangilik va o‘zgarishlar: '+(p.updates?'✅ Yoqilgan':'🔕 O‘chirilgan')+'\n'+
   '📣 Reklama va takliflar: '+(p.promotions?'✅ Yoqilgan':'🔕 O‘chirilgan')+
   '\n\nBarchasi ixtiyoriy. Istalgan payt o‘chirishingiz mumkin. '+
   'Boshqa foydalanuvchilarning yozuvlari bu xabarlarga qo‘shilmaydi.';
  const kb={inline_keyboard:[
   [{text:(p.updates?'🔕':'🔔')+' Yangiliklar',callback_data:'cm:opt:updates:'+(p.updates?'off':'on')}],
   [{text:(p.promotions?'🔕':'📣')+' Reklamalar',callback_data:'cm:opt:promotions:'+(p.promotions?'off':'on')}],
   [{text:'👥 Guruh haqida',callback_data:'cm:group'}]
  ]};
  await send(uid,text,{reply_markup:kb});
 }
 async function setPreference(uid,kind,on){
  if(!['updates','promotions'].includes(kind))throw Error('Preference invalid');
  await db.execute({sql:"INSERT INTO mn_notice_prefs(uid,updates,promotions,updated_at) VALUES(?,?,?,?) ON CONFLICT(uid) DO UPDATE SET "+kind+"=excluded."+kind+",updated_at=excluded.updated_at",
   args:[String(uid),kind==='updates'&&on?1:0,kind==='promotions'&&on?1:0,iso()]});
 }
 async function handleGroupMessage(m){
  if(!isGroup(m.chat))return false;
  const cmd=String(m.text||'').trim().split(/\s+/)[0].replace(/@[\w]+$/,'').toLowerCase();
  if(cmd!=='/ulash')return false;
  const uid=String(m.from?.id||'');
  if(!admin.validUid(uid)||!isAdmin(uid)||m.sender_chat)return true;
  // Even the configured bot owner must be an actual admin in this exact chat.
  const member=await telegram('getChatMember',{chat_id:m.chat.id,user_id:Number(uid)});
  if(!['creator','administrator'].includes(member?.status)){
   await send(m.chat.id,'Guruhni ulash uchun Telegram guruh administratori bo‘lishingiz kerak.');return true;
  }
  if(botId===null){const me=await telegram('getMe',{});botId=me.id;}
  const self=await telegram('getChatMember',{chat_id:m.chat.id,user_id:botId});
  if(!['creator','administrator'].includes(self?.status)){
   await send(m.chat.id,'ME Notes botiga guruhda administrator huquqini bering, so‘ng /ulash yuboring.');return true;
  }
  await db.execute({sql:"INSERT INTO mn_community_settings(k,v,updated_at) VALUES('group_id',?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v,updated_at=excluded.updated_at",args:[String(m.chat.id),iso()]});
  await send(m.chat.id,'✅ ME Notes guruhga ulandi. E’lonlar faqat admin tomonidan ko‘rib chiqilib, tasdiqlangach yuboriladi.');
  return true;
 }
 function keyboard(d){
  const id=d.id;
  return {inline_keyboard:[
   [{text:(d.kind==='update'?'✅ ':'')+'📰 Yangilik',callback_data:'cm:d:'+id+':ku'},
    {text:(d.kind==='promo'?'✅ ':'')+'📣 Reklama',callback_data:'cm:d:'+id+':kp'}],
   [{text:(d.audience==='group'?'✅ ':'')+'👥 Guruh',callback_data:'cm:d:'+id+':ag'},
    {text:(d.audience==='users'?'✅ ':'')+'🔔 Obunachilar',callback_data:'cm:d:'+id+':au'}],
   [{text:(d.audience==='both'?'✅ ':'')+'📡 Ikkalasi',callback_data:'cm:d:'+id+':ab'}],
   [{text:'🚀 Tasdiqlab yuborish',callback_data:'cm:d:'+id+':send'},
    {text:'❌ Bekor',callback_data:'cm:d:'+id+':cancel'}]
  ]};
 }
 async function draft(uid,id){
  const q=await db.execute({sql:'SELECT * FROM mn_notice_drafts WHERE id=? AND admin_uid=?',args:[id,String(uid)]});
  return q.rows[0]||null;
 }
 async function preview(uid,d){
  if(d.photo_id)await telegram('sendPhoto',{chat_id:Number(uid),photo:String(d.photo_id),caption:String(d.text)});
  else await send(uid,String(d.text));
  await send(uid,'🔎 E’lonni tekshiring va yo‘nalishni tanlang.\n\nTuri: '+(d.kind==='promo'?'Reklama':'Yangilik')+
   '\nKimlarga: '+({group:'Faqat guruh',users:'Faqat rozilik bergan obunachilar',both:'Guruh va rozilik bergan obunachilar'}[d.audience])+
   '\n\nTasdiqlamaguningizcha hech kimga yuborilmaydi.',{reply_markup:keyboard(d)});
 }
 async function newDraft(uid,m,raw){
  let text=String(raw||'').replace(/^\/elon(?:@[\w]+)?(?:\s+|$)/i,'').trim();
  let photo=m.photo?.at(-1)?.file_id||'';
  if(m.reply_to_message){
   const r=m.reply_to_message;
   if(r.chat?.id!==m.chat.id||r.from?.is_bot){
    await send(uid,'Faqat shu shaxsiy chatdagi oddiy xabar yoki rasmga javob bering.');return;
   }
   text=String(r.text||r.caption||'').trim();
   photo=r.photo?.at(-1)?.file_id||'';
  }
  if(!text){await send(uid,'📢 E’lon yozing:\n/elon Dasturimizga yangi bo‘lim qo‘shildi!\n\nRasmli e’lon uchun rasmga reply qilib /elon yuboring yoki rasm captioniga /elon va matn kiriting.');return;}
  if(text.length>(photo?1024:3900)){
   await send(uid,'E’lon juda uzun. Rasm uchun 1024, oddiy xabar uchun 3900 belgidan oshmasin.');return;
  }
  const id=randomUUID();
  await db.execute({sql:"INSERT INTO mn_notice_drafts(id,admin_uid,kind,audience,text,photo_id,status,created_at) VALUES(?,?,?,?,?,?,'draft',?)",
   args:[id,String(uid),'update','group',text,photo||null,iso()]});
  await preview(uid,{id,kind:'update',audience:'group',text,photo_id:photo||null});
 }
 async function publish(uid,d){
  const group=(d.audience!=='users')?await groupId():'';
  if(d.audience!=='users'&&!group){
   await send(uid,'❗ Guruh hali ulanmagan. Botni guruhga admin qilib qo‘shing va guruh ichida /ulash yuboring.');return;
  }
  const now=iso();
  const statements=[
   {sql:"UPDATE mn_notice_drafts SET status='queued',submitted_at=? WHERE id=? AND admin_uid=? AND status='draft'",args:[now,d.id,String(uid)]}
  ];
  if(group)statements.push({sql:"INSERT OR IGNORE INTO mn_notice_outbox(notice_id,target,status,created_at) SELECT id,?,'queued',? FROM mn_notice_drafts WHERE id=? AND status='queued'",
   args:['g:'+group,now,d.id]});
  if(d.audience!=='group'){
   const column=d.kind==='promo'?'promotions':'updates';
   statements.push({sql:"INSERT OR IGNORE INTO mn_notice_outbox(notice_id,target,status,created_at) SELECT ?, 'u:'||p.uid,'queued',? FROM mn_notice_prefs p JOIN mn_users u ON u.uid=p.uid WHERE p."+column+"=1 LIMIT 10000",
    args:[d.id,now]});
  }
  const results=await db.batch(statements,'write');
  if(Number(results[0]?.rowsAffected||0)===0){await send(uid,'Bu e’lon allaqachon yuborilgan yoki bekor qilingan.');return;}
  await send(uid,'✅ E’lon yuborish navbatiga qo‘shildi. Yetkazish natijasi: /elonlar\n\nBot faqat ruxsat bergan obunachilarga yozadi.');
  setImmediate(()=>processQueue().catch(e=>console.error('ME Notes announcements worker:',String(e.message).slice(0,100))));
 }
 async function history(uid){
  const q=await db.execute({sql:"SELECT d.id,d.kind,d.status,d.created_at,COUNT(o.target) AS total,SUM(CASE WHEN o.status='sent' THEN 1 ELSE 0 END) AS sent,SUM(CASE WHEN o.status='failed' THEN 1 ELSE 0 END) AS failed,SUM(CASE WHEN o.status IN('queued','sending') THEN 1 ELSE 0 END) AS pending FROM mn_notice_drafts d LEFT JOIN mn_notice_outbox o ON o.notice_id=d.id WHERE d.admin_uid=? GROUP BY d.id ORDER BY d.created_at DESC LIMIT 7",args:[String(uid)]});
  const rows=q.rows.map(d=>(d.kind==='promo'?'📣':'📰')+' '+String(d.created_at).slice(0,16).replace('T',' ')+' · '+(d.status==='draft'?'Qoralama':d.status==='cancelled'?'Bekor':'E’lon')+
    '\n✅ '+Number(d.sent||0)+'  ❌ '+Number(d.failed||0)+'  ⏳ '+Number(d.pending||0));
  await send(uid,'📊 ME Notes e’lonlar statistikasi\n\n'+(rows.join('\n\n')||'E’lonlar yo‘q.')+'\n\nStatistika xabarni yuborish natijasi; uni o‘qiganlar soni emas.');
 }
 async function handlePrivateMessage(m){
  if(m.chat?.type!=='private'||m.from?.id!==m.chat.id)return false;
  const uid=String(m.from.id);
  const raw=String(m.text||m.caption||'').trim();
  const cmd=raw.split(/\s+/)[0].replace(/@[\w]+$/,'').toLowerCase();
  if(cmd==='/guruh'){await showGroup(uid);return true;}
  if(cmd==='/obuna'||cmd==='/xabarnoma'){await preferenceMenu(uid);return true;}
  if(!isAdmin(uid))return false;
  if(cmd==='/elon'){await newDraft(uid,m,raw);return true;}
  if(cmd==='/elonlar'){await history(uid);return true;}
  if(cmd==='/guruhholat'){
   const id=await groupId();
   await send(uid,id?'✅ Guruh ulangan. ID: '+id:'⏳ Guruh ulanmagan. Guruh ichida /ulash yuboring.');
   return true;
  }
  return false;
 }
 async function handleCallback(uid,cmd,cbId){
  if(!String(cmd||'').startsWith('cm:'))return false;
  if(cbId)await answerCallback(cbId);
  if(cmd==='cm:optmenu'){await preferenceMenu(uid);return true;}
  if(cmd==='cm:group'){await showGroup(uid);return true;}
  const opt=/^cm:opt:(updates|promotions):(on|off)$/.exec(cmd);
  if(opt){await setPreference(uid,opt[1],opt[2]==='on');await preferenceMenu(uid);return true;}
  const change=/^cm:d:([a-f0-9-]{36}):(ku|kp|ag|au|ab|send|cancel)$/.exec(cmd);
  if(!change)return true;
  if(!isAdmin(uid)){await send(uid,'Ruxsat yo‘q.');return true;}
  const d=await draft(uid,change[1]);
  if(!d||d.status!=='draft'){await send(uid,'Bu qoralama mavjud emas yoki allaqachon yuborilgan.');return true;}
  const act=change[2];
  if(act==='cancel'){
   await db.execute({sql:"UPDATE mn_notice_drafts SET status='cancelled' WHERE id=? AND admin_uid=? AND status='draft'",args:[d.id,String(uid)]});
   await send(uid,'❌ Qoralama bekor qilindi.');return true;
  }
  if(act==='send'){await publish(uid,d);return true;}
  const field=act[0]==='k'?'kind':'audience';
  const value={ku:'update',kp:'promo',ag:'group',au:'users',ab:'both'}[act];
  await db.execute({sql:'UPDATE mn_notice_drafts SET '+field+'=? WHERE id=? AND admin_uid=? AND status=?',args:[value,d.id,String(uid),'draft']});
  await preview(uid,{...d,[field]:value});
  return true;
 }
 async function processQueue(){
  if(running)return;
  running=true;
  try{
   // Mark BEFORE contacting Telegram: an interrupted send stays "sending" and is
   // not automatically re-sent (avoid duplicate adverts after restarts).
   for(let i=0;i<100;i++){
    const q=await db.execute({sql:"SELECT o.notice_id,o.target,d.text,d.photo_id FROM mn_notice_outbox o JOIN mn_notice_drafts d ON d.id=o.notice_id WHERE o.status='queued' AND d.status='queued' ORDER BY o.created_at,o.target LIMIT 1"});
    const x=q.rows[0];if(!x)break;
    const claimed=await db.execute({sql:"UPDATE mn_notice_outbox SET status='sending' WHERE notice_id=? AND target=? AND status='queued'",args:[x.notice_id,x.target]});
    if(Number(claimed.rowsAffected||0)!==1)continue;
    const target=String(x.target).slice(2);
    try{
     if(x.photo_id)await telegram('sendPhoto',{chat_id:target,photo:String(x.photo_id),caption:String(x.text)});
     else await send(target,String(x.text));
     await db.execute({sql:"UPDATE mn_notice_outbox SET status='sent',finished_at=? WHERE notice_id=? AND target=? AND status='sending'",args:[iso(),x.notice_id,x.target]});
    }catch(e){
     await db.execute({sql:"UPDATE mn_notice_outbox SET status='failed',error=?,finished_at=? WHERE notice_id=? AND target=? AND status='sending'",
      args:[String(e.message||'Telegram xato').slice(0,150),iso(),x.notice_id,x.target]});
    }
    await delay(400); // ~2.5/s; below free bot broadcast limits.
   }
  }finally{running=false;}
 }
 function start(){
  if(timer)return;
  timer=setInterval(()=>processQueue().catch(e=>console.error('ME Notes announcements worker:',String(e.message).slice(0,100))),15000);
  timer.unref?.();
  setImmediate(()=>processQueue().catch(e=>console.error('ME Notes announcements worker:',String(e.message).slice(0,100))));
 }
 function stop(){if(timer){clearInterval(timer);timer=null;}}
 return {init,groupId,preferences,setPreference,handleGroupMessage,handlePrivateMessage,handleCallback,processQueue,start,stop,history};
}
module.exports={createCommunityBot,validInvite};
