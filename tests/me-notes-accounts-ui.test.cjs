'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const h=fs.readFileSync('me-notes-sahifalab/finance-unified.html','utf8');
const js=fs.readFileSync('me-notes-sahifalab/finance-unified.js','utf8');
const bot=fs.readFileSync('me-notes-bot/server.cjs','utf8');
test('Account management controls are visible in finance Mini App',()=>{
 for(const id of ['workspace','new-account','account-form','manage-accounts','account-manager','active-accounts','archived-accounts','create-account-submit'])
  assert.ok(h.includes('id="'+id+'"'),id);
 assert.match(h,/Hisobni ochish/);
 assert.match(h,/Yopilgan hisoblar/);
});
test('Account management supports close and restore without permanent deletion',()=>{
 for(const action of ['workspace_archive','workspace_restore','workspace_rename','new_workspace'])
  assert.ok(js.includes("'"+action+"'"),action);
 assert.match(js,/directAccountOp\(/);
 assert.match(js,/renderAccounts\(/);
 assert.match(js,/Yozuvlar saqlanadi|Yozuvlar va limitlar saqlanadi|barcha yozuvlari/i);
 assert.doesNotMatch(js,/DELETE FROM mn_transactions/);
});
test('Account creation and archive operations require online state and empty sync queue',()=>{
 assert.match(js,/!state\.online\|\|!navigator\.onLine/);
 assert.match(js,/state\.busy\|\|state\.queue\.length/);
 assert.match(js,/typed\.trim\(\)!==w\.name/);
 assert.match(js,/confirm\('“'\+w\.name/);
});
test('Chat account selection no longer has stale quick-create buttons',()=>{
 assert.doesNotMatch(bot,/callback_data:'new:personal'/);
 assert.doesNotMatch(bot,/callback_data:'new:family'/);
 assert.match(bot,/Old Telegram messages may contain obsolete quick-create/);
 assert.match(bot,/Hisob ochish \/ boshqarish/);
 assert.match(bot,/mn_workspace_archive/);
});
test('All finance JS references resolve to unique HTML IDs',()=>{
 const ids=[...h.matchAll(/id="([^"]+)"/g)].map(x=>x[1]);
 assert.equal(new Set(ids).size,ids.length);
 for(const [,id] of js.matchAll(/\$\('([^']+)'\)/g))assert.ok(ids.includes(id),'Missing ID: '+id);
});
