'use strict';
const admin=require('./admin-access.cjs');
function createAdminBot({db,send,answerCallback,isAdmin=admin.isAdmin,lookupName=async()=>false}){
 function menu(){
  return {inline_keyboard:[
   [{text:'👥 Foydalanuvchilar',callback_data:'adm:users:0'},
    {text:'🎁 Qo‘lda bepul berilganlar',callback_data:'adm:grants:0'}],
   [{text:'📢 E’lonlar va statistika',callback_data:'adm:community'}],
   [{text:'ℹ️ Qanday huquq beriladi?',callback_data:'adm:help'}]
  ]};
 }
 function pretty(x){
  return '👤 '+x.name+'\n🆔 '+x.uid+'\n'+
   (x.registered?'✅ Botdan foydalanishni boshlagan':'⏳ Hali /start bosmagan')+'\n'+
   (x.free_forever?'🎁 Doimiy bepul':'🕓 Doimiy bepul emas')+
   (x.manually_granted?'\n📝 Admin tomonidan: '+x.granted_at.slice(0,16).replace('T',' ')+' UTC':'');
 }
 function previewKeyboard(uid,granted){
  return granted
   ?{inline_keyboard:[[{text:'🔙 Admin',callback_data:'adm:home'}]]}
   :{inline_keyboard:[
      [{text:'✅ Shu IDga doimiy bepul berish',callback_data:'adm:grant:'+uid}],
      [{text:'❌ Bekor',callback_data:'adm:home'}]
    ]};
 }
 async function home(uid){
  const s=await admin.stats(db);
  await send(uid,'🛡 ME Notes — yopiq admin panel\n\n'+
    '👥 Ro‘yxatdan o‘tganlar: '+s.users+'\n'+
    '🎁 Avtomatik bepul huquqlilar: '+s.automatic+'\n'+
    '🎫 Qo‘lda bepul huquq berilgan IDlar: '+s.manual+
    '\n\nBepul huquq berish: /grant TELEGRAM_ID\nFoydalanuvchini tekshirish: /find TELEGRAM_ID\n'+
    '📢 E’lon: /elon Matn yoki rasmga reply + /elon\n'+
    '📊 E’lon statistikasi: /elonlar\n'+
    '👥 Guruh holati: /guruhholat\n\n'+
    'Hisob ma’lumotlari va shaxsiy xarajatlar bu yerda ko‘rsatilmaydi.',{reply_markup:menu()});
 }
 async function listing(uid,kind,page){
  let data=await admin.list(db,kind,page);
  const unknown=data.entries.filter(x=>x.registered&&x.name==='Ism hali olinmagan').slice(0,5);
  if(unknown.length){
   await Promise.allSettled(unknown.map(x=>lookupName(x.uid)));
   data=await admin.list(db,kind,page);
  }
  const title=kind==='users'?'👥 ME Notes foydalanuvchilari':'🎁 Qo‘lda bepul huquq berilganlar';
  const text=title+' · '+(page+1)+'-sahifa\n\n'+
    (data.entries.length?data.entries.map((x,i)=>
      (page*10+i+1)+'. '+x.name+'\n🆔 '+x.uid+
      (kind==='users'?(x.manually_granted?' · 🎫 Admin':x.free_forever?' · 🎁 Bepul':' · Oddiy'):
       (x.registered?' · ✅ Faol':' · ⏳ Kutilmoqda'))+
      (x.granted_at?' · '+x.granted_at.slice(0,10):'')).join('\n\n'):'Hozircha ro‘yxat bo‘sh.')+
    '\n\nID ma’lumotini tekshirish: /find ID\nBepul huquq berish: /grant ID';
  const buttons=[];
  const nav=[];
  if(page>0)nav.push({text:'◀️ Oldingi',callback_data:'adm:'+kind+':'+(page-1)});
  if(data.more)nav.push({text:'Keyingi ▶️',callback_data:'adm:'+kind+':'+(page+1)});
  if(nav.length)buttons.push(nav);
  buttons.push([{text:'🔙 Admin',callback_data:'adm:home'}]);
  await send(uid,text,{reply_markup:{inline_keyboard:buttons}});
 }
 async function handleMessage(uid,raw){
  if(!isAdmin(uid))return false;
  const text=String(raw||'').trim();
  const cmd=text.split(/\s+/)[0].replace(/@[\w]+$/,'').toLowerCase();
  if(cmd==='/admin'){await home(uid);return true;}
  if(cmd==='/users'){await listing(uid,'users',0);return true;}
  if(cmd==='/grants'){await listing(uid,'grants',0);return true;}
  if(cmd==='/grant'||cmd==='/find'){
   const target=text.split(/\s+/)[1];
   if(!admin.validUid(target)){
    await send(uid,'Telegram ID noto‘g‘ri.\nMisol: '+cmd+' 123456789');
    return true;
   }
   let profile=await admin.inspect(db,target);
   if(profile.registered&&profile.name==='Ism hali olinmagan'){
    await lookupName(target);
    profile=await admin.inspect(db,target);
   }
   await send(uid,(cmd==='/grant'?'🎁 Bepul huquq berishni tasdiqlang:\n\n':'🔎 Foydalanuvchi ma’lumoti:\n\n')+
    pretty(profile)+(profile.manually_granted?'\n\nHuquq oldin berilgan. Ikkinchi marta kiritilmaydi.':
     '\n\nDiqqat: IDni diqqat bilan tekshiring. Noto‘g‘ri IDga ham huquq berib yuborishingiz mumkin.'),
    {reply_markup:previewKeyboard(target,profile.manually_granted)});
   return true;
  }
  return false;
 }
 async function handleCallback(uid,cmd,cbid){
  if(!String(cmd||'').startsWith('adm:'))return false;
  if(!isAdmin(uid)){if(cbid)await answerCallback(cbid,'Ruxsat yo‘q');return true;}
  if(cbid)await answerCallback(cbid);
  if(cmd==='adm:home'){await home(uid);return true;}
  if(cmd==='adm:community'){
   await send(uid,'📢 ME Notes — e’lonlar boshqaruvi\n\n'+
    '1. Guruhga botni admin qiling va guruh ichida /ulash yuboring.\n'+
    '2. Shaxsiy chatda /elon Yangilik matni yuboring.\n'+
    '3. Rasmli e’lon uchun rasmga javoban /elon yuboring.\n'+
    '4. E’lon turi va auditoriyani tanlang, ko‘rib chiqib tasdiqlang.\n'+
    '5. /elonlar — yuborish statistikasi.\n'+
    'Bot foydalanuvchilarga reklama faqat rozilikdan keyin yuboradi.',{reply_markup:menu()});
   return true;
  }
  if(cmd==='adm:help'){
   await send(uid,'📌 ME Notes — admin yo‘riqnoma\n\n'+
    '1. Foydalanuvchi Telegram ID raqamini oling.\n'+
    '2. /find ID orqali ism/huquqini tekshiring.\n'+
    '3. /grant ID yuboring va tasdiqlang.\n'+
    '4. /grants ro‘yxatida kimga qachon huquq berilganini ko‘ring.\n\n'+
    'Foydalanuvchi hali /start bosmagan bo‘lsa, grant uning IDsi uchun oldindan saqlanadi.\n'+
    'Ism faqat Telegram orqali botga kirgandan keyin ko‘rinadi.',{reply_markup:menu()});
   return true;
  }
  const grantMatch=/^adm:grant:([1-9][0-9]{0,15})$/.exec(cmd);
  if(grantMatch){
   const result=await admin.grant(db,String(uid),grantMatch[1]);
   await send(uid,(result.created?'✅ Doimiy bepul huquq berildi!':'ℹ️ Bu IDga huquq avval berilgan.')+
    '\n\n'+pretty(result),{reply_markup:menu()});
   return true;
  }
  const listMatch=/^adm:(users|grants):([0-9]{1,4})$/.exec(cmd);
  if(listMatch){await listing(uid,listMatch[1],Number(listMatch[2]));return true;}
  await send(uid,'Bu tugma eskirgan. /admin yuboring.');
  return true;
 }
 return {menu,home,listing,handleMessage,handleCallback};
}
module.exports={createAdminBot};
