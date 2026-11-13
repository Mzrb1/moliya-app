'use strict';
const assert=require('node:assert/strict'),test=require('node:test');
const A=require('../me-notes-sahifalab/diary-month-archive.js');
const first={id:'old-1',date:'2026-10-31',kind:'income',category:'Daromad',amount:50000,note:'oylik'};
const second={id:'new-1',date:'2026-11-01',kind:'variable',category:'Oziq-ovqat',amount:12000,note:'non'};
const source=()=>({transactions:[first,second],archivedMonths:{},assets:{x:123},goal:{text:'PDF darsidagi maqsad'}});
test('Month filtering never mixes adjacent calendar months',()=>{
 assert.deepEqual(A.monthItems(source().transactions,'2026-10').map(x=>x.id),['old-1']);
 assert.deepEqual(A.monthItems(source().transactions,'2026-11').map(x=>x.id),['new-1']);
});
test('Archive moves only selected old month and preserves unrelated lesson data',()=>{
 const original=source(),archived=A.archive(original,'2026-10','2026-11','2026-11-14');
 assert.deepEqual(archived.transactions.map(t=>t.id),['new-1']);
 assert.deepEqual(archived.archivedMonths['2026-10'].transactions.map(t=>t.id),['old-1']);
 assert.deepEqual(archived.goal,original.goal);
 assert.deepEqual(archived.assets,original.assets);
 assert.equal(original.transactions.length,2);
});
test('Restore round-trip recovers archived transactions exactly once',()=>{
 const original=source(),state=A.archive(original,'2026-10','2026-11');
 const recovered=A.restore(state,'2026-10');
 assert.deepEqual(recovered.transactions.map(t=>t.id).sort(),original.transactions.map(t=>t.id).sort());
 assert.equal(recovered.archivedMonths['2026-10'],undefined);
 assert.throws(()=>A.restore(recovered,'2026-10'));
});
test('Cannot archive current or upcoming month',()=>{
 assert.throws(()=>A.archive(source(),'2026-11','2026-11'));
 assert.throws(()=>A.archive(source(),'2026-12','2026-11'));
});
test('Cannot re-archive an already archived month without restoring',()=>{
 const archived=A.archive(source(),'2026-10','2026-11');
 assert.throws(()=>A.archive({...archived,transactions:[first,second]},'2026-10','2026-11'));
});
test('Restore refuses duplicate transaction IDs and keeps state unchanged',()=>{
 const archived=A.archive(source(),'2026-10','2026-11');
 const corrupt={...archived,transactions:[first,second]};
 assert.throws(()=>A.restore(corrupt,'2026-10'));
 assert.equal(corrupt.archivedMonths['2026-10'].transactions.length,1);
});
test('Monthly backup works on either active or archived state',()=>{
 const current=A.monthBackup(source(),'2026-10');
 const archived=A.monthBackup(A.archive(source(),'2026-10','2026-11'),'2026-10');
 assert.deepEqual(current.transactions,archived.transactions);
 assert.equal(archived.totals.income,50000);
 assert.equal(archived.totals.expense,0);
 assert.equal(archived.month,'2026-10');
});
test('Invalid month is rejected, not silently treated as all months',()=>{
 assert.throws(()=>A.monthItems(source().transactions,'2026-99'));
 assert.throws(()=>A.monthBackup(source(),'all'));
});
test('Diary and finance remain two independent entry points',()=>{
 const fs=require('node:fs');
 const d=fs.readFileSync('me-notes-sahifalab/index.html','utf8');
 const f=fs.readFileSync('me-notes-sahifalab/finance-unified.html','utf8');
 assert.ok(d.includes("const STORE='moliyaviy_kundalik_sahifalab_v1'"));
 assert.ok(d.includes('diary-month-archive.js'));
 assert.ok(!d.includes('href="finance.html"'));
 assert.ok(f.includes('id="view-budget"'));
 assert.ok(f.includes('id="month"'));
});


test('Mini App pins asynchronous ledger responses to their request month',()=>{
 const fs=require('node:fs');
 const src=fs.readFileSync('me-notes-sahifalab/finance-unified.js','utf8');
 const start=src.indexOf('async function fetchLedger()');
 const end=src.indexOf('async function fetchMonthHistory()',start);
 const block=src.slice(start,end);
 assert.ok(block.includes('const wid=state.active,month=state.month;'));
 assert.ok(block.includes("state.base[wid+'|'+month]"));
 assert.ok(!block.includes('state.base[key()]'));
 assert.ok(block.includes("data.month!==month"));
});
test('Diary archival cannot mutate the current calendar month in memory',()=>{
 const orig=source();
 assert.throws(()=>A.archive(orig,'2026-11','2026-11'));
 assert.equal(orig.transactions.length,2);
 assert.equal(Object.keys(orig.archivedMonths).length,0);
});


test('Monthly JSON cannot overwrite full Sahifalab lessons on import',()=>{
 const backup=A.monthBackup(source(),'2026-10');
 assert.throws(()=>A.validateFullBackup(backup),/bir oylik/);
 assert.throws(()=>A.validateFullBackup({format:'me-notes-finance-month-v1',transactions:[]}),/bir oylik/);
});
test('Valid full Sahifalab data still restores after guard',()=>{
 const data={version:1,transactions:[],assets:{},debts:{},estimated:{income:{},fixed:{},variable:{}},
 reflections:{q1:'',q2:'',q3:''},goal:{text:'',start:'2026-11-14'},promise:{days:[]}};
 assert.equal(A.validateFullBackup(data),true);
 assert.throws(()=>A.validateFullBackup({transactions:[]} ),/To‘liq/);
});
