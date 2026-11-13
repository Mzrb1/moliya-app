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