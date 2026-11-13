'use strict';
const F=require('../me-notes-sahifalab/finance-core.js');
function closedMonthPermitted(month,today=F.today().slice(0,7)){
 if(!F.validMonth(month)||!F.validMonth(today))throw Error('Oy noto‘g‘ri');
 if(month>=today)throw Error('Faqat tugagan oylarni arxivga yakunlash mumkin');
 return true;
}
function monthOfDay(day){
 if(!F.validDay(day))throw Error('Sana noto‘g‘ri');
 return day.slice(0,7);
}
function monthRange(month){
 if(!F.validMonth(month))throw Error('Oy noto‘g‘ri');
 const [y,m]=month.split('-').map(Number);
 return {start:month+'-01',end:(m===12?y+1:y)+'-'+String(m===12?1:m+1).padStart(2,'0')+'-01'};
}
module.exports={closedMonthPermitted,monthOfDay,monthRange};
