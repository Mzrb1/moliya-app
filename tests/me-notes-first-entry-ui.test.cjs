'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync('me-notes-sahifalab/finance-unified.html','utf8');
const js=fs.readFileSync('me-notes-sahifalab/finance-unified.js','utf8');
test('First entry on mobile offers explicit income and expense with amount and note',()=>{
 for(const id of ['simple-form','simple-income','simple-expense','simple-amount','simple-note','simple-save','first-entry-hint','simple-month-hint']){
  assert.ok(html.includes('id="'+id+'"'),id);
 }
 assert.match(html,/aria-pressed="true">＋ Kirim/);
 assert.match(html,/aria-pressed="false">− Xarajat/);
 assert.match(js,/function saveSimpleEntry\(e\)/);
 assert.match(js,/F\.amount\(Number\(\$\('simple-amount'\)\.value\)\)/);
 assert.match(js,/F\.categoryFor\(/);
 assert.match(js,/enqueue\(\{action:'add',entry:/);
});
test('Legacy bulk and manual forms remain available in records, not home',()=>{
 const home=html.slice(html.indexOf('<section id="view-home">'),html.indexOf('<section id="view-records"'));
 const records=html.slice(html.indexOf('<section id="view-records"'),html.indexOf('<section id="view-report"'));
 for(const id of ['quick-form','manual-form','manual-toggle'])assert.ok(records.includes('id="'+id+'"'));
 assert.doesNotMatch(home,/id="quick-form"|id="manual-form"/);
 assert.match(records,/record-tools/);
});
test('No change to finance account controls, history, queue or security',()=>{
 for(const id of ['workspace','month','new-account','manage-accounts','account-manager','recent','records','net','income','expense']){
  assert.ok(html.includes('id="'+id+'"'),id);
 }
 assert.match(html,/Bu bankdagi haqiqiy qoldiq emas/);
 assert.match(js,/state\.queue\.push\(op\)/);
 assert.match(js,/X-Telegram-Init-Data/);
 assert.match(js,/if\(data\.closedAt\)throw Error/);
 assert.match(js,/\$\('simple-save'\)\.disabled=!quickIsCurrent\|\|!!data\.closedAt/);
});
