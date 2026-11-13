/* Pure monthly archiving for the local Sahifalab diary (not the Turso finance app). */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.MEDiaryMonthArchive=api;
})(typeof globalThis!=='undefined'?globalThis:null,function(){
'use strict';
function monthOK(month){return typeof month==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(month);}
function monthOf(date){return String(date||'').slice(0,7);}
function monthItems(transactions,month){
 if(!monthOK(month))throw Error('Oy noto‘g‘ri');
 return (transactions||[]).filter(t=>monthOf(t.date)===month);
}
function totals(items){
 return items.reduce((sum,t)=>{
  if(t.kind==='income')sum.income+=Number(t.amount);
  else sum.expense+=Number(t.amount);
  return sum;
 },{income:0,expense:0});
}
function archive(state,month,currentMonth,archivedAt){
 if(!monthOK(month)||!monthOK(currentMonth))throw Error('Oy noto‘g‘ri');
 if(month>=currentMonth)throw Error('Faqat yakunlangan oylarni arxivlash mumkin');
 const active=monthItems(state.transactions,month);
 if(!active.length)throw Error('Bu oyda arxivlanadigan yozuv yo‘q');
 const existing=state.archivedMonths?.[month];
 if(existing?.transactions?.length)throw Error('Bu oy avval arxivlangan. Avval tiklang yoki alohida zaxira oling');
 const archivedMonths={...(state.archivedMonths||{}),
  [month]:{archivedAt:archivedAt||new Date().toISOString(),transactions:active.map(t=>({...t}))}};
 return {...state,archivedMonths,transactions:state.transactions.filter(t=>monthOf(t.date)!==month)};
}
function restore(state,month){
 if(!monthOK(month))throw Error('Oy noto‘g‘ri');
 const stored=state.archivedMonths?.[month]?.transactions;
 if(!Array.isArray(stored)||!stored.length)throw Error('Bu oy arxivda topilmadi');
 const existing=new Set((state.transactions||[]).map(t=>t.id));
 if(stored.some(t=>existing.has(t.id)))throw Error('Takroriy yozuv ID mavjud. Avval ma’lumotlar zaxirasini tekshiring');
 const archivedMonths={...state.archivedMonths};delete archivedMonths[month];
 return {...state,archivedMonths,transactions:[...state.transactions,...stored.map(t=>({...t}))]};
}
function monthBackup(state,month){
 if(!monthOK(month))throw Error('Oy noto‘g‘ri');
 const active=monthItems(state.transactions,month);
 const archived=state.archivedMonths?.[month]?.transactions||[];
 const ids=new Set(active.map(t=>t.id));
 if(archived.some(t=>ids.has(t.id)))throw Error('Arxiv va joriy yozuvlarda takroriy ID topildi');
 return {
  format:'me-notes-diary-month-v1',
  month,exported_at:new Date().toISOString(),
  transactions:[...active,...archived].map(t=>({...t})),
  totals:totals([...active,...archived]),
  note:'Bu oylik ma’lumot nusxasi. To‘liq Sahifalab darslari va kundalikni tiklash uchun Zaxira -> Barcha ma’lumotlar JSON faylidan foydalaning.'
 };
}
function validateFullBackup(source){
 if(source?.format==='me-notes-diary-month-v1'||source?.format==='me-notes-finance-month-v1'){
  throw Error('Bu bir oylik ma’lumot nusxasi, to‘liq kundalik zaxirasi emas. Darslar va kundalikni tiklash uchun Zaxira → Barcha ma’lumotlar (.json) faylini tanlang.');
 }
 if(!source||typeof source!=='object'||Array.isArray(source)||source.version!==1||!Array.isArray(source.transactions)||
    !source.assets||typeof source.assets!=='object'||!source.debts||typeof source.debts!=='object'||
    !source.estimated||typeof source.estimated!=='object'||!source.reflections||typeof source.reflections!=='object'||
    !source.goal||typeof source.goal!=='object'||!source.promise||typeof source.promise!=='object'){
  throw Error('To‘liq Sahifalab kundalik JSON zaxirasi topilmadi. Hozirgi yozuvlar o‘zgartirilmadi.');
 }
 return true;
}
return {monthOK,monthItems,totals,archive,restore,monthBackup,validateFullBackup};
});
