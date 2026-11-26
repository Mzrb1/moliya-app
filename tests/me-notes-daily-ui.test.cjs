'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8');
const finance=read('me-notes-sahifalab/finance-unified.html');
const controller=read('me-notes-sahifalab/finance-unified.js');
const diary=read('me-notes-sahifalab/sahifalab-archive.html');
const chat=read('me-notes-bot/server.cjs');
test('Production home has no beta badge and retains four finance tabs',()=>{
 assert.doesNotMatch(finance,/Yagona moliya · Sinov/);
 assert.match(finance,/Moliya boshqaruvi/);
 for(const view of ['home','records','budget','report','settings'])assert.ok(finance.includes('id="view-'+view+'"'));
 assert.doesNotMatch(finance,/id="export-data"/);
 assert.match(finance,/id="archive-export"/);
});
test('Existing finance actions and migration remain accessible',()=>{
 for(const id of ['quick-form','manual-form','edit-form','category-form','keyword-form','legacy-file','confirm-import','archive-close','archive-reopen','sync-now']){
  assert.ok(finance.includes('id="'+id+'"'),id);
 }
 assert.match(finance,/<details class="card" id="legacy-migration">/);
 assert.match(finance,/<\/details>/);
});
test('All finance controller DOM references exist (no missing button crash)',()=>{
 const ids=new Set([...finance.matchAll(/id="([^"]+)"/g)].map(x=>x[1]));
 for(const [_,id] of controller.matchAll(/\$\('([^']+)'\)/g))assert.ok(ids.has(id),'Missing #'+id);
 assert.equal(ids.size,[...finance.matchAll(/id="([^"]+)"/g)].length,'duplicate IDs');
});
test('Safety guidance remains while repeated home instructions are removed',()=>{
 assert.match(finance,/Bu bankdagi haqiqiy qoldiq emas/);
 assert.match(finance,/Yozuvlaringiz saqlangan. Ilova xotirasini tozalamang/);
 assert.match(finance,/JSON nusxa oling/);
 assert.doesNotMatch(finance,/Tezkor yozuv faqat joriy oyga kiritiladi/);
 assert.match(controller,/quick-month-hint'\)\.classList\.toggle/);
});
test('Sahifalab lesson content preserved and daily landing concise',()=>{
 assert.match(diary,/>Kundaligim<\/h1>/);
 assert.match(diary,/id="l2-salary"/);
 assert.match(diary,/60 kunlik bitta aniq maqsad/);
 assert.match(diary,/7 kunlik kuzatuv/);
 assert.match(diary,/data-tab="lessons"/);
 assert.match(diary,/data-tab="backup"/);
 assert.match(diary,/const STORE='moliyaviy_kundalik_sahifalab_v1'/);
 assert.doesNotMatch(diary,/Har kuni 1 daqiqa/);
 assert.match(diary,/Telefon xotirasi tozalansa yo‘qolishi mumkin/);
});
test('Telegram /start is concise while detailed reference stays in /yordam',()=>{
 assert.doesNotMatch(chat,/Mini App \(sinov\)/);
 assert.match(chat,/if\(command==='\/start'\)\{/);
 assert.match(chat,/📒 ME Notes\\n📂 Faol hisob:/);
 assert.match(chat,/if\(command==='\/yordam'/);
 assert.match(chat,/25 ming taksi\\ntushlik 35000/);
 assert.doesNotMatch(chat,/Eski offline moliya sahifasi alohida/);
});
test('Offline JS shell cache version advanced; API never cached',()=>{
 const sw=read('me-notes-sahifalab/finance-sw.js');
 assert.ok(Number(sw.match(/finance-shell-v(\d+)/)?.[1])>=4,'shell cache version must not regress');
 assert.match(sw,/req.method!=='GET'/);
 assert.match(sw,/url.origin!==self.location.origin/);
});

test('Record rendering reuses the ledger snapshot and does not compute for every row',()=>{
 const vm=require('node:vm');
 const src=controller.slice(controller.indexOf('function displayRows('),controller.indexOf('function renderPlan('));
 const node=()=>({style:{},children:[],append(...items){this.children.push(...items);},replaceChildren(){this.children=[];}});
 const dest=node(),rows=Array.from({length:150},(_,i)=>({id:'row'+i,kind:'expense',category:'Test',note:'Test',date:'2026-11-27',amount:1000}));
 const draw=vm.runInNewContext(src+'\n displayRows',{el:node,$:()=>dest,money:String,compute:()=>{throw Error('Unexpected per-row ledger calculation');}});
 draw('records',rows,150,false);
 assert.equal(dest.children.length,150);
 assert.equal(dest.children[0].children[1].children.length,3);
 draw('records',rows,150,true);
 assert.equal(dest.children.length,150);
 assert.equal(dest.children[0].children[1].children.length,1);
});
test('Hidden records list is rendered only when the records view is active',()=>{
 const vm=require('node:vm');
 const src=controller.slice(controller.indexOf('function chooseView('),controller.indexOf('function line('));
 const state={views:'home'},calls=[];
 const element={classList:{toggle(){}}};
 const data={items:[{id:'a'}],closedAt:null};
 const choose=vm.runInNewContext(src+'\n chooseView',{state,$:()=>element,document:{querySelectorAll:()=>[]},window:{scrollTo(){}},compute:()=>data,displayRows:(...args)=>calls.push(args)});
 choose('home');
 assert.equal(calls.length,0);
 choose('records');
 assert.equal(calls.length,1);
 assert.equal(calls[0][0],'records');
 assert.equal(calls[0][1],data.items);
 assert.match(controller,/if\(state\.views==='records'\)displayRows\('records',data\.items,150,data\.closedAt\)/);
});
