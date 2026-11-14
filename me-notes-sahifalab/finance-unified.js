/* ME Notes — phone-first unified finance dashboard. No bot token in browser. */
(()=>{'use strict';
const F=window.MEFinanceCore,$=id=>document.getElementById(id),money=F.money;
const API='https://me-notes-chat-test.onrender.com/api/v1';
const tg=window.Telegram?.WebApp||null;
const initData=String(tg?.initData||'');
const cacheUid=String(tg?.initDataUnsafe?.user?.id||'');
const CACHE_KEY='me_notes_unified_cache_'+cacheUid,QUEUE_KEY='me_notes_unified_queue_'+cacheUid;
const state={uid:cacheUid,workspaces:[],active:null,month:F.today().slice(0,7),seenToday:F.today().slice(0,7),views:'home',base:{},queue:[],months:[],online:false,storageOK:true,busy:false};
let legacyBackup=null;
let editingId=null;
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
 const prefs={categories:structuredClone(snapshot.category_options||F.BASE[w.kind]),
  keywords:structuredClone(snapshot.keywords||{income:{},expense:{}})};
 for(const op of state.queue){
  if(op.workspace_id!==w.id)continue;
  if(op.action==='add'||op.action==='add_many'){
   const rows=op.action==='add'?[op.entry]:op.entries;
   rows.forEach((x,i)=>{if(x.date.slice(0,7)===state.month)items.unshift({...x,id:'pending:'+op.op_id+':'+i});});
  }else if(op.action==='delete'){
   const pos=items.findIndex(t=>t.id===op.transaction_id);
   if(pos>=0)items.splice(pos,1);
  }else if(op.action==='edit'){
   const index=items.findIndex(t=>t.id===op.transaction_id);
   if(index>=0){items[index]={...items[index],...op.entry};
    if(items[index].date.slice(0,7)!==state.month)items.splice(index,1);}
  }else if(op.action==='budget'&&op.month===state.month){
   if(Number(op.limit)===0)delete budgets[op.category];else budgets[op.category]=Number(op.limit);
  }else if(op.action==='category_add'){
   if(prefs.categories[op.kind]&&!prefs.categories[op.kind].includes(op.name))prefs.categories[op.kind].push(op.name);
  }else if(op.action==='category_delete'){
   if(prefs.categories[op.kind])prefs.categories[op.kind]=prefs.categories[op.kind].filter(x=>x!==op.name);
  }else if(op.action==='keyword_add'){
   const lst=(prefs.keywords[op.kind]??={})[op.category]??=[];
   if(!lst.includes(op.word))lst.push(op.word);
   prefs.keywords[op.kind][op.category]=lst;
  }else if(op.action==='keyword_delete'){
   const lst=prefs.keywords[op.kind]?.[op.category];
   if(lst)prefs.keywords[op.kind][op.category]=lst.filter(x=>x!==op.word);
  }
 }
 const shadow={kind:w.kind,categories:prefs.categories,keywords:prefs.keywords,transactions:items,budgets:{[state.month]:budgets}};
 const summary=F.summary(shadow,state.month);
 return {items,summary,plan:F.salaryAllocation(shadow,state.month),w,prefs,closedAt:snapshot.closed_at||null};
}
function noteStatus(text){
 $('sync-status').textContent=text||((state.online?'🟢 Telegram bilan ulangan':'🟠 Offline / ulanmagan')+
  (state.queue.length?' · '+state.queue.length+' ta amal navbatda':''));
 $('sync-status').className='status'+(!state.online?' warn':'');
 $('queue-info').textContent=state.queue.length?
  state.queue.length+' ta yozuv yuborilishini kutmoqda.':
  'Barcha yozuvlar yuborilgan.';
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
 const wid=state.active,month=state.month;
 const workspace=state.workspaces.find(w=>w.id===wid);
 if(!workspace)return;
 const data=await request('/ledger?workspace='+encodeURIComponent(wid)+'&month='+encodeURIComponent(month));
 // Pin an asynchronous response to the requested account and month, not the
 // account/month currently selected when it eventually arrives.
 if(data.workspace?.id!==wid||data.month!==month)throw Error('Serverdan boshqa oy yoki hisob kelgan');
 state.base[wid+'|'+month]={transactions:data.transactions,budgets:data.budgets,closed_at:data.closed_at||null,
  category_options:data.category_options||F.BASE[workspace.kind],
  keywords:data.keywords||{income:{},expense:{}}};
 save();
}
async function fetchMonthHistory(){
 const wid=state.active;
 if(!state.workspaces.some(w=>w.id===wid))return;
 const data=await request('/months?workspace='+encodeURIComponent(wid));
 if(wid!==state.active)return;
 state.months=data.months;
 renderMonthHistory();
}
async function pull(){
 if(!initData)return;
 $('connection-help').classList.add('hidden');
 try{
  await fetchWorkspaces();state.online=true;await flush();await fetchLedger();await fetchMonthHistory();
  state.online=true;render();noteStatus();alertMessage('');
  $('connection-help').classList.add('hidden');
 }catch(e){
  state.online=false;
  const message=e.status===401?'Telegram sessiyasi tugagan. Botga /start yuborib, Mini App tugmasidan qayta kiring.':
   e.status===403?'Mini App’ni ME Notes botining tugmasi orqali oching.':
   e.status===404?'Mini App serveriga ulanish yo‘li topilmadi. Ilova yangilanganini tekshiring.':
   'Server bilan aloqa uzildi. Internetni tekshiring va qayta urinib ko‘ring.';
  alertMessage(message);
  $('connection-explain').textContent=message;
  $('connection-help').classList.toggle('hidden',!!current());
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
  try{await fetchWorkspaces();await fetchLedger();await fetchMonthHistory();render();noteStatus();}catch(e){state.online=false;noteStatus();}
 }
}
function chooseView(name){
 state.views=name;
 for(const view of ['home','records','budget','report','settings'])$('view-'+view).classList.toggle('hidden',view!==name);
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
  if(target==='records'&&!t.id.startsWith('pending:')&&!compute()?.closedAt){
   const edit=el('button','btn alt','Tahrirlash');
   edit.type='button';edit.style.cssText='font-size:11px;padding:5px 8px;min-height:30px;margin-top:5px';
   edit.onclick=()=>openEdit(t);
   const button=el('button','btn warning','O‘chirish');
   button.style.cssText='font-size:11px;padding:5px 8px;min-height:30px;margin:5px 0 0 4px';
   button.type='button';
   button.onclick=()=>{
    if(confirm('Shu yozuvni o‘chirasizmi?')){try{enqueue({action:'delete',transaction_id:t.id});}catch(e){alertMessage(e.message);}}
   };
   end.append(edit,button);
  }
  row.append(info,end);dest.append(row);
 }
 if(items.length>limit)dest.append(el('p','tiny','Faqat so‘nggi '+limit+' ta yozuv ko‘rsatildi.'));
}
function renderPlan(data){
 const container=$('allocation');container.replaceChildren();
 const p=data.plan;
 $('allocation-intro').textContent=p?'Rejadagi mablag‘lar (xarajat emas).':
  'Maosh kirimidan keyin taqsimot ko‘rinadi.';
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
  const set=el('button','btn alt','Qat’iy saqlash');set.type='button';set.disabled=!!data.closedAt;
  set.onclick=()=>{const n=Number(inp.value);if(!inp.value||!Number.isSafeInteger(n)||n<=0){alertMessage('Qat’iy limit uchun musbat butun summa kiriting.');return;}try{enqueue({action:'budget',month:state.month,category:item.category,limit:n});alertMessage('Limit saqlash uchun navbatga qo‘shildi.',true);}catch(e){alertMessage(e.message);}};
  actions.append(inp,set);
  if(item.mode==='fixed'){
   const reset=el('button','btn alt','Avtomatik');reset.type='button';reset.disabled=!!data.closedAt;
   reset.onclick=()=>{try{enqueue({action:'budget',month:state.month,category:item.category,limit:0});}catch(e){alertMessage(e.message);}};
   actions.append(reset);
  }
  block.append(actions);dest.append(block);
 }
}
function fillCategory(id,kind,selected){
 const d=compute();
 const list=d?.prefs?.categories?.[kind]||F.BASE[current()?.kind||'personal'][kind]||[];
 const select=$(id),value=selected??select.value;
 select.replaceChildren(...list.map(cat=>{const opt=el('option');opt.value=cat;opt.textContent=cat;return opt;}));
 select.value=list.includes(value)?value:(list.includes('Boshqa')?'Boshqa':list[0]||'');
}
function openEdit(tx){
 editingId=tx.id;
 $('edit-kind').value=tx.kind;
 $('edit-date').value=tx.date;
 $('edit-amount').value=String(tx.amount);
 $('edit-note').value=tx.note;
 fillCategory('edit-category',tx.kind,tx.category);
 $('edit-card').classList.remove('hidden');
 chooseView('records');
 $('edit-card').scrollIntoView?.({behavior:'smooth'});
}
function closeEdit(){
 editingId=null;
 $('edit-card').classList.add('hidden');
}
function renderReport(data){
 $('report-income').textContent=money(data.summary.income);
 $('report-expense').textContent=money(data.summary.expense);
 $('report-net').textContent=money(data.summary.net);
 const host=$('report-categories');host.replaceChildren();
 const sums=new Map();
 for(const tx of data.items){
  if(tx.kind==='expense')sums.set(tx.category,(sums.get(tx.category)||0)+tx.amount);
 }
 const entries=[...sums].sort((a,b)=>b[1]-a[1]);
 if(!entries.length){host.append(el('p','empty','Bu oyda hali xarajat yo‘q.'));}
 for(const [category,value] of entries){
  const ratio=data.summary.expense?Math.round(value/data.summary.expense*100):0;
  const block=el('div','line');block.append(line(category,money(value),ratio+'% · jami chiqimdagi ulushi'));
  const bar=el('div','bar'),fill=el('div','bar-fill');fill.style.width=ratio+'%';bar.append(fill);block.append(bar);host.append(block);
 }
 $('report-sync').textContent=state.queue.length?
  state.queue.length+' ta operatsiya hali telefon navbatida. Sinxronlangandan keyin chat hisobotiga ham tushadi.':
  state.online?'Yozuvlar chat bilan bitta Turso bazasida saqlanadi.':'Hozir eski saqlangan natija; internet bilan sinxronlashni tekshiring.';
}
function renderSettings(data){
 const opts=data.prefs.categories,selector=$('settings-kind'),kind=selector.value||'expense',sel=$('settings-category'),wanted=sel.value;
 sel.replaceChildren(...opts[kind].map(x=>{const o=el('option');o.value=x;o.textContent=x;return o;}));
 if(opts[kind].includes(wanted))sel.value=wanted;
 const selected=sel.value,aliases=data.prefs.keywords[kind]?.[selected]||[];
 const list=$('category-list');list.replaceChildren();
 const customs=opts[kind].filter(x=>!F.BASE[data.w.kind][kind].includes(x));
 if(!customs.length)list.append(el('p','tiny','Qo‘shimcha kategoriya hali yaratilmagan.'));
 for(const c of customs){
  const container=line(c,'','Qo‘shimcha kategoriya');
  const button=el('button','btn warning','O‘chirish');button.type='button';
  button.style.cssText='min-height:30px;padding:5px 8px;font-size:11px';
  button.onclick=()=>{
   if(!confirm('"'+c+'" kategoriyasini o‘chirasizmi? Unda yozuv yoki limit bo‘lsa server rad etadi.'))return;
   try{enqueue({action:'category_delete',kind,name:c});}catch(e){alertMessage(e.message);}
  };
  container.append(button);list.append(container);
 }
 const host=$('keyword-list');host.replaceChildren();
 if(!aliases.length)host.append(el('p','tiny','Maxsus kalit so‘zlar qo‘shilmagan.'));
 for(const word of aliases){
  const row=el('div','row between line'),name=el('span','strong',word);
  const remove=el('button','btn alt','Olib tashlash');remove.type='button';
  remove.style.cssText='font-size:11px;padding:5px 8px;min-height:30px';
  remove.onclick=()=>{
   if(!confirm('“'+word+'” kalit so‘zini olib tashlaysizmi?'))return;
   try{enqueue({action:'keyword_delete',kind,category:selected,word});}catch(e){alertMessage(e.message);}
  };
  row.append(name,remove);host.append(row);
 }
}

function renderMonthHistory(){
 const host=$('month-history');if(!host)return;
 host.replaceChildren();
 const data=compute();
 const known=state.months||[];
 if(!known.length)host.append(el('p','tiny','Oldingi oylar ro‘yxati serverga ulanganda ko‘rinadi.'));
 for(const item of known){
  const block=el('div','line row between'),details=el('div','grow');
  details.append(el('div','strong',item.month+' · '+(item.closed_at?'🗃 Arxiv':'Ochiq')));
  details.append(el('div','tiny',item.count+' ta yozuv · kirim '+money(item.income)+' · chiqim '+money(item.expense)));
  const show=el('button','btn alt','Ko‘rish');show.type='button';
  show.style.cssText='min-height:32px;padding:6px 10px;font-size:12px';
  show.disabled=state.month===item.month;
  show.onclick=()=>changeMonth(item.month);
  block.append(details,show);host.append(block);
 }
 const closed=!!data?.closedAt,current=F.today().slice(0,7);
 $('month-archive-status').textContent=state.month+' — '+(closed?'arxivlangan (faqat o‘qish)':
  state.month>=current?'joriy yoki kelajak oy (yakunlab bo‘lmaydi)':'ochiq o‘tgan oy');
 $('archive-close').disabled=!data||closed||state.month>=current||!state.online||!!state.queue.length;
 $('archive-reopen').disabled=!data||!closed||!state.online||!!state.queue.length;
 $('archive-export').disabled=!data||!state.online||!!state.queue.length;
}
async function changeMonth(month){
 if(!F.validMonth(month))return;
 state.month=month;
 closeEdit();
 render();
 try{await fetchLedger();render();alertMessage('');}
 catch(e){alertMessage('Bu oy ma’lumotlarini yuklash xatosi: '+e.message);}
}
async function archiveAction(action){
 if(!current())return;
 if(state.queue.length){alertMessage('Avval sinxronlash navbatini bo‘shating. Arxivlashda hech bir yozuvni yo‘qotmasligimiz kerak.');return;}
 const month=state.month,closed=!!compute()?.closedAt;
 if(action==='month_close'){
  if(closed||month>=F.today().slice(0,7)){alertMessage('Faqat tugagan, hali arxivlanmagan oyni yakunlash mumkin.');return;}
  if(!confirm(month+' oyining yozuvlari o‘chirilmaydi, lekin tahrirlash bloklanadi. Avval oylik JSON faylini yuklab olganmisiz?'))return;
  if(!confirm('Oyni arxiv sifatida yakunlashni tasdiqlaysizmi? Keyin Qayta ochish mumkin.'))return;
 }else{
  if(!closed){alertMessage('Bu oy arxivlangan emas.');return;}
  if(!confirm(month+' oyini tahrirlash uchun qayta ochasizmi?'))return;
 }
 try{
  const op=newOp({action,month});
  await request('/op',{method:'POST',body:op});
  await fetchLedger();await fetchMonthHistory();
  render();alertMessage(month+(action==='month_close'?' arxivlandi. Eski yozuvlar Turso’da saqlangan.':' qayta ochildi.'),true);
 }catch(e){alertMessage('Oy holatini o‘zgartirib bo‘lmadi: '+e.message);}
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
 const thisMonth=F.today().slice(0,7);
 const quickIsCurrent=state.month===thisMonth;
 $('quick-save').disabled=!quickIsCurrent;
 $('quick-text').disabled=!quickIsCurrent;
 $('quick-month-hint').textContent=quickIsCurrent?'':'Boshqa oy tanlangan. Tezkor yozish uchun joriy oyni tanlang.';
 $('quick-month-hint').classList.toggle('hidden',quickIsCurrent&&!data.closedAt);
 $('manual-form').querySelector('button[type=submit]').disabled=!!data.closedAt;
 if(data.closedAt){$('quick-month-hint').textContent='🗃 Bu oy arxivlangan. Qayta ochish uchun ⚙️ → Oylik arxiv.';$('quick-month-hint').classList.remove('hidden');}
 displayRows('recent',data.items,3);
 displayRows('records',data.items,150);
 renderPlan(data);renderBudgets(data);
 renderReport(data);renderSettings(data);renderMonthHistory();
 fillCategory('manual-category',$('manual-kind').value);
 if(editingId)fillCategory('edit-category',$('edit-kind').value);
 noteStatus();
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
 const prefs=compute()?.prefs||{categories:F.BASE[w.kind],keywords:{income:{},expense:{}}};
 return items.map(x=>({kind:x.kind,amount:x.amount,date:F.today(),note:x.note,
  category:F.categoryFor({kind:w.kind,categories:prefs.categories,keywords:prefs.keywords},x.kind,x.note)}));
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
async function exportData(){
 if(!current())return;
 try{
  if(state.queue.length)throw Error('Sinxronlanmagan yozuvlar mavjud. Avval ularni serverga yuboring; to‘liq JSON ularni hozircha qamrab olmaydi.');
  const snapshot=await request('/month-export?workspace='+encodeURIComponent(state.active)+'&month='+encodeURIComponent(state.month));
  const blob=new Blob([JSON.stringify(snapshot,null,2)],{type:'application/json'});
  const a=document.createElement('a'),url=URL.createObjectURL(blob);
  a.href=url;a.download='me_notes_moliya_'+state.month+'.json';document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),10000);
  alertMessage('Oylik JSON yuklab olish boshlandi. Telegram yuklamalarni saqlaganini tekshiring.',true);
 }catch(e){alertMessage('Zaxira olinmadi: '+e.message);}
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
  const oldBudgets=Object.entries(original.budgets||{}).flatMap(([month,items])=>Object.entries(items||{})
   .filter(([cat,limit])=>F.BASE[dest.kind].expense.includes(cat)&&Number.isSafeInteger(limit)&&limit>0)
   .map(([cat,limit])=>({action:'budget',month,category:cat,limit})));
  if(oldBudgets.length&&confirm('Eski hisobdagi '+oldBudgets.length+' ta QAT’IY limit ham ko‘chirilsinmi? Bu yangi hisobdagi shu oy/kategoriya limitini almashtirishi mumkin.')){
   for(const budget of oldBudgets)pieces.push(newOp(budget));
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
 $('month').onchange=()=>changeMonth($('month').value);
 $('workspace').onchange=()=>{
  state.active=$('workspace').value;state.months=[];closeEdit();
  try{enqueue({action:'switch'});Promise.all([fetchLedger(),fetchMonthHistory()]).then(render).catch(e=>alertMessage(e.message));}
  catch(e){alertMessage(e.message);}
 };
 $('quick-text').addEventListener('input',showPreview);
 $('quick-form').onsubmit=e=>{
  e.preventDefault();
  try{
   if(state.month!==F.today().slice(0,7))throw Error('Hozir boshqa oy ko‘rinmoqda. Yozuv kiritish uchun joriy oyni tanlang.');
   const parts=parseInput($('quick-text').value);
   enqueue(parts.length===1?{action:'add',entry:parts[0]}:{action:'add_many',entries:parts});
   $('quick-text').value='';showPreview();
   alertMessage(parts.length+' ta yozuv telefonda saqlandi, serverga yuboriladi.',true);
  }catch(err){alertMessage(err.message);}
 };
 $('manual-date').value=F.today();
 $('manual-toggle').onclick=()=>{
  const opened=$('manual-form').classList.toggle('hidden')===false;
  $('manual-toggle').textContent=opened?'Yopish':'Ochish';
  $('manual-toggle').setAttribute('aria-expanded',opened?'true':'false');
 };
 $('manual-kind').onchange=()=>fillCategory('manual-category',$('manual-kind').value);
 $('manual-form').onsubmit=e=>{
  e.preventDefault();
  try{
   const kind=$('manual-kind').value,amount=F.amount(Number($('manual-amount').value)),
    date=$('manual-date').value,category=$('manual-category').value,note=$('manual-note').value.trim();
   if(!F.validDay(date)||!note)throw Error('Sana va izohni tekshiring');
   if(state.base[state.active+'|'+date.slice(0,7)]?.closed_at)throw Error('Bu oy arxivlangan. Avval uni qayta oching.');
   enqueue({action:'add',entry:{kind,amount,date,category,note}});
   $('manual-form').reset();$('manual-date').value=F.today();
   fillCategory('manual-category','expense');
   alertMessage('Yozuv navbatga qo‘shildi. Telegram bilan sinxronlanadi.',true);
  }catch(err){alertMessage(err.message);}
 };
 $('edit-kind').onchange=()=>fillCategory('edit-category',$('edit-kind').value);
 $('edit-cancel').onclick=closeEdit;
 $('edit-form').onsubmit=e=>{
  e.preventDefault();
  try{
   if(!editingId)throw Error('Tahrir uchun yozuv tanlanmagan');
   const entry={kind:$('edit-kind').value,date:$('edit-date').value,
    category:$('edit-category').value,amount:F.amount(Number($('edit-amount').value)),
    note:$('edit-note').value.trim()};
   if(!F.validDay(entry.date)||!entry.note)throw Error('Sana yoki izoh noto‘g‘ri');
   if(compute()?.closedAt)throw Error('Bu oy arxivlangan, avval oyni qayta oching');
   enqueue({action:'edit',transaction_id:editingId,entry});
   closeEdit();alertMessage('O‘zgarish saqlash navbatiga qo‘shildi.',true);
  }catch(err){alertMessage(err.message);}
 };
 $('settings-kind').onchange=()=>{const d=compute();if(d)renderSettings(d);};
 $('settings-category').onchange=()=>{const d=compute();if(d)renderSettings(d);};
 $('category-form').onsubmit=e=>{
  e.preventDefault();
  try{
   const d=compute(),kind=$('settings-kind').value,name=$('category-name').value.trim();
   if(!d)throw Error('Hisob yuklanmagan');
   const temp={categories:structuredClone(d.prefs.categories)};
   F.addCategory(temp,kind,name);
   enqueue({action:'category_add',kind,name});
   $('category-name').value='';
   alertMessage('Yangi kategoriya qo‘shish navbatida.',true);
  }catch(err){alertMessage(err.message);}
 };
 $('keyword-form').onsubmit=e=>{
  e.preventDefault();
  try{
   const d=compute(),kind=$('settings-kind').value,category=$('settings-category').value,
    word=$('keyword-word').value.trim();
   if(!d)throw Error('Hisob yuklanmagan');
   const temp={categories:structuredClone(d.prefs.categories),keywords:structuredClone(d.prefs.keywords)};
   const normalized=F.addKeyword(temp,kind,category,word);
   enqueue({action:'keyword_add',kind,category,word:normalized});
   $('keyword-word').value='';
   alertMessage('Kalit so‘z qo‘shish navbatida.',true);
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
 $('retry-connect').onclick=pull;
 $('archive-export').onclick=exportData;
 $('archive-close').onclick=()=>archiveAction('month_close');
 $('archive-reopen').onclick=()=>archiveAction('month_reopen');
 $('sync-now').onclick=pull;

 window.addEventListener('visibilitychange',()=>{
  if(document.visibilityState!=='visible')return;
  const now=F.today().slice(0,7);
  if(now!==state.seenToday){
   if(state.month===state.seenToday)state.month=now;
   state.seenToday=now;
   render();if(navigator.onLine)pull();
  }
 });
 window.addEventListener('online',()=>{flush();pull();});
 window.addEventListener('offline',()=>{state.online=false;noteStatus();});
 if('serviceWorker' in navigator)navigator.serviceWorker.register('./finance-sw.js').catch(()=>{});
 restore();
 if(!initData||!cacheUid){$('welcome').classList.remove('hidden');$('sync-status').textContent='Telegram tasdiqlangan sessiyasi kerak';return;}
 render();pull();
}
setup();
})();
