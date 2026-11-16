'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=fs.readFileSync(path.join(__dirname,'../me-notes-sahifalab/index.html'),'utf8');
const ui=fs.readFileSync(path.join(__dirname,'../me-notes-sahifalab/finance-unified.js'),'utf8');
const script=root.match(/<script id="miniapp-entry-router">([\s\S]*?)<\/script>/)?.[1];
assert.ok(script,'Main Mini App entry router is present');

function opening(url,initData=''){
 const parsed=new URL(url);let redirected=null;
 const loc={href:parsed.href,search:parsed.search,hash:parsed.hash,
  replace(to){redirected=to;}};
 vm.runInNewContext(script,{window:{location:loc,Telegram:{WebApp:{initData}}},URL,URLSearchParams});
 return redirected;
}
test('Main Mini App root opens finance and preserves the signed Telegram launch fragment',()=>{
 const hash='#tgWebAppData=hash%3Dabc&tgWebAppVersion=9.0&tgWebAppPlatform=android';
 const redirect=opening('https://me-notes-sahifalab.onrender.com/'+hash);
 assert.ok(redirect);
 const url=new URL(redirect);
 assert.equal(url.pathname,'/finance-unified.html');
 assert.equal(url.hash,hash,'Telegram initData must survive redirect in fragment');
 assert.equal(url.search,'','InitData must never be copied to URL query');
});
test('Ordinary browser landing stays put: no unsigned finance API session',()=>{
 assert.equal(opening('https://me-notes-sahifalab.onrender.com/'),null);
 assert.equal(opening('https://me-notes-sahifalab.onrender.com/#untrusted'),null);
});
test('App session fallback opens the same finance screen',()=>{
 assert.equal(new URL(opening('https://me-notes-sahifalab.onrender.com/','signed')).pathname,'/finance-unified.html');
});
test('Mini App retries transient connection failures and refreshes chat records on return',()=>{
 assert.match(ui,/function scheduleReconnect\(/);
 assert.match(ui,/if\(recoverable\)scheduleReconnect\(\)/);
 assert.match(ui,/state\.connecting\)return/);
 assert.match(ui,/document\.addEventListener\('visibilitychange'/);
 assert.match(ui,/if\(navigator\.onLine\)pull\(\)/);
 assert.match(ui,/const knownLedger=Boolean\(cached\(\)\)/);
});
