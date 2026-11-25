const test=require('node:test');
const assert=require('node:assert/strict');
const F=require('../../me-notes-sahifalab/finance-core.js');
test('personal salary, advance and bonus recognition',()=>{
 const w=F.create(F.fresh(),'personal','test');
 for(const raw of ['3560 ming oylik','1900000 avans oldim','500 ming premiya']){
  const x=F.parseFast(raw,w.kind);assert.equal(x.kind,'income');assert.equal(F.categoryFor(w,x.kind,x.note),'Maosh');
 }
 assert.equal(F.parseFast('-500 ming avans','personal').kind,'expense');
 assert.equal(F.parseFast('500 ming avans','business').kind,'expense');
});
test('monthly income and wallet balances without duplicate income',()=>{
 const w=F.create(F.fresh(),'personal','test');
 w.transactions=[
 {kind:'income',category:'Maosh',amount:3560000,date:'2026-11-01'},
 {kind:'income',category:'Boshqa',note:'avans oldim',amount:1900000,date:'2026-11-25'},
 {kind:'income',category:'Maosh',amount:500000,date:'2026-10-25'},
 {kind:'expense',category:'Ehson',amount:30000,date:'2026-11-25'},
 {kind:'expense',category:'Shaxsiy xarid',amount:15000,date:'2026-11-25'},
 {kind:'expense',category:'Oziq-ovqat',amount:200000,date:'2026-11-25'}
 ];
 const p=F.salaryAllocation(w,'2026-11');
 assert.equal(p.salary,5460000);
 assert.equal(p.ehson+p.kelajak+p.oyin+p.rozgor+p.biznes,p.salary);
 assert.equal(p.walletUsage.ehson.remaining,106500);
 assert.equal(p.walletUsage.oyin.remaining,517350);
 assert.equal(p.walletUsage.rozgor.remaining,1716460);
 for(const [note,category] of [['bozorlik','Oziq-ovqat'],['kola','Shaxsiy xarid'],['hosting','Biznes xarajati'],['investitsiya','Investitsiya'],['ehson','Ehson']])assert.equal(F.categoryFor(w,'expense',note),category);
});
