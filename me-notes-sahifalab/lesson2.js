(function () {
'use strict';
const KEY = 'me_notes_sahifalab_2dars_v1';
const $ = id => document.getElementById(id);
const fmt = n => Math.round(n).toLocaleString('ru-RU').replace(/\u00a0/g, ' ');
const today = () => { const d = new Date(); return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-'); };
const shift = (s,n) => { const d = new Date(s+'T12:00:00'); d.setDate(d.getDate()+n); return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-'); };
const dateOK = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s+'T12:00:00').getTime()) && shift(s,0) === s;
const num = v => v === '' || v === null || v === undefined ? null : (Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 1e15 ? Number(v) : null);
const safeNum = v => v === '' || v === null || v === undefined ? '' : (num(v) === null ? '' : num(v));
const costs = [
 ['transport','Transport / benzin'],
 ['clothing','Ish uchun kiyim — oyiga taqsimlangan'],
 ['outside','Tashqarida ovqatlanish — vaqt yo‘qligi uchun'],
 ['fatigue','Charchoq xaridlari — taksi, tayyor ovqat'],
 ['other','Boshqa']
];
const hours = [
 ['work','Ish joyida o‘tgan soatlar'],
 ['travel','Yo‘lda — borish va kelish'],
 ['prepare','Tayyorgarlik — kiyinish, taraddud'],
 ['recovery','Tiklanish — charchoqdan keyingi dam'],
 ['home','Uyda ish haqida o‘ylash / ish qilish']
];
const startData = () => ({version:1,salary:'',costs:{},hours:{},otherExpenseName:'',start:today(),purchases:[],reflections:{q1:'',q2:'',q3:''},decision:'',savedHours:''});
const cleanText = (v,max) => typeof v === 'string' ? v.slice(0,max) : '';
function sanitize(x) {
 if(!x || typeof x !== 'object' || Array.isArray(x) || (x.version!==undefined && x.version!==1)) throw Error('2-dars zaxira formati noto‘g‘ri');
 const a=startData();
 a.salary=safeNum(x.salary);
 for (const [k] of costs) a.costs[k]=safeNum(x.costs && x.costs[k]);
 for (const [k] of hours) a.hours[k]=safeNum(x.hours && x.hours[k]);
 a.otherExpenseName=cleanText(x.otherExpenseName,120);
 a.start=dateOK(x.start)?x.start:a.start;
 const ids=new Set();
 a.purchases=(Array.isArray(x.purchases)?x.purchases:[]).slice(0,5000).filter(p=>p && typeof p==='object' && dateOK(p.date) && typeof p.item==='string' && p.item.trim() && p.item.length<=160 && num(p.amount)!==null && Number(p.amount)>0).map(p=>{
  let id=cleanText(p.id,90)||'purchase_'+Math.random().toString(36).slice(2);
  if(ids.has(id)) id='purchase_'+Math.random().toString(36).slice(2);
  ids.add(id);
  return {id,date:p.date,item:p.item,amount:Number(p.amount),worth:p.worth==='yes'?'yes':p.worth==='no'?'no':''};
 });
 for (const k of ['q1','q2','q3']) a.reflections[k]=cleanText(x.reflections&&x.reflections[k],3000);
 a.decision=cleanText(x.decision,3000);
 a.savedHours=safeNum(x.savedHours);
 return a;
}
let state,blocked=false,storageAvailable=true;
try {
 const raw=localStorage.getItem(KEY);
 state=raw?sanitize(JSON.parse(raw)):startData();
 localStorage.setItem('__me_notes_l2_test','1');
 localStorage.removeItem('__me_notes_l2_test');
} catch(err) {
 state=startData();
 blocked=true;
 storageAvailable=false;
}
function warning(message) {
 const el=$('l2-storage-warning');
 if(el){ el.textContent=message; el.classList.remove('hide'); }
}
function save() {
 if(blocked){warning('2-dars ma’lumotlarini o‘qib yoki saqlab bo‘lmadi. Mavjud nusxa ustiga yozilmaydi. Avval zaxirangizni tekshiring.');return false;}
 try{localStorage.setItem(KEY,JSON.stringify(state));return true;}
 catch(err){storageAvailable=false;warning('2-dars saqlanmadi. Qurilma xotirasini tekshiring va zaxira oling.');return false;}
}
const api={
 export:()=>JSON.parse(JSON.stringify(state)),
 validate:sanitize,
 restore: x=>{const v=sanitize(x);try{localStorage.setItem(KEY,JSON.stringify(v));state=v;blocked=false;storageAvailable=true;return true;}catch(e){warning('2-darsni tiklash uchun joy yetarli emas.');return false;}},
 reset:()=>{try{localStorage.removeItem(KEY);state=startData();blocked=false;return true;}catch(e){warning('2-darsni tozalab bo‘lmadi.');return false;}}
};
window.MENotesLesson2=api;
const asCurrency = n => Number.isFinite(n) ? fmt(n)+' so‘m':'—';
const asHours = n => Number.isFinite(n) && n>=0 ? (Math.round(n*100)/100).toLocaleString('uz-UZ',{maximumFractionDigits:2})+' soat':'—';
const getSum = obj => Object.values(obj).reduce((s,v)=>s+(num(v)===null?0:num(v)),0);
function rateInfo() {
 const s=num(state.salary);
 const workCosts=getSum(state.costs);
 const allHours=getSum(state.hours);
 const net=s===null?null:s-workCosts;
 const effective=net!==null && allHours>0?net/allHours:null;
 const standard=s!==null && num(state.hours.work)>0?s/num(state.hours.work):null;
 return {s,workCosts,allHours,net,effective,standard};
}
function drawInputs(target,items,group) {
 const host=$(target);
 if(!host)return;
 items.forEach(([key,label])=>{
  const row=document.createElement('div');row.className='listline';
  const text=document.createElement('label');text.textContent=label;
  const input=document.createElement('input');input.type='number';input.inputMode='decimal';input.min='0';input.step='any';input.placeholder='0';input.className='money-input';input.id='l2-'+group+'-'+key;input.value=state[group][key]??'';input.disabled=blocked;
  text.htmlFor=input.id;row.append(text,input);host.append(row);
  input.addEventListener('input',()=>{
   if(input.value!=='' && num(input.value)===null)return;
   state[group][key]=input.value===''?'':Number(input.value);
   save();renderTotals();
  });
 });
}
function renderTotals() {
 const r=rateInfo();
 $('l2-cost-total').textContent=asCurrency(r.workCosts);
 $('l2-net').textContent=asCurrency(r.net);
 $('l2-hour-total').textContent=asHours(r.allHours);
 $('l2-rate').textContent=asCurrency(r.effective);
 $('l2-expected').textContent=asCurrency(r.standard);
 $('l2-actual').textContent=asCurrency(r.effective);
 $('l2-difference').textContent=r.standard!==null && r.effective!==null?asCurrency(r.standard-r.effective):'—';
 renderPurchases();
}
function selectedPurchases() {
 const min=state.start,max=shift(min,6);
 return state.purchases.filter(p=>p.date>=min && p.date<=max).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
}
let editing='';
function clearPurchase() {
 editing='';
 $('l2-purchase-form').reset();
 $('l2-purchase-date').value=state.start;
 $('l2-purchase-submit').textContent='Xaridni qo‘shish';
 $('l2-purchase-cancel').classList.add('hide');
}
function renderPurchases() {
 const end=shift(state.start,6);
 $('l2-week-range').textContent=state.start+' — '+end;
 $('l2-purchase-date').min=state.start;
 $('l2-purchase-date').max=end;
 const data=selectedPurchases();
 const r=rateInfo();
 const amount=data.reduce((s,p)=>s+p.amount,0);
 $('l2-spent').textContent=asCurrency(amount);
 $('l2-spent-hours').textContent=r.effective!==null && r.effective>0?asHours(amount/r.effective):'—';
 const list=$('l2-purchases');list.replaceChildren();
 if(!data.length){const empty=document.createElement('div');empty.className='empty';empty.textContent='Bu 7 kunlik davrda hali xarid yozilmagan.';list.append(empty);return;}
 for(const p of data) {
  const box=document.createElement('div');box.className='tx';
  const main=document.createElement('div');main.style.flex='1';main.style.minWidth='0';
  const name=document.createElement('div');name.className='tx-title';name.textContent=p.item;
  const meta=document.createElement('div');meta.className='tx-meta';meta.textContent=p.date+' · '+(r.effective!==null && r.effective>0?asHours(p.amount/r.effective):'Necha soat: —');
  const actions=document.createElement('div');actions.className='actions';actions.style.marginTop='6px';
  const label=document.createElement('label');label.className='micro';label.textContent='Arzidimi? ';
  const worth=document.createElement('select');worth.setAttribute('aria-label',p.item+' — arzidimi?');worth.dataset.id=p.id;
  for(const [v,t] of [['','Tanlanmagan'],['yes','Ha'],['no','Yo‘q']]){const o=document.createElement('option');o.value=v;o.textContent=t;worth.append(o);}
  worth.value=p.worth;worth.disabled=blocked;label.append(worth);actions.append(label);
  const edit=document.createElement('button');edit.type='button';edit.className='btn small outline';edit.dataset.edit=p.id;edit.textContent='Tahrirlash';edit.disabled=blocked;
  const del=document.createElement('button');del.type='button';del.className='btn small danger';del.dataset.delete=p.id;del.textContent='O‘chirish';del.disabled=blocked;
  actions.append(edit,del);
  main.append(name,meta,actions);
  const right=document.createElement('strong');right.textContent=asCurrency(p.amount);
  box.append(main,right);list.append(box);
 }
}
drawInputs('l2-cost-inputs',costs,'costs');
drawInputs('l2-hours-inputs',hours,'hours');
$('l2-salary').value=state.salary;
$('l2-other-label').value=state.otherExpenseName;
$('l2-start').value=state.start;
$('l2-purchase-date').value=state.start;
$('l2-q1').value=state.reflections.q1;
$('l2-q2').value=state.reflections.q2;
$('l2-q3').value=state.reflections.q3;
$('l2-decision').value=state.decision;
$('l2-saved-hours').value=state.savedHours;
for(const id of ['l2-salary','l2-start','l2-purchase-date','l2-purchase-item','l2-purchase-amount','l2-purchase-worth','l2-purchase-submit','l2-other-label','l2-q1','l2-q2','l2-q3','l2-decision','l2-saved-hours']) $(id).disabled=blocked;
if(blocked) warning('2-darsning saqlangan nusxasini o‘qib bo‘lmadi. Uni yo‘qotmaslik uchun yangi yozuv bilan almashtirilmaydi. Zaxiradan tiklash mumkin.');
$('l2-salary').addEventListener('input',e=>{if(e.target.value!==''&&num(e.target.value)===null)return;state.salary=e.target.value===''?'':Number(e.target.value);save();renderTotals();});
$('l2-other-label').addEventListener('input',e=>{state.otherExpenseName=e.target.value.slice(0,120);save();});
$('l2-start').addEventListener('change',e=>{if(!dateOK(e.target.value))return;state.start=e.target.value;save();clearPurchase();renderPurchases();});
for(const k of ['q1','q2','q3']) $('l2-'+k).addEventListener('input',e=>{state.reflections[k]=e.target.value.slice(0,3000);save();});
$('l2-decision').addEventListener('input',e=>{state.decision=e.target.value.slice(0,3000);save();});
$('l2-saved-hours').addEventListener('input',e=>{if(e.target.value!==''&&num(e.target.value)===null)return;state.savedHours=e.target.value===''?'':Number(e.target.value);save();});
$('l2-purchase-form').addEventListener('submit',e=>{
 e.preventDefault();
 const date=$('l2-purchase-date').value, item=$('l2-purchase-item').value.trim().slice(0,160), amount=num($('l2-purchase-amount').value);
 if(!dateOK(date)||date<state.start||date>shift(state.start,6)){alert('Xarid sanasi tanlangan 7 kunlik davr ichida bo‘lishi kerak.');return;}
 if(!item||amount===null||amount<=0){alert('Xarid nomini va musbat summasini kiriting.');return;}
 if(!editing && state.purchases.length>=5000){alert('Yozuvlar chegarasiga yetildi. Zaxira oling.');return;}
 const record={id:editing||'l2_'+Date.now()+'_'+Math.random().toString(36).slice(2,9),date,item,amount,worth:$('l2-purchase-worth').value};
 if(editing){const i=state.purchases.findIndex(p=>p.id===editing);if(i<0)return;state.purchases[i]=record;}
 else state.purchases.push(record);
 save();clearPurchase();renderPurchases();
});
$('l2-purchase-cancel').addEventListener('click',clearPurchase);
$('l2-purchases').addEventListener('change',e=>{
 const el=e.target.closest('select[data-id]');if(!el)return;
 const p=state.purchases.find(x=>x.id===el.dataset.id);if(!p)return;
 p.worth=el.value==='yes'?'yes':el.value==='no'?'no':'';save();
});
$('l2-purchases').addEventListener('click',e=>{
 const btn=e.target.closest('button');if(!btn)return;
 const id=btn.dataset.edit||btn.dataset.delete;
 const p=state.purchases.find(x=>x.id===id);if(!p)return;
 if(btn.dataset.delete){if(!confirm('Shu xarid yozuvini o‘chirasizmi?'))return;state.purchases=state.purchases.filter(x=>x.id!==id);save();clearPurchase();renderPurchases();return;}
 editing=p.id;
 $('l2-purchase-date').value=p.date;
 $('l2-purchase-item').value=p.item;
 $('l2-purchase-amount').value=p.amount;
 $('l2-purchase-worth').value=p.worth;
 $('l2-purchase-submit').textContent='O‘zgarishni saqlash';
 $('l2-purchase-cancel').classList.remove('hide');
 $('l2-purchase-form').scrollIntoView({block:'start',behavior:'smooth'});
});
renderTotals();
})();