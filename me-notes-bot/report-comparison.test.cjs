'use strict';
const assert=require('node:assert/strict');
const F=require('../me-notes-sahifalab/finance-core.js');
const result=F.reportComparison({expense:240,budgets:[
 {category:'A',spent:140,limit:100,mode:'fixed'},
 {category:'B',spent:40,limit:100,mode:'auto'},
 {category:'C',spent:60,limit:0,mode:'none'},
 {category:'D',spent:0,limit:0,mode:'auto'},
 {category:'E',spent:0,limit:0,mode:'none'}
]});
assert.equal(result.plannedTotal,200);
assert.equal(result.plannedSpent,180);
assert.equal(result.over,40);
assert.equal(result.unplannedSpent,60);
assert.equal(result.rows.length,4);
assert.equal(result.rows.find(x=>x.category==='C').remaining,null);
assert.equal(result.rows.find(x=>x.category==='D').remaining,0);
assert.equal(F.reportComparison({expense:0,budgets:[]}).rows.length,0);
const s=F.fresh();
F.create(s,'personal','Shaxsiy');
const w=F.current(s);
F.addTransaction(w,{kind:'income',category:'Maosh',amount:5000000,date:'2026-11-01'});
F.addTransaction(w,{kind:'expense',category:'Transport',amount:100000,date:'2026-11-02'});
F.setBudget(w,'2026-11','Transport',80000);
const nov=F.reportComparison(F.summary(w,'2026-11'));
const dec=F.reportComparison(F.summary(w,'2026-12'));
assert.equal(nov.rows.find(r=>r.category==='Transport').remaining,-20000);
assert.equal(dec.rows.length,0);
assert.equal(F.summary(w,'2026-11').income,5000000);
assert.equal(F.summary(w,'2026-12').income,0);
console.log('Monthly comparison checks passed');
