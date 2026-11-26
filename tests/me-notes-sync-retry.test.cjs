'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const script=fs.readFileSync('me-notes-sahifalab/finance-unified.js','utf8');
const html=fs.readFileSync('me-notes-sahifalab/finance-unified.html','utf8');
const retry=script.slice(script.indexOf('function stopReconnect(){'),script.indexOf('function el(tag'));
const flush=script.slice(script.indexOf('async function flush('),script.indexOf('function chooseView('));
assert.ok(retry.includes('function scheduleReconnect()'));
assert.ok(flush.includes('async function flush('));

function runner(fail){
 const op={op_id:'web_fixed_retry_uuid',workspace_id:'personal_test',action:'add',
  entry:{kind:'income',category:'Maosh',amount:4000000,note:'oylik',date:'2026-11-17'}};
 const state={deleted:false,busy:false,queue:[op],online:true};
 const submissions=[],messages=[],timers=[],refreshes=[];
 const context={
  state,initData:'signed',navigator:{onLine:true},document:{visibilityState:'visible'},
  request:async(path,options)=>{submissions.push(options.body.op_id);if(fail)throw Object.assign(new Error('temporary outage'),{status:503});return {ok:true};},
  alertMessage:msg=>messages.push(msg),noteStatus:()=>{},render:()=>{},save:()=>{},
  fetchWorkspaces:async()=>refreshes.push('workspaces'),fetchLedger:async()=>refreshes.push('ledger'),fetchMonthHistory:async()=>refreshes.push('months'),
  pull:()=>{},setTimeout:(fn,ms)=>{timers.push({fn,ms});return 1;},clearTimeout:()=>{}
 };
 const scriptlets='let reconnectTimer=null,reconnectDelay=2500;\n'+retry+'\n'+flush+'\n({flush})';
 const api=vm.runInNewContext(scriptlets,context);
 return {api,state,op,submissions,messages,timers,refreshes};
}
test('Transient POST failure retains the same queued operation and schedules an automatic retry',async()=>{
 const x=runner(true);
 await x.api.flush();
 assert.equal(x.state.queue.length,1);
 assert.equal(x.state.queue[0],x.op);
 assert.equal(x.state.queue[0].op_id,'web_fixed_retry_uuid');
 assert.equal(x.state.online,false);
 assert.deepEqual(x.submissions,['web_fixed_retry_uuid']);
 assert.equal(x.timers.length,1);
 assert.ok(x.timers[0].ms>=2500);
 assert.ok(x.messages.some(t=>t.includes('Avtomatik qayta yuborish')));
});
test('Successful POST removes only the acknowledged operation',async()=>{
 const x=runner(false);
 await x.api.flush();
 assert.equal(x.state.queue.length,0);
 assert.deepEqual(x.submissions,['web_fixed_retry_uuid']);
 assert.equal(x.state.online,true);
 assert.equal(x.timers.length,0);
});
test('No false online success while pending write failed and a recovery is scheduled',()=>{
 assert.match(script,/if\(state\.queue\.length&&!state\.online\)/);
 assert.match(script,/if\(recoverable\)scheduleReconnect\(\)/);
 assert.match(script,/AbortSignal\.timeout\(\(options\.method\|\|'GET'\)==='GET'\?30000:45000\)/);
});
test('Manual retry button only appears for pending writes and has a real handler',()=>{
 assert.match(html,/id="retry-sync"/);
 assert.match(script,/\$\('retry-sync'\)\.classList\.toggle\('hidden',!state\.queue\.length\)/);
 assert.match(script,/\$\('retry-sync'\)\.onclick=/);
 assert.match(script,/localStorage\.setItem\(QUEUE_KEY,JSON\.stringify\(state\.queue\)\)/);
});

test('Initial pull flushes queued writes without duplicate refresh',async()=>{const x=runner(false);await x.api.flush({refresh:false});assert.equal(x.state.queue.length,0);assert.deepEqual(x.refreshes,[]);});
