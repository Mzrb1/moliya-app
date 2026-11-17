'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8');
const root=read('me-notes-sahifalab/index.html');
const diary=read('me-notes-sahifalab/sahifalab-archive.html');
const finance=read('me-notes-sahifalab/finance-unified.html');
const oldFinance=read('me-notes-sahifalab/finance.html');
const bot=read('me-notes-bot/server.cjs');
test('ME Notes root is now a finance-only landing without lessons',()=>{
 assert.match(root,/<title>ME Notes — Moliya boshqaruvi<\/title>/);
 assert.match(root,/https:\/\/t\.me\/ME_notes_bot/);
 assert.doesNotMatch(root,/Sahifalab|Darslar va ish daftarlari|data-tab="lessons"|lesson2\.js|sahifalab-archive\.html/);
});
test('Original Sahifalab lesson forms and localStorage names remain accessible separately',()=>{
 for(const x of ['data-tab="lessons"','data-tab="entries"','data-tab="backup"','id="export-json"',
   'id="import-file"','id="l2-salary"',"const STORE='moliyaviy_kundalik_sahifalab_v1'",'lesson2.js','diary-month-archive.js']){
  assert.ok(diary.includes(x),'missing archived: '+x);
 }
 const lesson2=read('me-notes-sahifalab/lesson2.js');
 assert.ok(lesson2.includes('me_notes_sahifalab_2dars_v1'));
});
test('No Sahifalab landing link in production finance Mini App or legacy finance page',()=>{
 assert.doesNotMatch(finance,/href="index.html"|sahifalab-archive.html|Darslar va kundalik|Mening kundaligim/);
 assert.doesNotMatch(oldFinance,/href="index.html"|Sahifalab|← Kundalikka/);
 assert.match(oldFinance,/href="finance-unified.html"/);
});
test('Telegram has one chat Menu Mini App URL and chat-first help instead of message Web Apps',()=>{
 assert.match(bot,/FINANCE_MINI_APP_URL='https:\/\/me-notes-sahifalab\.onrender\.com\/finance-unified\.html'/);
 assert.match(bot,/const financeMenuButton=\(\)=>\(\{type:'web_app',text:'Moliya boshqaruvi'/);
 assert.match(bot,/menu_button:financeMenuButton\(\)/);
 const choose=bot.slice(bot.indexOf('async function choose('),bot.indexOf('const help='));
 assert.match(choose,/callback_data:'help:chat'/);
 assert.match(choose,/callback_data:'help:accounts'/);
 assert.doesNotMatch(choose,/web_app:/,'inline chat messages should not open Mini Apps');
 const start=bot.slice(bot.indexOf("if(command==='/start')"),bot.indexOf("if(command==='/hisob')"));
 assert.match(start,/Xarajat va daromadni shu chatning o‘zida/);
 assert.match(start,/25 ming taksi/);
 assert.match(start,/\+3 mln oylik/);
 assert.match(start,/reply_markup:await choose\(uid\)/);
 assert.match(bot,/if\(cmd==='help:chat'\)/);
 assert.match(bot,/if\(cmd==='help:accounts'\)/);
 assert.match(bot,/command==='\/yordam'/);
 assert.match(bot,/pastdagi Menyu yoki bot profilidagi Ochish/);
 assert.doesNotMatch(bot,/sahifalab-archive\.html|index\.html|lesson2\.js/);
});

test('Archived diary remains on same origin so existing device storage key is unchanged',()=>{
 assert.match(read('SAHIFALAB_MIGRATION.md'),/moliyaviy_kundalik_sahifalab_v1/);
 assert.match(read('SAHIFALAB_MIGRATION.md'),/me_notes_sahifalab_2dars_v1/);
 assert.match(read('SAHIFALAB_MIGRATION.md'),/sahifalab-archive\.html/);
});
