/* ME Notes — mustaqil moliya boshqaruvi. PDF darslaridan alohida. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  if(root) root.MEFinanceCore=api;
})(typeof window!=='undefined'?window:null,function(){
'use strict';
const VERSION=1,MAX=1000000000000,MAX_WORKSPACES=12;
const KINDS={personal:"Shaxsiy moliyam",family:"Oilaviy byudjet",business:"Biznes moliyam"};
const BASE={
 personal:{expense:["Oziq-ovqat","Transport","Uy-ro'zg'or","Kommunal","Sog'liq","Kiyim","Ta'lim","Dam olish","Boshqa"],income:["Maosh","Qo'shimcha ish","Sovg'a","Boshqa"]},
 family:{expense:["Bozor","Kommunal","Bolalar","Uy-ro'zg'or","Transport","Sog'liq","Ta'lim","Boshqa"],income:["Maosh","Oilaviy kirim","Boshqa"]},
 business:{expense:["Tovar","Ijara","Ish haqi","Transport","Kommunal","Reklama","Boshqa"],income:["Savdo tushumi","Xizmat daromadi","Boshqa"]}
};
const today=()=>new Intl.DateTimeFormat('sv-SE',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'Asia/Tashkent'}).format(new Date());
const id=()=>Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,12);
const money=n=>Math.round(Number(n)||0).toLocaleString('ru-RU').replace(/\u00a0/g,' ')+' so‘m';
const cleanText=(s,len=160)=>String(s??'').trim().slice(0,len);
function amount(n){const value=Number(n);if(!Number.isSafeInteger(value)||value<1||value>MAX)throw Error("Summa 1 dan 1 trillion so‘mgacha butun son bo‘lsin.");return value;}
function validDay(s){if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+'T12:00:00Z');return !Number.isNaN(+d)&&d.toISOString().slice(0,10)===s;}
function validMonth(s){return typeof s==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(s);}
function fresh(){return {version:VERSION,active:null,workspaces:[]};}
function create(s,kind,name){
 if(!KINDS[kind])throw Error('Hisob turi noto‘g‘ri');
 if(s.workspaces.length>=MAX_WORKSPACES)throw Error('Ko‘pi bilan 12 ta hisob ochish mumkin');
 const w={id:id(),kind,name:cleanText(name,60)||KINDS[kind],categories:JSON.parse(JSON.stringify(BASE[kind])),transactions:[],budgets:{}};
 s.workspaces.push(w);s.active=w.id;return w;
}
function current(s){return s.workspaces.find(w=>w.id===s.active)||null;}
function setActive(s,workspaceId){if(!s.workspaces.some(w=>w.id===workspaceId))throw Error('Hisob topilmadi');s.active=workspaceId;}
function parseFast(raw){
 const m=String(raw||'').match(/^\s*([+-]?)\s*(\d+(?:[ .,]\d{3})*)(?:\s+(.+))\s*$/);
 if(!m)return null;
 const v=amount(Number(m[2].replace(/[ .,]/g,'')));
 const note=cleanText(m[3]);if(!note)throw Error('Izoh kiriting');
 return {kind:m[1]==='+'?'income':'expense',amount:v,note};
}
function categoryFor(w,kind,note){
 const t=note.toLowerCase();
 const rules=kind==='income'?[["maosh","oylik"],["savdo","sotuv"],["xizmat","usta"],["sovg'a","sovga"]]:[
 ["Transport","taksi","avtobus","yo'l","benzin","metro"],
 ["Oziq-ovqat","tushlik","non","ovqat","bozor","market"],
 ["Bozor","bozor","market"],
 ["Kommunal","svet","gaz","internet","suv"],
 ["Kiyim","kiyim","krossovka"],
 ["Sog'liq","dori","shifoxona"],
 ["Reklama","reklama"],
 ["Ijara","ijara"],
 ["Tovar","tovar","mol"]];
 for(const [cat,...tokens] of rules)if(w.categories[kind].includes(cat)&&tokens.some(tk=>t.includes(tk)))return cat;
 if(kind==='income'&&(t.includes('oylik')||t.includes('maosh'))&&w.categories.income.includes('Maosh'))return 'Maosh';
 return w.categories[kind].at(-1);
}
function addTransaction(w,{kind,amount:val,date=today(),category,note=''}) {
 if(!['income','expense'].includes(kind))throw Error('Operatsiya turi noto‘g‘ri');
 if(!validDay(date))throw Error('Sana noto‘g‘ri');
 const sum=amount(val),name=cleanText(category||categoryFor(w,kind,note),80);
 if(!w.categories[kind].includes(name))throw Error('Kategoriya topilmadi');
 const tx={id:id(),kind,amount:sum,date,category:name,note:cleanText(note)};
 const previous=spent(w,date.slice(0,7),name);
 w.transactions.push(tx);
 const budget=kind==='expense'?(w.budgets[date.slice(0,7)]||{})[name]:undefined;
 let alert='';
 if(budget>0){
  const next=previous+sum;
  if(previous<budget&&next>=budget)alert='⛔ '+name+' limiti tugadi yoki oshib ketdi.';
  else if(previous<budget*.8&&next>=budget*.8)alert='⚠️ '+name+' limiti 80% ga yetdi.';
 }
 return {tx,alert};
}
function spent(w,month,category){return w.transactions.filter(t=>t.kind==='expense'&&t.date.slice(0,7)===month&&(!category||t.category===category)).reduce((a,t)=>a+t.amount,0);}
function editTransaction(w,transactionId,updates){
 const old=w.transactions.find(t=>t.id===transactionId);if(!old)throw Error('Yozuv topilmadi');
 const kind=updates.kind??old.kind,date=updates.date??old.date,category=updates.category??old.category;
 if(!['income','expense'].includes(kind)||!validDay(date)||!w.categories[kind].includes(category))throw Error('Yozuvni tekshiring');
 Object.assign(old,{kind,date,category,amount:amount(updates.amount??old.amount),note:cleanText(updates.note??old.note)});return old;
}
function removeTransaction(w,transactionId){const i=w.transactions.findIndex(t=>t.id===transactionId);if(i<0)throw Error('Yozuv topilmadi');w.transactions.splice(i,1);}
function setBudget(w,month,category,value){
 if(!validMonth(month)||!w.categories.expense.includes(category))throw Error('Limit oy/kategoriyasi noto‘g‘ri');
 const n=Number(value);if(!Number.isSafeInteger(n)||n<0||n>MAX)throw Error('Limit noto‘g‘ri');
 w.budgets[month]??={};if(n===0)delete w.budgets[month][category];else w.budgets[month][category]=n;
}
function addCategory(w,kind,name){if(!['income','expense'].includes(kind))throw Error('Kategoriya turi noto‘g‘ri');const n=cleanText(name,80);if(n.length<2||w.categories[kind].includes(n)||w.categories[kind].length>=50)throw Error('Kategoriya nomini tekshiring');w.categories[kind].push(n);}
function summary(w,month){
 if(!validMonth(month))throw Error('Oy noto‘g‘ri');
 const items=w.transactions.filter(t=>t.date.startsWith(month));
 const income=items.filter(t=>t.kind==='income').reduce((a,t)=>a+t.amount,0);
 const expense=items.filter(t=>t.kind==='expense').reduce((a,t)=>a+t.amount,0);
 const budgets=w.categories.expense.map(category=>({category,spent:spent(w,month,category),limit:w.budgets[month]?.[category]||0}));
 return {income,expense,net:income-expense,budgets,transactions:items.slice().sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id))};
}
function validate(raw){
 if(!raw||raw.version!==VERSION||!Array.isArray(raw.workspaces)||raw.workspaces.length>MAX_WORKSPACES)throw Error('Zaxira formati noto‘g‘ri');
 const result=fresh(), ids=new Set();
 for(const item of raw.workspaces){
  if(!item||typeof item!=='object'||!KINDS[item.kind]||typeof item.id!=='string'||!item.id||ids.has(item.id))throw Error('Hisob ma’lumoti noto‘g‘ri');
  ids.add(item.id);
  const w={id:item.id,kind:item.kind,name:cleanText(item.name,60)||KINDS[item.kind],categories:{expense:[],income:[]},transactions:[],budgets:{}};
  for(const kind of ['income','expense']){
   const cats=item.categories?.[kind];
   if(!Array.isArray(cats)||!cats.length||cats.length>50)throw Error('Kategoriya ma’lumoti noto‘g‘ri');
   w.categories[kind]=cats.map(c=>cleanText(c,80));
   if(w.categories[kind].some(c=>!c)||new Set(w.categories[kind]).size!==w.categories[kind].length)throw Error('Kategoriya takrorlangan');
  }
  if(!Array.isArray(item.transactions)||item.transactions.length>50000)throw Error('Yozuvlar soni oshib ketgan');
  const txIds=new Set();
  for(const t of item.transactions){
   if(!t||typeof t.id!=='string'||!t.id||txIds.has(t.id)||!['income','expense'].includes(t.kind)||!validDay(t.date)||!w.categories[t.kind].includes(t.category))throw Error('Yozuv noto‘g‘ri');
   txIds.add(t.id);
   w.transactions.push({id:t.id,kind:t.kind,date:t.date,amount:amount(t.amount),category:t.category,note:cleanText(t.note)});
  }
  if(!item.budgets||typeof item.budgets!=='object'||Array.isArray(item.budgets))throw Error('Limitlar noto‘g‘ri');
  for(const [month,items] of Object.entries(item.budgets)){
   if(!validMonth(month)||!items||typeof items!=='object'||Array.isArray(items))throw Error('Limitlar noto‘g‘ri');
   w.budgets[month]={};
   for(const [cat,n] of Object.entries(items)){
    if(!w.categories.expense.includes(cat)||!Number.isSafeInteger(n)||n<0||n>MAX)throw Error('Limit miqdori noto‘g‘ri');
    if(n>0)w.budgets[month][cat]=n;
   }
  }
  result.workspaces.push(w);
 }
 result.active=result.workspaces.some(w=>w.id===raw.active)?raw.active:(result.workspaces[0]?.id||null);
 return result;
}
function csv(w){const quote=v=>{let s=String(v??'');if(/^[\s]*[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};return '\ufeff'+[['Sana','Hisob','Turi','Kategoriya','Summa','Izoh'],...w.transactions.map(t=>[t.date,w.name,t.kind==='income'?'Daromad':'Xarajat',t.category,t.amount,t.note])].map(r=>r.map(quote).join(';')).join('\r\n');}
return {KINDS,BASE,today,money,amount,validDay,validMonth,fresh,create,current,setActive,parseFast,categoryFor,addTransaction,editTransaction,removeTransaction,setBudget,addCategory,summary,validate,csv,spent};
});
