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

// Har bir soha uchun kengaytiriladigan lug‘at. Bir xil parser Mini App va chatda ishlatiladi.
const KEYWORD_RULES={
 expense:[
  {categories:['Transport'],words:["taksi","taxi","yo'l","yo'lkira","yolkira","yul","avtobus","marshrutka","metro","benzin","dizel","zapravka","azs","avtoyuvish","parkovka","avtoservis","shina","yandex","indrive","transport","yo'lovchi","yonilg'i","yoqilg'i","chipta"]},
  {categories:['Bolalar'],words:["farzand","bolalar","bolaga","bog'cha","pampers","taglik","o'yinchoq","chaqaloq","maktab formasi","bolalar kiyimi"]},
  {categories:['Ta\'lim'],words:["o'qish","o'quv","maktab","kurs","kontrakt","kitob","daftar","repetitor","dars","ustoz","universitet","ta'lim","o'qituvchi"]},
  {categories:['Bozor','Oziq-ovqat'],words:["bozor","oziq ovqat","supermarket","market","magazin","do'kon","dukon","non","tuxum","go'sht","guruch","sabzi","kartoshka","meva","sabzavot","sut","shakar","tushlik","nonushta","kechki ovqat","restoran","kafe","osh","palov","kabob","somsa","burger","ichimlik","ovqat"]},
  {categories:['Kommunal'],words:["kommunal","elektr","svet","gaz","suv","internet","wifi","wi fi","telefon","mobil aloqa","tarif","beeline","ucell","uzmobile","mobiuz","chiqindi","axlat","issiq suv"]},
  {categories:['Sog\'liq'],words:["sog'liq","dori","apteka","dorixona","doktor","vrach","shifokor","poliklinika","shifoxona","kasalxona","analiz","tahlil","stomatolog","tish","ukol","davolanish","emlash"]},
  {categories:['Kiyim'],words:["kiyim","ko'ylak","kuylak","shim","futbolka","kurtka","krossovka","tufli","etik","poyabzal","ro'mol","sharf","kostyum","paypoq"]},
  {categories:["Uy-ro'zg'or"],words:["ro'zg'or","uy uchun","mebel","tozalash","sovun","kir yuvish","changyutgich","maishiy","remont","ta'mir","kir sovun","idish","xo'jalik"]},
  {categories:['Dam olish'],words:["dam olish","kino","sayohat","hordiq","teatr","park","o'yin","futbol","piknik","ekskursiya","to'y","sayr","attraksion"]},
  {categories:['Ish haqi'],words:["ish haqi","oylik","maosh","ishchi","xodim","hodim","brigada","usta haqi","ishchi puli"]},
  {categories:['Tovar'],words:["tovar","mahsulot","xomashyo","material","qadoq","quti","paket","ombor","sklad","mol olib","tovar olish","yetkazib beruvchi","zakupka"]},
  {categories:['Ijara'],words:["ijara","arenda","ofis ijarasi","do'kon ijarasi","bino ijarasi"]},
  {categories:['Reklama'],words:["reklama","target","targeting","ads","smm","blogger","banner","baner","promoushn","reklama posti"]}
 ],
 income:[
  {categories:['Maosh'],words:["oylik","maosh","avans","ish haqi","ish xaqi","ishdagi oylik"]},
  {categories:["Sovg'a"],words:["sovg'a","sovga","hadya","bonus","mukofot","bayram puli"]},
  {categories:["Oilaviy kirim"],words:["oilaviy kirim","oilaviy daromad","erim","turmush o'rtog'im","nafaqa","pensiya","oilaviy yordam"]},
  {categories:["Savdo tushumi"],words:["savdo","sotuv","tushum","kassa","xaridor","terminal","sotildi","realizatsiya","naqd savdo"]},
  {categories:["Xizmat daromadi"],words:["xizmat","mijoz","usta","loyiha","konsultatsiya","shartnoma","buyurtma","zakaz","freelance","frilans"]},
  {categories:["Qo'shimcha ish"],words:["qo'shimcha","usta","freelance","frilans","buyurtma","zakaz","xizmat","yon ish","qurilish"]}
 ]
};
const CYRILLIC={а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'yo',ж:'j',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'x',ц:'ts',ч:'ch',ш:'sh',щ:'sh',ъ:"'",ы:'i',ь:'',э:'e',ю:'yu',я:'ya',қ:'q',ғ:"g'",ҳ:'h',ў:"o'",і:'i'};
function normalizeKeyword(text){
 return String(text??'').toLowerCase()
  .replace(/[\u2018\u2019\u02bb\u02bc\u0060\u00b4\u201b\u201a\uFF07]/g,"'")
  .replace(/[а-яёқғҳўі]/g,c=>CYRILLIC[c]??c)
  .replace(/[^a-z0-9'\s]+/g,' ')
  .replace(/\s+/g,' ').trim();
}
const SUFFIXES=['ga','ka','qa','da','dan','ni','ning','lar','lari','larda','larga','lardan','larim','larimiz','im','imiz','si','sini','siga','sidan','dan','dagi','ga','gi','imga','imni','ga','da'];
function wordMatches(found,keyword){
 if(found===keyword)return true;
 return SUFFIXES.some(suffix=>found===keyword+suffix);
}
function keywordMatches(text,keyword){
 const words=normalizeKeyword(text).split(' ').filter(Boolean);
 const keys=normalizeKeyword(keyword).split(' ').filter(Boolean);
 if(!keys.length)return false;
 for(let i=0;i<=words.length-keys.length;i++){
  if(keys.every((key,j)=>j===keys.length-1?wordMatches(words[i+j],key):words[i+j]===key))return true;
 }
 return false;
}
function addKeyword(w,kind,category,word){
 if(!['income','expense'].includes(kind)||!w.categories[kind].includes(category))throw Error('Kategoriya noto‘g‘ri');
 const normalized=normalizeKeyword(word);
 if(normalized.length<2||normalized.length>48||!/^[a-z]/.test(normalized))throw Error('Kalit so‘z 2–48 ta harfdan iborat bo‘lsin');
 const dictionary=w.keywords??={income:{},expense:{}};
 dictionary[kind]??={};
 const entries=dictionary[kind][category]??=[];
 if(entries.length>=30)throw Error('Bitta kategoriya uchun ko‘pi bilan 30 ta kalit so‘z');
 for(const [cat,words] of Object.entries(dictionary[kind])){
  if(words.some(w=>normalizeKeyword(w)===normalized))throw Error(cat===category?'Bu kalit so‘z allaqachon bor':'Bu kalit so‘z boshqa kategoriyaga biriktirilgan');
 }
 entries.push(normalized);
 return normalized;
}
function removeKeyword(w,kind,category,word){
 const list=w.keywords?.[kind]?.[category];
 if(!list)throw Error('Kalit so‘z topilmadi');
 const normalized=normalizeKeyword(word);
 const pos=list.findIndex(k=>normalizeKeyword(k)===normalized);
 if(pos<0)throw Error('Kalit so‘z topilmadi');
 list.splice(pos,1);
}

function create(s,kind,name){
 if(!KINDS[kind])throw Error('Hisob turi noto‘g‘ri');
 if(s.workspaces.length>=MAX_WORKSPACES)throw Error('Ko‘pi bilan 12 ta hisob ochish mumkin');
 const w={id:id(),kind,name:cleanText(name,60)||KINDS[kind],categories:JSON.parse(JSON.stringify(BASE[kind])),keywords:{income:{},expense:{}},transactions:[],budgets:{}};
 s.workspaces.push(w);s.active=w.id;return w;
}
function current(s){return s.workspaces.find(w=>w.id===s.active)||null;}
function setActive(s,workspaceId){if(!s.workspaces.some(w=>w.id===workspaceId))throw Error('Hisob topilmadi');s.active=workspaceId;}
// Qoidaga asoslangan (AI xarajatisiz) bir-xabar parser.
// Qiymat xabar boshida yoki oxirida bo‘lishi mumkin; xatoli raqam hech qachon saqlanmaydi.
function parseFast(raw){
 const input=String(raw??'').trim().replace(/\s+/g,' ');
 if(!input||input.length>260)return null;
 const numeric=String.raw`(?:\d{1,3}(?:[ .]\d{3})+|\d+)(?:[.,]\d{1,2})?`;
 const unit=String.raw`(?:ming|mln|million|millionta|k)`;
 const currency=String.raw`(?:so‘m|soʻm|so'm|som)`;
 const front=new RegExp('^([+-]?)\\s*('+numeric+')\\s*('+unit+')?\\s*(?:'+currency+')?\\s+(.+)$','i');
 const back=new RegExp('^(.+?)\\s+([+-]?)\\s*('+numeric+')\\s*('+unit+')?\\s*(?:'+currency+')?$','i');
 let match=front.exec(input), kind,number,scale,note;
 if(match){
   kind=match[1]==='+'?'income':'expense';number=match[2];scale=match[3];note=match[4];
 } else {
   match=back.exec(input);if(!match)return null;
   note=match[1];kind=match[2]==='+'?'income':'expense';number=match[3];scale=match[4];
 }
 note=cleanText(note,160);
 if(!note||/^[\d.,+\s-]+$/.test(note)||/^(ming|mln|million|millionta|k|so‘m|soʻm|so'm|som)$/i.test(note))return null;
 const normalized=number.replace(/(?<=\d)[ .](?=\d{3}(?:\D|$))/g,'');
 let n=Number(normalized.replace(',','.'));
 if(!Number.isFinite(n)||n<=0)return null;
 const factor=scale?/^mln|million/i.test(scale)?1000000:1000:1;
 const total=n*factor;
 // 25.5 so‘m emas, 25.5 ming = 25500 bo‘lishi mumkin.
 if(!Number.isSafeInteger(total)||total<1||total>MAX)return null;
 return {kind,amount:amount(total),note};
}
function categoryFor(w,kind,note){
 if(!['income','expense'].includes(kind))throw Error('Operatsiya turi noto‘g‘ri');
 const value=normalizeKeyword(note);
 if(!value)return w.categories[kind].at(-1);
 // Har bir hisobga maxsus qo‘shilgan kalit so‘z birinchi o‘rinda turadi.
 for(const category of w.categories[kind]){
  const custom=w.keywords?.[kind]?.[category]||[];
  if(custom.some(word=>keywordMatches(value,word)))return category;
 }
 for(const rule of KEYWORD_RULES[kind]){
  if(rule.words.some(word=>keywordMatches(value,word))){
   const category=rule.categories.find(cat=>w.categories[kind].includes(cat));
   if(category)return category;
  }
 }
 return w.categories[kind].at(-1);
}
// ME Notes oylik taqsimot (foizlar testdan o‘tganicha tasdiqlangan).
// Maosh real daromad sifatida bitta yozuv; bu summalar yangi xarajat EMAS.
const SALARY_RATES=Object.freeze({ehson:250,kelajak:1000,oyin:1000,rozgor:4500,biznes:5500});
const HOUSEHOLD_WEIGHTS=Object.freeze({"Oziq-ovqat":35,"Transport":15,"Uy-ro'zg'or":10,"Kommunal":15,"Sog'liq":10,"Kiyim":5,"Ta'lim":5,"Boshqa":5});
const SALARY_BUCKETS=[['ehson','Ehson'],['kelajak','Kelajak'],['oyin','O‘yin-kulgi'],['rozgor','Ro‘zg‘or'],['biznes','Biznes']];
function splitSalary(value){
 const salary=amount(value);
 const ehson=Math.round(salary*SALARY_RATES.ehson/10000);
 const base=salary-ehson;
 const kelajak=Math.round(base*SALARY_RATES.kelajak/10000);
 const oyin=Math.round(base*SALARY_RATES.oyin/10000);
 const remainder=salary-ehson-kelajak-oyin;
 const rozgor=Math.round(remainder*SALARY_RATES.rozgor/10000);
 const biznes=remainder-rozgor;
 return {salary,ehson,kelajak,oyin,rozgor,biznes};
}
// Faqat SHAXSIY hisobdagi Maosh kategoriya daromadlarini rejalashtiramiz.
// Boshqa turdagi hisoblarga pul avtomatik ko‘chmaydi.
function salaryAllocation(w,month){
 if(!validMonth(month))throw Error('Oy noto‘g‘ri');
 if(w.kind!=='personal')return null;
 const salaries=w.transactions.filter(t=>t.kind==='income'&&t.category==='Maosh'&&t.date.slice(0,7)===month);
 if(!salaries.length)return null;
 const buckets={salary:0,ehson:0,kelajak:0,oyin:0,rozgor:0,biznes:0};
 for(const tx of salaries){
  const part=splitSalary(tx.amount);
  for(const key of Object.keys(buckets))buckets[key]+=part[key];
 }
 const hard=w.budgets[month]||{};
 const targets={};
 const group=Object.keys(HOUSEHOLD_WEIGHTS).filter(cat=>w.categories.expense.includes(cat));
 const fixed=group.filter(cat=>Number(hard[cat])>0);
 const fixedSum=fixed.reduce((sum,cat)=>sum+Number(hard[cat]),0);
 const available=Math.max(0,buckets.rozgor-fixedSum);
 const flexible=group.filter(cat=>!fixed.includes(cat));
 const weightTotal=flexible.reduce((sum,cat)=>sum+HOUSEHOLD_WEIGHTS[cat],0);
 let distributed=0;
 for(let i=0;i<flexible.length;i++){
  const cat=flexible[i];
  const value=weightTotal===0?0:(i===flexible.length-1?available-distributed:Math.round(available*HOUSEHOLD_WEIGHTS[cat]/weightTotal));
  distributed+=value;
  targets[cat]={limit:value,mode:'auto',bucket:'rozgor'};
 }
 for(const cat of fixed)targets[cat]={limit:Number(hard[cat]),mode:'fixed',bucket:'rozgor'};
 if(w.categories.expense.includes('Dam olish')){
  targets['Dam olish']={limit:Number(hard['Dam olish'])>0?Number(hard['Dam olish']):buckets.oyin,mode:Number(hard['Dam olish'])>0?'fixed':'auto',bucket:'oyin'};
 }
 for(const cat of w.categories.expense){
  if(!(cat in targets)&&Number(hard[cat])>0)targets[cat]={limit:Number(hard[cat]),mode:'fixed',bucket:'other'};
 }
 return {
  ...buckets,month,sourceCount:salaries.length,targets,
  hardTotal:fixedSum,hardShortfall:Math.max(0,fixedSum-buckets.rozgor),
  leisureShortfall:Math.max(0,(Number(hard['Dam olish'])||0)-buckets.oyin),
  unallocatedHousehold:Math.max(0,available-distributed)
 };
}
function effectiveCategoryLimit(w,month,category){
 const hard=Number(w.budgets[month]?.[category]||0);
 if(hard>0)return {limit:hard,mode:'fixed'};
 const suggestion=salaryAllocation(w,month)?.targets[category];
 return suggestion?{limit:suggestion.limit,mode:'auto'}:{limit:0,mode:'none'};
}
function addTransaction(w,{kind,amount:val,date=today(),category,note=''}) {
 if(!['income','expense'].includes(kind))throw Error('Operatsiya turi noto‘g‘ri');
 if(!validDay(date))throw Error('Sana noto‘g‘ri');
 const sum=amount(val),name=cleanText(category||categoryFor(w,kind,note),80);
 if(!w.categories[kind].includes(name))throw Error('Kategoriya topilmadi');
 const tx={id:id(),kind,amount:sum,date,category:name,note:cleanText(note)};
 const previous=spent(w,date.slice(0,7),name);
 w.transactions.push(tx);
 const budget=kind==='expense'?effectiveCategoryLimit(w,date.slice(0,7),name).limit:undefined;
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
 const budgets=w.categories.expense.map(category=>({category,spent:spent(w,month,category),...effectiveCategoryLimit(w,month,category)}));
 return {income,expense,net:income-expense,budgets,transactions:items.slice().sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id))};
}
function validate(raw){
 if(!raw||raw.version!==VERSION||!Array.isArray(raw.workspaces)||raw.workspaces.length>MAX_WORKSPACES)throw Error('Zaxira formati noto‘g‘ri');
 const result=fresh(), ids=new Set();
 for(const item of raw.workspaces){
  if(!item||typeof item!=='object'||!KINDS[item.kind]||typeof item.id!=='string'||!item.id||ids.has(item.id))throw Error('Hisob ma’lumoti noto‘g‘ri');
  ids.add(item.id);
  const w={id:item.id,kind:item.kind,name:cleanText(item.name,60)||KINDS[item.kind],categories:{expense:[],income:[]},keywords:{income:{},expense:{}},transactions:[],budgets:{}};
  for(const kind of ['income','expense']){
   const cats=item.categories?.[kind];
   if(!Array.isArray(cats)||!cats.length||cats.length>50)throw Error('Kategoriya ma’lumoti noto‘g‘ri');
   w.categories[kind]=cats.map(c=>cleanText(c,80));
   if(w.categories[kind].some(c=>!c)||new Set(w.categories[kind]).size!==w.categories[kind].length)throw Error('Kategoriya takrorlangan');
  }
  // Eski zaxiralarda keywords yo‘q: bo‘sh lug‘atni qo‘yib moslikni saqlaymiz.
  if(item.keywords!==undefined){
   if(!item.keywords||typeof item.keywords!=='object'||Array.isArray(item.keywords))throw Error('Kalit so‘zlar ma’lumoti noto‘g‘ri');
   for(const kind of ['income','expense']){
    const group=item.keywords[kind]??{};
    if(!group||typeof group!=='object'||Array.isArray(group))throw Error('Kalit so‘zlar ma’lumoti noto‘g‘ri');
    for(const [cat,words] of Object.entries(group)){
     if(!w.categories[kind].includes(cat)||!Array.isArray(words)||words.length>30)throw Error('Kalit so‘zlar ma’lumoti noto‘g‘ri');
     for(const word of words)addKeyword(w,kind,cat,word);
    }
   }
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
return {KINDS,BASE,SALARY_RATES,HOUSEHOLD_WEIGHTS,SALARY_BUCKETS,splitSalary,salaryAllocation,effectiveCategoryLimit,KEYWORD_RULES,normalizeKeyword,keywordMatches,addKeyword,removeKeyword,today,money,amount,validDay,validMonth,fresh,create,current,setActive,parseFast,categoryFor,addTransaction,editTransaction,removeTransaction,setBudget,addCategory,summary,validate,csv,spent};
});
