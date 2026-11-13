'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const F=require('../me-notes-sahifalab/finance-core.js');
const {MAX_LIST_ITEMS,listLineUpdateId,listRangeForId}=require('../me-notes-bot/list-utils.cjs');
const sample="Tushlik 98000\n18ming yo‘lga";
test('Skrinshotdagi ikkita xarajat bir ro‘yxatda ajraladi',()=>{
 const p=F.parseList(sample);
 assert.equal(p.errors.length,0);
 assert.equal(p.items.length,2);
 assert.deepEqual(p.items.map(x=>x.amount),[98000,18000]);
 assert.deepEqual(p.items.map(x=>F.categoryFor({categories:F.BASE.personal},x.kind,x.note)),['Oziq-ovqat','Transport']);
 assert.equal(p.items.reduce((s,x)=>s+x.amount,0),116000);
});
test('Belgilangan va raqamlangan ro‘yxatdagi 3 turli yozuv',()=>{
 const p=F.parseList("Xarajatlar:\n1. 25 ming taksi\n2) bozor 120 000\n• +3 mln oylik");
 assert.equal(p.errors.length,0);
 assert.equal(p.items.length,3);
 assert.deepEqual(p.items.map(x=>x.amount),[25000,120000,3000000]);
 assert.deepEqual(p.items.map(x=>x.kind),['expense','expense','income']);
});
test('Har qatorda bitta summa, qora ro‘yxatlarni tanish',()=>{
 const p=F.parseList("- 80 ming internet\n* 25 ming doriga\n● tushlik 35k");
 assert.equal(p.errors.length,0);
 assert.equal(p.items[2].amount,35000);
 assert.equal(F.categoryFor({categories:F.BASE.personal},p.items[0].kind,p.items[0].note),'Kommunal');
});
test('Xato qator bo‘lsa saqlashga tayyor yozuvlar bo‘lsa ham errors qaytadi',()=>{
 const p=F.parseList("Tushlik 98000\nkarta to‘ldirdim\n18ming yo‘lga");
 assert.equal(p.items.length,2);
 assert.equal(p.errors.length,1);
 assert.equal(p.errors[0].line,2);
});
test('Ikki noto‘g‘ri qatorning raqamlari chiqadi',()=>{
 const p=F.parseList("1) 30 ming taksi\n2) noto‘g‘ri\n3) 50000 dori\n4) bilmayman");
 assert.deepEqual(p.errors.map(x=>x.line),[2,4]);
});
test('Ro‘yxat sarlavhasi operatsiya bo‘lib yozilmaydi',()=>{
 const p=F.parseList("Bugungi xarajatlar:\n1. benzin 120000\n2. non 15000");
 assert.equal(p.errors.length,0);
 assert.equal(p.items.length,2);
});
test('Bo‘sh ro‘yxat rad qilinadi',()=>{
 const p=F.parseList("\n\n");
 assert.equal(p.errors.length,1);
});
test('21 ta yozuv bitta xabarda qabul qilinmaydi',()=>{
 const p=F.parseList(Array.from({length:21},()=> '10 ming non').join('\n'));
 assert.equal(p.items.length,0);
 assert.ok(p.errors.length);
});
test('Atigi bitta qatordan iborat xabar oldingi oqimda qoladi',()=>{
 assert.equal(F.parseList("25 ming taksi"),null);
});
test('Barcha 3 hisob turida kategoriya alohida moslanadi',()=>{
 const p=F.parseList("20000 bog‘chaga\n30 ming bozorga\n50 ming tovar");
 assert.equal(p.errors.length,0);
 assert.equal(F.categoryFor({categories:F.BASE.family},'expense',p.items[0].note),'Bolalar');
 assert.equal(F.categoryFor({categories:F.BASE.family},'expense',p.items[1].note),'Bozor');
 assert.equal(F.categoryFor({categories:F.BASE.business},'expense',p.items[2].note),'Tovar');
});
test('Ro‘yxat satrlari uchun update ID lar alohida va manfiy',()=>{
 const id=417308143;
 const ids=[0,1,2,19].map(i=>listLineUpdateId(id,i));
 assert.equal(new Set(ids).size,4);
 assert.ok(ids.every(x=>x<0));
 assert.ok(!ids.includes(id));
});
test('Bir xil xabar qayta yetkazilsa IDlar o‘zgarmaydi',()=>{
 const id=417308143;
 assert.equal(listLineUpdateId(id,1),listLineUpdateId(id,1));
 assert.notEqual(listLineUpdateId(id,1),listLineUpdateId(id+1,1));
});
test('Butun ro‘yxatni bekor qilish oraliqlari to‘g‘ri',()=>{
 const source=417308143;
 const {lower,upper}=listRangeForId(listLineUpdateId(source,1));
 for(let i=0;i<MAX_LIST_ITEMS;i++){
  const x=listLineUpdateId(source,i);
  assert.ok(x>=lower&&x<=upper);
 }
 assert.ok(listLineUpdateId(source+1,0)<lower);
 assert.ok(listLineUpdateId(source-1,19)>upper);
});
test('Chegaradan oshgan index, manfiy update va noaniq son rad qilinadi',()=>{
 assert.throws(()=>listLineUpdateId(-1,0));
 assert.throws(()=>listLineUpdateId(5,20));
 assert.throws(()=>listLineUpdateId(Number.MAX_SAFE_INTEGER,0));
});
