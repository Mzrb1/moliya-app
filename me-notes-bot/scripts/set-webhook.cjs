'use strict';
(async()=>{
 const token=process.env.BOT_TOKEN,base=process.env.PUBLIC_BASE_URL,secret=process.env.TELEGRAM_WEBHOOK_SECRET;
 if(!token||!base||!secret)throw Error('BOT_TOKEN, PUBLIC_BASE_URL and TELEGRAM_WEBHOOK_SECRET are required');
 if(!/^https:\/\//.test(base)||!/^[A-Za-z0-9_-]{1,256}$/.test(secret))throw Error('Invalid URL or webhook secret');
 const url=base.replace(/\/+$/,'')+'/telegram/webhook';
 const res=await fetch('https://api.telegram.org/bot'+token+'/setWebhook',{
  method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({url,secret_token:secret,allowed_updates:['message','callback_query'],drop_pending_updates:false})
 });
 const info=await res.json();
 if(!res.ok||!info.ok)throw Error('setWebhook failed: '+String(info.description||res.status));
 console.log('Webhook registered at '+url);
})().catch(e=>{console.error(e.message);process.exit(1);});
