'use strict';
// Validate signed Telegram Mini App initData on SERVER only.
// Never trust initDataUnsafe.user.id or a user ID supplied by the browser.
const {createHmac,timingSafeEqual}=require('node:crypto');
function validateInitData(raw,botToken,{now=Math.floor(Date.now()/1000),maxAge=86400}={}){
 if(typeof raw!=='string'||!raw||raw.length>8192)throw Error('Telegram ma’lumoti yo‘q yoki uzun');
 const params=new URLSearchParams(raw);
 const keys=new Set();
 for(const [k] of params){
  if(keys.has(k))throw Error('InitData takroriy maydon');
  keys.add(k);
 }
 const hash=params.get('hash'),authDate=Number(params.get('auth_date'));
 if(!hash||!/^[a-f0-9]{64}$/i.test(hash))throw Error('Telegram imzosi mavjud emas');
 if(!Number.isSafeInteger(authDate)||authDate<=0||authDate>now+120||now-authDate>maxAge)throw Error('Telegram sessiyasi muddati tugagan');
 const check=[...params].filter(([k])=>k!=='hash'&&k!=='signature')
  .map(([k,v])=>k+'='+v).sort().join('\n');
 const secret=createHmac('sha256','WebAppData').update(botToken).digest();
 const signed=createHmac('sha256',secret).update(check).digest('hex');
 if(!timingSafeEqual(Buffer.from(hash.toLowerCase(),'hex'),Buffer.from(signed,'hex')))throw Error('Telegram imzosi noto‘g‘ri');
 let user;
 try{user=JSON.parse(params.get('user')||'null');}catch(e){throw Error('Telegram foydalanuvchisi noto‘g‘ri');}
 if(!user||!Number.isSafeInteger(user.id)||user.id<=0)throw Error('Telegram foydalanuvchisi topilmadi');
 return {uid:String(user.id),authDate};
}
module.exports={validateInitData};
