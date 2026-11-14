'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),test=require('node:test');
const html=fs.readFileSync('me-notes-sahifalab/finance-unified.html','utf8');
const js=fs.readFileSync('me-notes-sahifalab/finance-unified.js','utf8');
const bot=fs.readFileSync('me-notes-bot/server.cjs','utf8');
test('Telegram menu opens finance, never diary by default',()=>{
 assert.match(bot,/web_app:\{url:'https:\/\/me-notes-sahifalab.onrender.com\/finance-unified.html'/);
 assert.doesNotMatch(js,/(?:window\.)?location\.(?:href|replace|assign)\s*\(/);
 assert.doesNotMatch(html,/href="index.html"/);
});
test('Cleanup controls have concrete handlers and selected month safety',()=>{
 for(const id of ['month-test-cleanup','month-reset-preview','reset-include-budgets','month-reset-confirm','month-reset-apply','month-reset-restore'])
  assert.ok(html.includes('id="'+id+'"'),id);
 for(const action of ['month_clear','month_unclear'])assert.ok(js.includes("action:'"+action+"'"));
 assert.match(js,/month=state\.month/);
 assert.match(js,/state\.queue\.length/);
 assert.match(html,/JSON nusxa oling/);
});
test('All referenced DOM IDs exist, no duplicate IDs',()=>{
 const ids=[...html.matchAll(/id="([^"]+)"/g)].map(x=>x[1]);
 assert.equal(new Set(ids).size,ids.length);
 for(const [,id] of js.matchAll(/\$\('([^']+)'\)/g))assert.ok(ids.includes(id),'missing '+id);
});
