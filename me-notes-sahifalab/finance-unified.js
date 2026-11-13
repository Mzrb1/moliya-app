/* ME Notes — phone-first unified finance dashboard. No bot token in browser. */
(()=>{'use strict';
const F=window.MEFinanceCore,$=id=>document.getElementById(id),money=F.money;
const API='https://me-notes-chat-test.onrender.com/api/v1';
const tg=window.Telegram?.WebApp||null;
const initData=String(tg?.initData||'');
const cacheUid=String(tg?.initDataUnsafe?.user?.id||'');
const CACHE_KEY='me_notes_unified_cache_'+cacheUid,QUEUE_KEY='me_notes_unified_queue_'+cacheUid;
const state={uid:cacheUid,workspaces:[],active:null,month:F.today().slice(0,7),views:'home',base:{},queue:[],online:false,storageOK:true,busy:false};
let legacyBackup=null;
function el(tag,cls,text){const x=document.createElement(tag);if(cls)x.className=cls;if(text!==undefined)x.textContent=text;return x;}
function alertMessage(text,ok=false){
 const zone=$('notices');zone.replaceChildren();
 if(!text)return;
 zone.append(el('div','notice'+(ok?' ok':''),text));
}
function restore(){
 try{
  const cache=JSON.parse(localStorage.getItem(CACHE_KEY)||'null');
  if(cache&&typeof cache==='object'&&Array.isArray(cache.workspaces)&&cache.base&&typeof cache.base==='object'){
   state.workspaces=cache.workspaces;state.active=cache.active;state.base=cache.base;
  }
  const pending=JSON.parse(localStorage.getItem(QUEUE_KEY)||'[]');
  if(!Array.isArray(pending)||pending.length>3000)throw Error('Navbat ma’lumoti noto‘g‘ri');
  state.queue=pending;
 }catch(e){state.storageOK=false;alertMessage('Saqlangan ma’lumotlarni o‘qishda xato. Yo‘qotmaslik uchun yangi yozuv kiritish to‘xtatildi.');}
}
function save(){
 if(!state.storageOK)throw Error('Mahalliy xotira ishlamayapti');
 localStorage.setItem(CACHE_KEY,JSON.stringify({workspaces:state.workspaces,active:state.active,base:state.base}));
 localStorage.setItem(QUEUE_KEY,JSON.stringify(state.queue));
}
const key=()=>state.active+'|'+state.month;
function current(){return state.workspaces.find(x=>x.id===state.active)||null;}
function cached(){return state.base[key()]||null;}
function compute(){
 const w=current();if(!w)return null;
 const snapshot=cached()||{transactions:[],budgets:{}};
 const items=(snapshot.transactions||[]).map(t=>({...t}));
 const budgets={...(snapshot.budgets||{})};
 for(const op of state.queue){
  if(op.workspace_id!==w.id)continue;
  if(op.action==='add'||op.action==='add_many'){
   const rows=op.action==='add'?[op.entry]:op.entries;
   rows.forEach((x,i)=>{if(x.date.slice(0,7)===state.month)items.unshift({...x,id:'pending:'+op.op_id+':'+i});});
  }else if(op.action==='delete'){
   const pos=items.findIndex(t=>t.id===op.transaction_id);
   if(pos>=0)items.splice(pos,1);
  }else if(op.action==='budget'&&op.month===state.month){
   if(Number(op.limit)===0)delete budgets[op.category];else budgets[op.category]=Number(op.limit);
  }
 }
 const shadow={kind:w.kind,categories:F.BASE[w.kind],transactions:items,budgets:{[state.month]:budgets}};
 const summary=F.summary(shadow,state.month);
 return {items,summary,plan:F.salaryAllocation(shadow,state.month),w};
}
function noteStatus(text){
 $('sync-status').textContent=text||((state.online?'🟢 Telegram bilan ulangan':'🟠 Offline / ulanmagan')+
  (state.queue.length?' · '+state.queue.length+' ta amal navbatda':''));
 $('sync-status').className='status'+(!state.online?' warn':'');
 $('queue-info').textContent=state.queue.length?
  state.queue.length+' ta saqlangan amal internet qaytganda Turso bazasiga yuboriladi. Yuborilmaguncha Telegram chatida ko‘rinmaydi.':
  'Sinxronlanmagan yangi amal yo‘q.';
}
async function request(path,options={}){
 if(!initData)throw Error('Telegram orqali ilovani oching');
 const headers={'X-Telegram-Init-Data':initData};
 if(options.body!==undefined)headers['Content-Type']='application/json';
 const res=await fetch(API+path,{method:options.method||'GET',headers,body:options.body===undefined?undefined:JSON.stringify(options.body),signal:AbortSignal.timeout(14000),cache:'no-store'});
 const obj=await res.json().catch(()=>({error:'Serverdan noto‘g‘ri javob'}));
 if(!res.ok||!obj.ok){
  const err=new Error(obj.error||('HTTP '+res.status));err.status=res.status;throw err;
 }
 return obj;
}
async function fetchWorkspaces(){
 const data=await request('/workspaces');
 state.workspaces=data.workspaces;state.active=data.active||data.workspaces[0]?.id||null;
 save();
}
async function fetchLedger(){
 if(!current())return;
 const data=await request('/ledger?workspace='+encodeURIComponent(state.active)+'&month='+encodeURIComponent(state.month));
 state.base[key()]={transactions:data.transactions,budgets:data.budgets};
 save();
}
async function pull(){
 if(!initData)return;
 try{await fetchWorkspaces();state.online=true;await flush();await fetchLedger();state.online=true;render();noteStatus();}
 catch(e){
  state.online=false;
  alertMessage(e.status===401?'Telegram sessiyasi eskirgan: botdan Mini App’ni qayta oching.':'Server bilan bog‘lanib bo‘lmadi. Oldingi saqlangan natija ko‘rsatilmoqda.');
  noteStatus();render();
 }
}
function newOp(data){
 return {op_id:'web_'+crypto.randomUUID(),workspace_id:state.active,...data};
}
function enqueue(data){
 if(!state.storageOK)throw Error('Xotirada saqlash imkoni yo‘q');
 if(state.queue.length>250)throw Error('Navbatda 250 tadan ko‘p amal. Avval internetni ulang');
 const op=newOp(data);
 state.queue.push(op);
 try{save();}catch(e){state.queue.pop();throw e;}
 render();noteStatus();flush();
}
async function flush(){
 if(state.busy||!initData||!navigator.onLine||!state.queue.length)return;
 state.busy=true;
 try{
  while(state.queue.length){
   const op=state.queue[0];
   try{
    await request('/op',{method:'POST',body:op});
    state.queue.shift();save();
    state.online=true;
   }catch(e){
    state.online=false;
    alertMessage(e.status===401?'Telegram sessiyasi tugagan, Mini App’ni qayta oching.':(
     e.status&&e.status<500?'Saqlanmagan amalda xato: '+e.message+'. Ma’lumot o‘chirilmagan.':
     'Ulanish uzildi. Yozuvlar navbatda xavfsiz saqlangan.'));
    break;
   }
  }
 }finally{state.busy=false;noteStatus();render();}
 if(!state.queue.length&&state.online){
  try{await fetchWorkspaces();await fetchLedger();render();noteStatus();}catch(e){state.online=false;noteStatus();}
 }
}
function chooseView(name){
 state.views=name;
 for(const view of ['home','records','budget','settings'])$('view-'+view).classList.toggle('hidden',view!==name);
 document.querySelectorAll('.bottom [data-view]').forEach(x=>x.classList.toggle('active',x.dataset.view===name));
 window.scrollTo?.({top:0,behavior:'smooth'});
}
function line(name,value,detail){
 const row=el('div','line row between'),left=el('div');
 left.append(el('div','strong',name));
 if(detail)left.append(el('div','tiny',detail));
 row.append(left,el('span','strong',value));return row;
}
function displayRows(target,items,limit=100){
 const dest=$(target);dest.replaceChildren();
 if(!items.length){dest.append(el('div','empty','Hozircha yozuvlar yo‘q.'));return;}
 for(const t of items.slice(0,limit)){
  const row=el('div','line row between');
  const info=el('div','grow');
  const sign=t.kind==='income'?'+':'−';
  info.append(el('div','strong',t.category));
  info.append(el('div','tiny',t.date+' · '+(t.note||'')+(t.id.startsWith('pending:')?' · Yuborilmoqda':'')));
  const end=el('div');end.style.textAlign='right';
  end.append(el('div','strong '+(t.kind==='income'?'green':'red'),sign+money(t.amount)));
  if(target==='records'&&!t.id.startsWith('pending:')){
   const button=el('button','btn warning','O‘chirish');button.style.cssText='font-size:11px;padding:5px 8px;min-height:30px;margin-top:5px';
   button.type='button';
   button.onclick=()=>{
    if(confirm('Shu xarajatni o‘chirasizmi?')){try{enqueue({action:'delete',transaction_id:t.id});}catch(e){alertMessage(e.message);}}
   };
   end.append(button);
  }
  row.append(info,end);dest.append(row);
 }
 if(items.length>limit)dest.append(el('p','tiny','Faqat so‘nggi '+limit+' ta yozuv ko‘rsatildi.'));
}
function renderPlan(data){
 const container=$('allocation');container.replaceChildren();
 const p=data.plan;
 $('allocation-intro').textContent=p?'Maoshdagi mablag‘ reja sifatida bo‘lingan. Bu qo‘shimcha xarajat emas.':
  'Shaxsiy hisobda “+5 mln oylik” yozsangiz, avtomatik taqsimot ko‘rinadi.';
 if(!p)return;
 container.append(el('div','value',money(p.salary)));
 for(const [field,label] of F.SALARY_BUCKETS)container.append(line(label,money(p[field])));
 if(p.hardShortfall>0)container.append(el('div','notice','⚠️ Qat’iy Ro‘zg‘or limitlari uchun '+money(p.hardShortfall)+' yetishmaydi. Qat’iy limitlar avtomatik kamaytirilmaydi.'));
 if(p.leisureShortfall>0)container.append(el('div','notice','⚠️ Dam olish limitiga '+money(p.leisureShortfall)+' yetishmaydi.'));
}
function renderBudgets(data){
 const dest=$('limits');dest.replaceChildren();
 const cats=data.summary.budgets;
 for(const item of cats){
  const block=el('div','line'),title=el('div','row between');
  title.append(el('span','strong',item.category),el('span','tiny',(item.mode==='fixed'?'Qat’iy':item.mode==='auto'?'Taxminiy':'Limit yo‘q')+' · '+money(item.spent)+' / '+money(item.limit)));
  block.append(title);
  const bar=el('div','bar'),fill=el('div','bar-fill'+(item.limit&&item.spent>=item.limit?' over':''));
  fill.style.width=(item.limit?Math.min(100,item.spent/item.limit*100):0)+'%';bar.append(fill);block.append(bar);
  const actions=el('div','flex gap-top'),inp=el('input');inp.type='number';inp.min='0';inp.step='1';inp.placeholder=String(item.limit||0);inp.style.maxWidth='155px';
  if(item.mode==='fixed')inp.value=String(item.limit);
  const set=el('button','btn alt','Qat’iy saqlash');set.type='button';
  set.onclick=()=>{const n=Number(inp.value);if(!inp.value||!Number.isSafeInteger(n)||n<=0){alertMessage('Qat’iy limit uchun musbat butun summa kiriting.');return;}try{enqueue({action:'budget',month:state.month,category:item.category,limit:n});alertMessage('Limit saqlash uchun navbatga qo‘shildi.',true);}catch(e){alertMessage(e.message);}};
  actions.append(inp,set);
  if(item.mode==='fixed'){
   const reset=el('button','btn alt','Avtomatik');reset.type='button';
   reset.onclick=()=>{try{enqueue({action:'budget',month:state.month,category:item.category,limit:0});}catch(e){alertMessage(e.message);}};
   actions.append(reset);
  }
  block.append(actions);dest.append(block);
 }
}
function render(){
 const w=current(),data=compute();
 $('app').classList.toggle('hidden',!w);
 if(!w){noteStatus();return;}
 const selector=$('workspace');selector.replaceChildren(...state.workspaces.map(x=>{
  const o=el('option');o.value=x.id;o.textContent=x.name+' · '+F.KINDS[x.kind];return o;
 }));selector.value=state.active;
 $('account-kind').textContent=F.KINDS[w.kind];
 $('month').value=state.month;
 if(!data)return;
 $('net').textContent=money(data.summary.net);
 $('income').textContent=money(data.summary.income);
 $('expense').textContent=money(data.summary.expense);
 displayRows('recent',data.items,3);
 displayRows('records',data.items,150);
 renderPlan(data);renderBudgets(data);noteStatus();
}
function parseInput(raw){
 const list=F.parseList(raw);
 let items;
 if(list){
  if(list.errors.length){throw Error('Quyidagi qatorlarni tuzating: '+list.errors.slice(0,4).map(e=>e.line+'-qator ('+e.reason+')').join(', '));}
  items=list.items;
 }else{
  let one;try{one=F.parseFast(raw);}catch(e){one=null;}
  if(!one)throw Error('Misol: 25 ming taksi yoki Tushlik 35000');
  items=[one];
 }
 const w=current();
 return items.map(x=>({kind:x.kind,amount:x.amount,date:F.today(),note:x.note,category:F.categoryFor({kind:w.kind,categories:F.BASE[w.kind]},x.kind,x.note)}));
}
function showPreview(){
 const raw=$('quick-text').value;
 const target=$('quick-preview');
 if(!raw.trim()){target.textContent='';return;}
 try{
  const parts=parseInput(raw);
  target.textContent=parts.map(x=>x.category+' '+money(x.amount)).join(' · ');
 }catch(e){target.textContent='Tekshiring: '+e.message;}
}
function exportData(){
 const data=compute();if(!data)return;
 const payload={exported_at:new Date().toISOString(),workspace:current(),month:state.month,transactions:data.items,pending:state.queue};
 const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
 const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download='me_notes_yagona_'+state.month+'.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);
}
function previewLegacy(raw){
 legacyBackup=F.validate(raw);
 const accounts=legacyBackup.workspaces;
 if(!accounts.length)throw Error('Eski JSON zaxirada hisoblar yo‘q');
 const selector=$('legacy-workspace');selector.replaceChildren();
 for(const w of accounts){
  const opt=el('option');opt.value=w.id;opt.textContent=w.name+' · '+F.KINDS[w.kind]+' · '+w.transactions.length+' yozuv';
  selector.append(opt);
 }
 $('import-panel').classList.remove('hidden');
 $('legacy-preview').textContent=accounts.length+' ta eski hisob topildi. Ko‘chirishdan oldin hisobni tanlang va yozuvlarni tekshiring.';
}
function importLegacy(){
 try{
  if(!legacyBackup)throw Error('Avval eski JSON zaxirani tanlang');
  const original=legacyBackup.workspaces.find(w=>w.id===$('legacy-workspace').value);
  const dest=current();
  if(!original||!dest)throw Error('Hisob tanlanmagan');
  if(original.kind!==dest.kind)throw Error('Ikkala hisob turi bir xil bo‘lishi kerak. Avval mos hisobga o‘ting');
  const transactions=original.transactions;
  if(!transactions.length)throw Error('Eski hisobda yozuvlar yo‘q');
  if(transactions.length>4000)throw Error('Bir importda eng ko‘pi 4000 yozuv. Bunday kattaroq bazani alohida xavfsiz ko‘chirish kerak');
  const amounts=transactions.reduce((a,x)=>{
   a[x.kind]+=x.amount;return a;
  },{income:0,expense:0});
  const confirmText=dest.name+' hisobiga '+transactions.length+' ta eski yozuvni qo‘shasiz.\n'+
   'Eski kirim: '+money(amounts.income)+', eski chiqim: '+money(amounts.expense)+'.\n'+
   'DIQQAT: chatga oldin yozgan bir xil xarajatlaringiz bo‘lsa, JAMI IKKI MARTA HISOBLANADI. Davom etasizmi?';
  if(!confirm(confirmText)||!confirm('Original ma’lumotlar o‘chirilmaydi. Zaxira faylingiz saqlanganmi? Ko‘chirishni boshlaysizmi?'))return;
  const pieces=[];
  for(let i=0;i<transactions.length;i+=20){
   const chunk=transactions.slice(i,i+20).map(t=>({source_id:t.id,kind:t.kind,category:t.category,amount:t.amount,note:t.note,date:t.date}));
   pieces.push(newOp({action:'import',source_workspace:original.id,source_kind:original.kind,entries:chunk}));
  }
  if(state.queue.length+pieces.length>250)throw Error('Sinxronlash navbati to‘lgan, avval mavjud amallarni yuboring');
  if(!state.storageOK)throw Error('Mahalliy xotirada saqlash imkoni yo‘q');
  state.queue.push(...pieces);
  try{save();}catch(e){state.queue.splice(-pieces.length,pieces.length);throw e;}
  alertMessage(transactions.length+' ta eski yozuv xavfsiz navbatga qo‘shildi. Internet tiklansa Turso’ga yuboriladi.',true);
  noteStatus();flush();
 }catch(e){alertMessage(e.message||'Import xatosi');}
}

function setup(){
 if(tg){try{tg.ready();tg.expand();}catch(e){}}
 $('month').value=state.month;
 document.querySelectorAll('[data-view]').forEach(btn=>btn.addEventListener('click',()=>chooseView(btn.dataset.view)));
 $('open-settings').onclick=()=>chooseView('settings');
 $('month').onchange=async()=>{
  state.month=$('month').value;if(!F.validMonth(state.month))state.month=F.today().slice(0,7);
  render();try{await fetchLedger();render();}catch(e){noteStatus('Offline: eski ma’lumot ko‘rsatilmoqda');}
 };
 $('workspace').onchange=()=>{
  state.active=$('workspace').value;
  try{enqueue({action:'switch'});fetchLedger().then(render).catch(()=>{});}catch(e){alertMessage(e.message);}
 };
 $('quick-text').addEventListener('input',showPreview);
 $('quick-form').onsubmit=e=>{
  e.preventDefault();
  try{
   const parts=parseInput($('quick-text').value);
   enqueue(parts.length===1?{action:'add',entry:parts[0]}:{action:'add_many',entries:parts});
   $('quick-text').value='';showPreview();
   alertMessage(parts.length+' ta yozuv telefonda saqlandi, serverga yuboriladi.',true);
  }catch(err){alertMessage(err.message);}
 };
 $('new-account').onclick=()=>{$('account-form').classList.toggle('hidden');};
 $('account-form').onsubmit=e=>{
  e.preventDefault();
  if(state.queue.length){alertMessage('Hisob ochishdan oldin navbatdagi yozuvlarni sinxronlang.');return;}
  const kind=$('account-type').value,name=$('account-name').value.trim();
  try{enqueue({action:'new_workspace',new_kind:kind,name:name.slice(0,60)});$('account-form').classList.add('hidden');$('account-name').value='';}
  catch(err){alertMessage(err.message);}
 };
 $('detect-legacy').onclick=()=>{
  try{
   const raw=localStorage.getItem('me_notes_finance_v1');
   if(!raw)throw Error('Shu brauzerda eski moliya xotirasi topilmadi. Eski sahifadan JSON zaxira olib import qiling');
   previewLegacy(JSON.parse(raw));
  }catch(e){alertMessage(e.message);}
 };
 $('legacy-file').onchange=async(e)=>{
  try{
   const file=e.target.files?.[0];if(!file)return;
   if(file.size>8000000)throw Error('Zaxira fayli 8 MB dan oshmasin');
   previewLegacy(JSON.parse(await file.text()));
  }catch(err){alertMessage('Zaxira o‘qilmadi: '+err.message);}
 };
 $('confirm-import').onclick=importLegacy;
 $('sync-now').onclick=pull;
 $('export-data').onclick=exportData;
 window.addEventListener('online',()=>{flush();pull();});
 window.addEventListener('offline',()=>{state.online=false;noteStatus();});
 if('serviceWorker' in navigator)navigator.serviceWorker.register('./finance-sw.js').catch(()=>{});
 restore();
 if(!initData||!cacheUid){$('welcome').classList.remove('hidden');$('sync-status').textContent='Telegram tasdiqlangan sessiyasi kerak';return;}
 render();pull();
}
setup();
})();
