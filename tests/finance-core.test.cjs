const test=require('node:test');
const assert=require('node:assert/strict');
const F=require('../me-notes-sahifalab/finance-core.js');
function fixture(kind='personal'){const s=F.fresh();const w=F.create(s,kind);return {s,w};}
test('uchta mustaqil hisob turi',()=>{
 const s=F.fresh(),p=F.create(s,'personal'),f=F.create(s,'family'),b=F.create(s,'business');
 assert.equal(s.workspaces.length,3);assert.notEqual(p.id,f.id);assert.notEqual(f.id,b.id);
});
test('har bir hisobda kirim-chiqim alohida',()=>{
 const s=F.fresh(),p=F.create(s,'personal'),f=F.create(s,'family');
 F.addTransaction(p,{kind:'expense',amount:25000,date:'2026-11-13',category:'Transport'});
 assert.equal(F.summary(p,'2026-11').expense,25000);
 assert.equal(F.summary(f,'2026-11').expense,0);
});
test('tezkor yozuv: xarajat',()=>assert.deepEqual(F.parseFast('25 000 taksi'),{kind:'expense',amount:25000,note:'taksi'}));
test('tezkor yozuv: daromad',()=>assert.deepEqual(F.parseFast('+3 000 000 oylik'),{kind:'income',amount:3000000,note:'oylik'}));
test('izohsiz son avtomatik yozilmaydi',()=>assert.equal(F.parseFast('25000'),null));
test('sana yaroqliligi',()=>{assert.equal(F.validDay('2026-02-30'),false);assert.equal(F.validDay('2026-02-28'),true);});
test('noto‘g‘ri summalarni rad etish',()=>{for(const n of [-1,0,1.5,Infinity,1000000000001])assert.throws(()=>F.amount(n));});
test('kategoriya avtomatik tanlanishi',()=>{const {w}=fixture();assert.equal(F.categoryFor(w,'expense','taksi'),'Transport');assert.equal(F.categoryFor(w,'income','oylik'),'Maosh');});
test('80 foiz ogohlantirishi',()=>{
 const {w}=fixture();F.setBudget(w,'2026-11','Transport',100000);
 const x=F.addTransaction(w,{kind:'expense',amount:80000,date:'2026-11-13',category:'Transport'});
 assert.match(x.alert,/80%/);
});
test('100 foiz ogohlantirishi',()=>{
 const {w}=fixture();F.setBudget(w,'2026-11','Transport',100000);
 F.addTransaction(w,{kind:'expense',amount:80000,date:'2026-11-13',category:'Transport'});
 const x=F.addTransaction(w,{kind:'expense',amount:20000,date:'2026-11-13',category:'Transport'});
 assert.match(x.alert,/tugadi/);
});
test('oy o‘zgarsa limitning sarfi noldan',()=>{
 const {w}=fixture();F.setBudget(w,'2026-11','Transport',100000);
 F.addTransaction(w,{kind:'expense',amount:25000,date:'2026-11-13',category:'Transport'});
 assert.equal(F.spent(w,'2026-12','Transport'),0);
});
test('tahrir qilinganda hisobot yangilanadi',()=>{
 const {w}=fixture();const {tx}=F.addTransaction(w,{kind:'expense',amount:25000,date:'2026-11-13',category:'Transport'});
 F.editTransaction(w,tx.id,{amount:30000,category:'Kiyim'});
 assert.equal(F.spent(w,'2026-11','Transport'),0);assert.equal(F.spent(w,'2026-11','Kiyim'),30000);
});
test('o‘chirilgan yozuv limitdan ham chiqariladi',()=>{
 const {w}=fixture();const {tx}=F.addTransaction(w,{kind:'expense',amount:25000,date:'2026-11-13',category:'Transport'});
 F.removeTransaction(w,tx.id);assert.equal(F.summary(w,'2026-11').expense,0);
});
test('begona hisob ID almashtirilmaydi',()=>{
 const {s}=fixture();assert.throws(()=>F.setActive(s,'not_owned'));
});
test('zaxira saqlash va tekshirish',()=>{
 const {s,w}=fixture();F.addTransaction(w,{kind:'income',amount:500000,date:'2026-11-13',category:'Maosh'});
 const restored=F.validate(JSON.parse(JSON.stringify(s)));assert.equal(F.summary(restored.workspaces[0],'2026-11').income,500000);
});
test('buzilgan zaxira importi to‘xtatiladi',()=>{
 const {s}=fixture();s.workspaces[0].transactions=[{id:'bad',kind:'expense',amount:-100,date:'2026-11-13',category:'Transport'}];
 assert.throws(()=>F.validate(s));
});
test('CSV formula xavfini cheklaydi',()=>{
 const {w}=fixture();F.addTransaction(w,{kind:'expense',amount:500,date:'2026-11-13',category:'Transport',note:'=1+1'});
 assert.match(F.csv(w),/'=1\+1/);
});
test('kategoriya qo‘shish',()=>{
 const {w}=fixture();F.addCategory(w,'expense','Hayvonlar');assert.ok(w.categories.expense.includes('Hayvonlar'));
});
test('ko‘pi bilan 12 ta hisob',()=>{
 const s=F.fresh();for(let i=0;i<12;i++)F.create(s,'personal');assert.throws(()=>F.create(s,'personal'));
});
test('limitni o‘chirish',()=>{
 const {w}=fixture();F.setBudget(w,'2026-11','Transport',100);F.setBudget(w,'2026-11','Transport',0);
 assert.equal(F.summary(w,'2026-11').budgets.find(x=>x.category==='Transport').limit,0);
});

test('Uzbekcha miqdor: 25 ming taksi',()=>assert.deepEqual(F.parseFast('25 ming taksi'),{kind:'expense',amount:25000,note:'taksi'}));
test('Summani oxirida yozish: tushlik 35000',()=>assert.deepEqual(F.parseFast('tushlik 35000'),{kind:'expense',amount:35000,note:'tushlik'}));
test('Summani oxirida yozish: taksi 25 ming',()=>assert.deepEqual(F.parseFast('taksi 25 ming'),{kind:'expense',amount:25000,note:'taksi'}));
test('Daromad: +3 mln oylik',()=>assert.deepEqual(F.parseFast('+3 mln oylik'),{kind:'income',amount:3000000,note:'oylik'}));
test('Katta pul: 1,5 mln maosh',()=>assert.deepEqual(F.parseFast('+1,5 mln maosh'),{kind:'income',amount:1500000,note:'maosh'}));
test('Qo‘shimcha: 25k taksi',()=>assert.deepEqual(F.parseFast('25k taksi'),{kind:'expense',amount:25000,note:'taksi'}));
test('Bog‘langan sonlar 25 000 taksi',()=>assert.deepEqual(F.parseFast('25 000 taksi'),{kind:'expense',amount:25000,note:'taksi'}));
test('Bozor oilaviy hisob kategoriyasi',()=>{const {w}=fixture('family');assert.equal(F.categoryFor(w,'expense','bozor'),'Bozor');});
test('Kichik biznes savdosi kategoriyasi',()=>{const {w}=fixture('business');assert.equal(F.categoryFor(w,'income','savdo tushumi'),'Savdo tushumi');});
test('Mantiqsiz qiymatlar qabul qilinmaydi',()=>{for(const q of ['taksi','0 taksi','-25 ming','1,234,567 taksi','9999999999999999 taksi']){assert.equal(F.parseFast(q),null);}});


test('Transportga yo‘lga so‘zining 4 xil apostrof yozilishi',()=>{
 const {w}=fixture();
 for(const phrase of ["yo'lga","yo‘lga","yoʻlga","йўлга","taksiga","yo'lkiraga","benzin"]){
  assert.equal(F.categoryFor(w,'expense',phrase),'Transport',phrase);
 }
});
test('Transportni boshqa so‘z ichida chalkashtirmaydi',()=>{
 const {w}=fixture();
 assert.equal(F.categoryFor(w,'expense','gazeta'),'Boshqa');
});
test('Shaxsiy har bir asosiy kategoriya uchun bir nechta so‘z',()=>{
 const {w}=fixture();
 const cases=[
  ["tushlikka","Oziq-ovqat"],
  ["bozorga","Oziq-ovqat"],
  ["svetga","Kommunal"],
  ["doriga","Sog'liq"],
  ["futbolkaga","Kiyim"],
  ["maktabga","Ta'lim"],
  ["mebelga","Uy-ro'zg'or"],
  ["kinoga","Dam olish"]
 ];
 for(const [note,cat] of cases)assert.equal(F.categoryFor(w,'expense',note),cat,note);
});
test('Oilaviy hisob: bolalar, bozor, ta’lim, transport, kirim',()=>{
 const {w}=fixture('family');
 for(const [note,cat] of [
  ["bog‘chaga","Bolalar"],["pampersga","Bolalar"],["bozorga","Bozor"],
  ["maktabga","Ta'lim"],["yo‘lga","Transport"]]){
  assert.equal(F.categoryFor(w,'expense',note),cat,note);
 }
 assert.equal(F.categoryFor(w,'income','nafaqadan'),'Oilaviy kirim');
});
test('Biznes hisob: tovar, reklama, ish haqi, ijara, tushum',()=>{
 const {w}=fixture('business');
 for(const [note,cat] of [
   ["tovarga","Tovar"],["targetga","Reklama"],["ishchilarga","Ish haqi"],
   ["ijaraga","Ijara"],["yo‘lga","Transport"]]){
  assert.equal(F.categoryFor(w,'expense',note),cat,note);
 }
 assert.equal(F.categoryFor(w,'income','savdodan'),'Savdo tushumi');
 assert.equal(F.categoryFor(w,'income','mijozdan xizmat'),'Xizmat daromadi');
});
test('Maxsus kalit so‘z boshqa standart lug‘atdan oldinda',()=>{
 const {w}=fixture('personal');
 F.addKeyword(w,'expense','Transport','magazin');
 assert.equal(F.categoryFor(w,'expense','magazinga'),'Transport');
 F.removeKeyword(w,'expense','Transport','magazin');
 assert.equal(F.categoryFor(w,'expense','magazinga'),'Oziq-ovqat');
});
test('Kalit so‘z har hisob uchun alohida',()=>{
 const s=F.fresh(),a=F.create(s,'personal'),b=F.create(s,'family');
 F.addKeyword(a,'expense','Transport','elektrosamokat');
 assert.equal(F.categoryFor(a,'expense','elektrosamokat'),'Transport');
 assert.equal(F.categoryFor(b,'expense','elektrosamokat'),'Boshqa');
});
test('Kalit so‘z takrori yoki noto‘g‘ri kategoriya rad qilinadi',()=>{
 const {w}=fixture();
 F.addKeyword(w,'expense','Transport','elektrosamokat');
 assert.throws(()=>F.addKeyword(w,'expense',"Oziq-ovqat",'elektrosamokat'));
 assert.throws(()=>F.addKeyword(w,'expense','Yo‘q kategoriya','yangi'));
});
test('Eski localStorage zaxirasi va yangi kalit so‘zli zaxira',()=>{
 const {s,w}=fixture();
 delete w.keywords; // old version
 const restored=F.validate(JSON.parse(JSON.stringify(s)));
 assert.deepEqual(restored.workspaces[0].keywords,{income:{},expense:{}});
 F.addKeyword(restored.workspaces[0],'expense','Transport','skuter');
 const again=F.validate(JSON.parse(JSON.stringify(restored)));
 assert.equal(F.categoryFor(again.workspaces[0],'expense','skuterga'),'Transport');
});
test('Zaxiradagi buzilgan kalit so‘zlar bloklanadi',()=>{
 const {s,w}=fixture();
 w.keywords.expense.Transport=['taksi','taksi'];
 assert.throws(()=>F.validate(s));
});
test('Mavjud yozuvlar toifasi lug‘at o‘zgarganda avtomatik o‘zgarmaydi',()=>{
 const {w}=fixture();
 const {tx}=F.addTransaction(w,{kind:'expense',amount:25000,date:'2026-11-13',note:'yo‘lga',category:'Boshqa'});
 assert.equal(tx.category,'Boshqa');
 assert.equal(F.categoryFor(w,'expense','yo‘lga'),'Transport');
 assert.equal(F.summary(w,'2026-11').transactions[0].category,'Boshqa');
});


test('5 mln oylik — aniq 2.5/10/10/45/55 taqsimot',()=>{
 const p=F.splitSalary(5000000);
 assert.deepEqual(p,{salary:5000000,ehson:125000,kelajak:487500,oyin:487500,rozgor:1755000,biznes:2145000});
 assert.equal(p.ehson+p.kelajak+p.oyin+p.rozgor+p.biznes,p.salary);
});
test('Taqsimotda kichik summa va yaxlitlash yo‘qolmasin',()=>{
 for(const a of [1,2,3,99,1000,10001,1234567,999999999]){
  const p=F.splitSalary(a);
  assert.equal(p.ehson+p.kelajak+p.oyin+p.rozgor+p.biznes,a);
 }
});
test('Maosh bir daromad yozuvi, taqsimot xarajatlarni ko‘paytirmaydi',()=>{
 const {w}=fixture('personal');
 F.addTransaction(w,{kind:'income',amount:5000000,date:'2026-11-13',category:'Maosh',note:'oylik'});
 const p=F.salaryAllocation(w,'2026-11');
 assert.equal(p.rozgor,1755000);
 assert.equal(F.summary(w,'2026-11').income,5000000);
 assert.equal(F.summary(w,'2026-11').expense,0);
 assert.equal(w.transactions.length,1);
});
test('Ro‘zg‘or taxminiy limitlari jami to‘liq, Dam olish alohida',()=>{
 const {w}=fixture();
 F.addTransaction(w,{kind:'income',amount:5000000,date:'2026-11-13',category:'Maosh'});
 const p=F.salaryAllocation(w,'2026-11');
 const sum=Object.entries(p.targets).filter(([cat,x])=>x.bucket==='rozgor').reduce((a,[cat,x])=>a+x.limit,0);
 assert.equal(sum,p.rozgor);
 assert.equal(p.targets['Dam olish'].limit,p.oyin);
 assert.equal(p.targets['Transport'].mode,'auto');
});
test('Bir oydagi bir nechta maosh qo‘shilib hisoblanadi',()=>{
 const {w}=fixture();
 F.addTransaction(w,{kind:'income',amount:2000000,date:'2026-11-01',category:'Maosh'});
 F.addTransaction(w,{kind:'income',amount:3000000,date:'2026-11-13',category:'Maosh'});
 const p=F.salaryAllocation(w,'2026-11');
 assert.equal(p.salary,5000000);
 assert.equal(p.sourceCount,2);
 assert.equal(p.ehson,125000);
});
test('Sovg‘a va boshqa daromad avtomatik taqsimlanmaydi',()=>{
 const {w}=fixture();
 F.addTransaction(w,{kind:'income',amount:5000000,date:'2026-11-13',category:"Sovg'a"});
 assert.equal(F.salaryAllocation(w,'2026-11'),null);
});
test('Faqat shaxsiy hisobda ishga tushadi; oilaviy va biznes mustaqil',()=>{
 for(const type of ['family','business']){
  const {w}=fixture(type);
  assert.equal(F.salaryAllocation(w,'2026-11'),null);
 }
});
test('Qat’iy limit saqlanib, boshqa yumshoq limitlar qayta bo‘linadi',()=>{
 const {w}=fixture();
 F.addTransaction(w,{kind:'income',amount:5000000,date:'2026-11-13',category:'Maosh'});
 F.setBudget(w,'2026-11','Oziq-ovqat',1000000);
 const p=F.salaryAllocation(w,'2026-11');
 assert.equal(p.targets['Oziq-ovqat'].limit,1000000);
 assert.equal(p.targets['Oziq-ovqat'].mode,'fixed');
 const sum=Object.values(p.targets).filter(x=>x.bucket==='rozgor').reduce((a,x)=>a+x.limit,0);
 assert.equal(sum,p.rozgor);
 assert.equal(F.effectiveCategoryLimit(w,'2026-11','Transport').mode,'auto');
});
test('Qat’iy limit oshsa defitsit ko‘rinadi; qiymat qisqartirilmaydi',()=>{
 const {w}=fixture();
 F.addTransaction(w,{kind:'income',amount:5000000,date:'2026-11-13',category:'Maosh'});
 F.setBudget(w,'2026-11','Oziq-ovqat',2000000);
 const p=F.salaryAllocation(w,'2026-11');
 assert.equal(p.hardShortfall,245000);
 assert.equal(p.targets['Oziq-ovqat'].limit,2000000);
 assert.equal(p.targets['Transport'].limit,0);
});
test('Qat’iy limitdan avtomatik limitga qaytarish',()=>{
 const {w}=fixture();
 F.addTransaction(w,{kind:'income',amount:5000000,date:'2026-11-13',category:'Maosh'});
 F.setBudget(w,'2026-11','Transport',500000);
 assert.equal(F.effectiveCategoryLimit(w,'2026-11','Transport').mode,'fixed');
 F.setBudget(w,'2026-11','Transport',0);
 assert.equal(F.effectiveCategoryLimit(w,'2026-11','Transport').mode,'auto');
});
test('Dam olish me’yori to‘g‘ridan-to‘g‘ri o‘yin-kulgi puliga teng',()=>{
 const {w}=fixture();
 F.addTransaction(w,{kind:'income',amount:5000000,date:'2026-11-13',category:'Maosh'});
 F.setBudget(w,'2026-11','Dam olish',600000);
 const p=F.salaryAllocation(w,'2026-11');
 assert.equal(p.leisureShortfall,112500);
 assert.equal(p.targets['Dam olish'].mode,'fixed');
});
test('Yangi oyda maosh kiritilmasa o‘tgan oy limitlari ko‘chmaydi',()=>{
 const {w}=fixture();
 F.addTransaction(w,{kind:'income',amount:5000000,date:'2026-11-13',category:'Maosh'});
 assert.equal(F.salaryAllocation(w,'2026-12'),null);
 assert.equal(F.effectiveCategoryLimit(w,'2026-12','Transport').limit,0);
});
test('Maosh tahrirlansa yoki o‘chirilsa reja ham yangilanadi',()=>{
 const {w}=fixture(),{tx}=F.addTransaction(w,{kind:'income',amount:5000000,date:'2026-11-13',category:'Maosh'});
 F.editTransaction(w,tx.id,{amount:4000000});
 assert.equal(F.salaryAllocation(w,'2026-11').salary,4000000);
 F.removeTransaction(w,tx.id);
 assert.equal(F.salaryAllocation(w,'2026-11'),null);
});
test('Taxminiy limit ishlatilganda 80% ogohlantirish chiqaradi',()=>{
 const {w}=fixture();
 F.addTransaction(w,{kind:'income',amount:5000000,date:'2026-11-13',category:'Maosh'});
 const provisional=F.effectiveCategoryLimit(w,'2026-11','Transport').limit;
 const tx=F.addTransaction(w,{kind:'expense',amount:Math.ceil(provisional*.8),date:'2026-11-13',category:'Transport'});
 assert.match(tx.alert,/80%/);
});
test('Eski zaxira qayta ochilganda avtomatik reja ishlaydi',()=>{
 const {s,w}=fixture();
 F.addTransaction(w,{kind:'income',amount:5000000,date:'2026-11-13',category:'Maosh'});
 const restored=F.validate(JSON.parse(JSON.stringify(s)));
 assert.equal(F.salaryAllocation(restored.workspaces[0],'2026-11').salary,5000000);
});
