'use strict';
const assert=require('node:assert/strict');
const F=require('../me-notes-sahifalab/finance-core.js');
const {makeFinanceApi}=require('./miniapp-api.cjs');
const uid='user1',wid='workspace1';
const fixture=[
 {uid,wid,day:'2026-11-01',kind:'income',amount:5000000,category:'Maosh',id:'1'},
 {uid,wid,day:'2026-11-20',kind:'expense',amount:3800000,category:'Transport',id:'2'},
 {uid,wid,day:'2026-12-02',kind:'expense',amount:100000,category:'Transport',id:'3'},
 {uid:'other',wid:'workspace2',day:'2026-11-01',kind:'income',amount:9999999,category:'Maosh',id:'4'}
];
const rows=x=>({rows:x});
const db={
 async execute({sql,args}){
  if(sql.startsWith('SELECT id,kind,name FROM mn_workspaces'))return rows(args[0]===uid&&args[1]===wid?[{id:wid,kind:'personal',name:'Shaxsiy'}]:[]);
  return rows([]);
 },
 async batch(queries,mode){
  assert.equal(mode,'read');
  return queries.map(({sql,args})=>{
   if(sql.includes('GROUP BY substr(day,1,7)'))return rows([{month:'2026-11',n:2,income:5000000,expense:3800000},{month:'2026-12',n:1,income:0,expense:100000}]);
   if(sql.includes('SELECT DISTINCT month'))return rows([{month:'2026-10'}]);
   if(sql.includes('FROM mn_closed_months'))return rows([]);
   if(sql.includes('AS net FROM mn_transactions')){
    assert.equal(args[0],uid);assert.equal(args[1],wid);
    return rows([{net:fixture.filter(t=>t.uid===args[0]&&t.wid===args[1]&&t.day<args[2]).reduce((sum,t)=>sum+(t.kind==='income'?t.amount:-t.amount),0)}]);
   }
   if(sql.includes('SELECT id,kind,category,amount,note,day')){
    return rows(fixture.filter(t=>t.uid===args[0]&&t.wid===args[1]&&t.day>=args[2]&&t.day<args[3]));
   }
   if(sql.includes('SELECT category,limit_amount'))return rows([]);
   throw Error('Unexpected query: '+sql);
  });
 }
};
(async()=>{
 const api=makeFinanceApi({db,botToken:'test',ensure:async()=>{}});
 const nov=await api.ledger(uid,wid,'2026-11');
 const dec=await api.ledger(uid,wid,'2026-12');
 assert.equal(nov.totals.opening_balance,0);
 assert.equal(nov.totals.closing_balance,1200000);
 assert.equal(dec.totals.opening_balance,1200000);
 assert.equal(dec.totals.income,0);
 assert.equal(dec.totals.expense,100000);
 assert.equal(dec.totals.closing_balance,1100000);
 assert.equal(dec.plan,null);
 const history=await api.monthHistory(uid,wid);
 assert.equal(history.some(r=>r.month==='2026-10'),true);
 assert.equal(history.some(r=>r.month===F.today().slice(0,7)),true);
 await assert.rejects(()=>api.ledger('other',wid,'2026-12'));
 console.log('Monthly rollover mock checks passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
