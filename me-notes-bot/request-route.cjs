'use strict';
/** Route ordering is explicit so finance requests never fall through to Telegram webhook. */
function requestRoute(method,url){
 if(method==='GET'&&url==='/health')return 'health';
 if(typeof url==='string'&&url.startsWith('/api/v1/'))return 'api';
 if(method==='POST'&&url==='/telegram/webhook')return 'telegram';
 return 'not_found';
}
module.exports={requestRoute};
