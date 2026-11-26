'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const F=require('../me-notes-sahifalab/finance-core.js');
const js=fs.readFileSync('me-notes-sahifalab/finance-unified.js','utf8');
const html=fs.readFileSync('me-notes-sahifalab/finance-unified.html','utf8');
const start=js.indexOf('function isSalaryNote(');
const end=js.indexOf('function showPreview()',start);
assert.ok(start>0&&end>start,'Salary entry logic exists');
const parserSource=js.slice(start,end);
function parser(kind='personal'){
 const w={kind};
 const ctx={F,current:()=>w,compute:()=>({prefs:{categories:F.BASE[kind],keywords:{income:{},expense:{}}}})};
 return vm.runInNewContext(parserSource+'\nparseInput',ctx);
}
test('Quick entry on home accepts explicit salary and unsigned clear salary',()=>{
 const parse=parser();
 for(const text of ['+4 mln oylik','4 mln oylik','4 mln maosh','4 mln oyligim']){
  const r=parse(text);
  assert.equal(r.length,1,text);
  assert.equal(r[0].kind,'income',text);
  assert.equal(r[0].category,'Maosh',text);
  assert.equal(r[0].amount,4000000,text);
 }
});
test('Non-salary expenses and explicit minus stay expenses',()=>{
 const parse=parser();
 const r=parse('25 ming taksi\nTushlik 35000\n-4 mln oylik');
 assert.equal(r.length,3);
 assert.deepEqual(Array.from(r,x=>x.kind),['expense','expense','expense']);
 assert.equal(r[0].category,'Transport');
 assert.equal(r[1].category,'Oziq-ovqat');
});
test('Mixed quick entries yield the expected Ehson Kelajak Oyin Ro zgor Biznes',()=>{
 const parse=parser();
 const r=parse('+4 mln oylik\n25 ming taksi');
 // Backend gives each stored transaction its immutable id; the UI parser is pre-save.
 const saved=r.map((entry,index)=>({...entry,id:'fixture-'+index}));
 const month=F.today().slice(0,7);
 const plan=F.salaryAllocation({kind:'personal',categories:F.BASE.personal,transactions:saved,budgets:{[month]:{}}},month);
 assert.ok(plan);
 assert.deepEqual([plan.salary,plan.ehson,plan.kelajak,plan.oyin,plan.rozgor,plan.biznes],
  [4000000,100000,390000,390000,1404000,1716000]);
 assert.equal(F.summary({kind:'personal',categories:F.BASE.personal,transactions:saved,budgets:{[month]:{}}},month).net,3975000);
});
test('Missing Maosh offers edit-in-place and does not add another income',()=>{
 assert.match(js,/Oylik deb to‘g‘rilash/);
 assert.match(js,/editableSalary\.kind|editableSalary\.note/);
 assert.match(js,/enqueue\(\{action:'edit',transaction_id:editableSalary\.id/);
 assert.doesNotMatch(js,/action:'add',entry:\{kind:'income',category:'Maosh',amount:editableSalary\.amount/);
});
test('Advance income counts as salary; explicit minus remains expense',()=>{
 const parse=parser();
 assert.equal(parse('2 mln avans')[0].kind,'income');
 assert.equal(parse('2 mln avans oldim')[0].category,'Maosh');
 assert.equal(parse('-2 mln avans')[0].kind,'expense');
 assert.equal(parse('+2 mln avans')[0].category,'Maosh');
});
test('Family/business income does not trigger a personal allocation',()=>{
 for(const kind of ['family','business']){
  const parse=parser(kind);
  const r=parse('+4 mln oylik');
  assert.equal(F.salaryAllocation({kind,categories:F.BASE[kind],transactions:r,budgets:{}},F.today().slice(0,7)),null);
 }
});
test('Quick entry visible on home with original text parser, advanced form preserved in Records',()=>{
 const home=html.slice(html.indexOf('<section id="view-home">'),html.indexOf('<section id="view-records"'));
 const records=html.slice(html.indexOf('<section id="view-records"'),html.indexOf('<section id="view-report"'));
 assert.match(home,/id="quick-form"/);
 assert.match(home,/id="simple-panel"/);
 assert.match(home,/id="recent"/);
 assert.match(records,/id="manual-form"/);
 assert.doesNotMatch(records,/id="quick-form"/);
 assert.match(js,/enqueue\(parts.length===1/);
});
