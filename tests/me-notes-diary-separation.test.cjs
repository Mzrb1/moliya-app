'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const p=require('node:path');
const html=fs.readFileSync(p.join(__dirname,'../me-notes-sahifalab/index.html'),'utf8');
test('Sahifalab kundalikda alohida moliya menyusi yoki promo bo‘lmaydi',()=>{
 assert.doesNotMatch(html,/href="finance\.html"/);
 assert.doesNotMatch(html,/href="finance-unified\.html"/);
 assert.doesNotMatch(html,/✨ Yagona moliya \(sinov\)/);
 assert.doesNotMatch(html,/💼 Moliya boshqaruvi/);
});
test('Sahifalab darslari, kundalik va zaxira saqlanadi',()=>{
 for(const section of ['data-tab="home"','data-tab="lessons"','data-tab="entries"','data-tab="backup"'])
  assert.ok(html.includes(section),section);
 assert.ok(html.includes('id="snapshot"'));
 assert.ok(html.includes('id="export-json"'));
 assert.ok(html.includes('id="import-file"'));
 assert.ok(html.includes('id="quick-expense"'));
});
test('Oldingi kundalik ma’lumotlarini saqlash kaliti o‘zgarmagan',()=>{
 assert.ok(html.includes("const STORE='moliyaviy_kundalik_sahifalab_v1'"));
});
test('Alohida yagona moliya sahifasi saqlanadi',()=>{
 const mini=fs.readFileSync(p.join(__dirname,'../me-notes-sahifalab/finance-unified.html'),'utf8');
 assert.ok(mini.includes('id="view-home"'));
 assert.ok(mini.includes('id="view-budget"'));
 assert.ok(mini.includes('id="view-report"'));
});
