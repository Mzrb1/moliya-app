'use strict';
const {createHash,randomUUID}=require('node:crypto');
const F=require('../me-notes-sahifalab/finance-core.js');
const {validateInitData}=require('./miniapp-auth.cjs');

const ORIGIN='https://me-notes-sahifalab.onrender.com';
const MAX_LIST=20;
function validId(x){return typeof x==='string'&&/^[a-zA-Z0-9:_-]{8,96}$/.test(x);}
function validMonth(s){return F.validMonth(s);}
function nextMonth(s){const [y,m]=s.split('-').map(Number);return (m===12?y+1:y)+'-'+String(m===12?1:m+1).padStart(2,'0');}
function updateId(opId,index){
 const hash=createHash('sha256').update(opId+':'+index).digest();
 return 1000000000000+hash.readUIntBE(0,6);
}
function positiveAmount(x){return F.amount(x);}
function prepareEntries(entries,kind){
 if(!Array.isArray(entries)||!entries.length||entries.length>MAX_LIST)throw Error('Bir amalda 1–20 ta yozuv bo‘lsin');
 return entries.map((x)=>{
  if(!x||!['expense','income'].includes(x.kind))throw Error('Yozuv turi noto‘g‘ri');
  const date=x.date;
  if(!F.validDay(date))throw Error('Yozuv sanasi noto‘g‘ri');
  const note=String(x.note||'').trim().slice(0,160);
  if(!note)throw Error('Izoh majburiy');
  const category=String(x.category||F.categoryFor({kind,categories:F.BASE[kind]},x.kind,note)).slice(0,80);
  if(!F.BASE[kind][x.kind].includes(category))throw Error('Kategoriya noto‘g‘ri: '+category);
  return {kind:x.kind,amount:positiveAmount(x.amount),date,category,note};
 });
}
function json(res,status,data,headers={}){
 res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...headers});
 res.end(JSON.stringify(data));
}
async function readJson(req){
 let body='',size=0;
 for await(const chunk of req){
  size+=chunk.length;
  if(size>40000)throw Error('Xabar juda katta');
  body+=chunk;
 }
 return JSON.parse(body);
}
function respondError(res,e,headers){
 const isAuth=e.status===401||e.status===403;
 const status=e.status||(e.message.includes('UNIQUE')?409:400);
 json(res,status,{ok:false,error:isAuth?'Telegram Mini App orqali qayta kiring':String(e.message||'Xato').slice(0,180)},headers);
}
function forbidden(message,status=403){const e=new Error(message);e.status=status;return e;}
function makeFinanceApi({db,botToken,ensure}){
 const sendCors={'access-control-allow-origin':ORIGIN,'vary':'Origin','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'Content-Type,X-Telegram-Init-Data','access-control-max-age':'600'};
 async function init(){
  await db.batch([
  'CREATE TABLE IF NOT EXISTS mn_api_ops (id TEXT PRIMARY KEY,uid TEXT NOT NULL,workspace_id TEXT NOT NULL,kind TEXT NOT NULL,created TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS mn_import_rows (uid TEXT NOT NULL,source_workspace TEXT NOT NULL,source_txid TEXT NOT NULL,workspace_id TEXT NOT NULL,transaction_id TEXT NOT NULL,PRIMARY KEY(uid,source_workspace,source_txid))'
 ],'write');
 }
 async function owned(uid,wid){
  const r=await db.execute({sql:'SELECT id,kind,name FROM mn_workspaces WHERE uid=? AND id=?',args:[uid,wid]});
  if(!r.rows.length)throw forbidden('Bu hisobga kirishga ruxsat yo‘q');
  return r.rows[0];
 }
 async function workspaces(uid){
  const [ws,user]=await Promise.all([
   db.execute({sql:'SELECT id,kind,name FROM mn_workspaces WHERE uid=? ORDER BY created,id',args:[uid]}),
   db.execute({sql:'SELECT active FROM mn_users WHERE uid=?',args:[uid]})
  ]);
  return {workspaces:ws.rows.map(w=>({id:w.id,kind:w.kind,name:w.name})),active:user.rows[0]?.active||null};
 }
 async function ledger(uid,wid,month){
  const w=await owned(uid,wid);
  if(!validMonth(month))throw Error('Hisobot oyi noto‘g‘ri');
  const [rows,bs]=await Promise.all([
   db.execute({sql:'SELECT id,kind,category,amount,note,day FROM mn_transactions WHERE uid=? AND workspace_id=? AND day>=? AND day<? ORDER BY day DESC,rowid DESC LIMIT 1500',
    args:[uid,wid,month+'-01',nextMonth(month)+'-01']}),
   db.execute({sql:'SELECT category,limit_amount FROM mn_budgets WHERE workspace_id=? AND month=?',args:[wid,month]})
  ]);
  const transactions=rows.rows.map(r=>({id:String(r.id),kind:r.kind,category:String(r.category),amount:Number(r.amount),note:String(r.note||''),date:String(r.day)}));
  const budgets=Object.fromEntries(bs.rows.map(r=>[String(r.category),Number(r.limit_amount)]));
  const shadow={kind:w.kind,categories:F.BASE[w.kind],budgets:{[month]:budgets},transactions};
  const summary=F.summary(shadow,month);
  const plan=F.salaryAllocation(shadow,month);
  return {workspace:{id:w.id,kind:w.kind,name:w.name},month,transactions,more:transactions.length===1500,
    totals:{income:summary.income,expense:summary.expense,net:summary.net},categories:summary.budgets,budgets,plan};
 }
 async function execute(uid,body){
  const opId=body?.op_id,wid=body?.workspace_id,action=body?.action;
  if(!validId(opId)||typeof wid!=='string'||wid.length>128)throw Error('Amal ID yoki hisob noto‘g‘ri');
  if(!['add','add_many','budget','delete','switch','new_workspace','import'].includes(action))throw Error('Amal turi noto‘g‘ri');
  const previous=await db.execute({sql:'SELECT uid FROM mn_api_ops WHERE id=?',args:[opId]});
  if(previous.rows.length){
   if(previous.rows[0].uid!==uid)throw forbidden('Amal boshqa foydalanuvchiga tegishli');
   return {already:true};
  }
  const w=await owned(uid,wid),now=new Date().toISOString(),steps=[];
  let result={};
  if(action==='add'||action==='add_many'){
   const entries=prepareEntries(action==='add'?[body.entry]:body.entries,w.kind);
   steps.push({sql:'INSERT INTO mn_api_ops(id,uid,workspace_id,kind,created) VALUES(?,?,?,?,?)',args:[opId,uid,wid,action,now]});
   for(let i=0;i<entries.length;i++){
    const x=entries[i];
    steps.push({sql:'INSERT INTO mn_transactions(id,uid,workspace_id,update_id,kind,category,amount,note,day,created) VALUES(?,?,?,?,?,?,?,?,?,?)',
      args:[randomUUID(),uid,wid,updateId(opId,i),x.kind,x.category,x.amount,x.note,x.date,now]});
   }
   result={saved:entries.length};
  }else if(action==='import'){
   const source=body.source_workspace;
   if(typeof source!=='string'||!/^[a-zA-Z0-9:_-]{1,100}$/.test(source))throw Error('Eski hisob manbasi noto‘g‘ri');
   if(body.source_kind!==w.kind)throw Error('Eski va yangi hisob turlari bir xil bo‘lishi shart');
   if(!Array.isArray(body.entries)||!body.entries.length||body.entries.length>20)throw Error('Bir paketda 1–20 ta yozuv');
   const ids=new Set(),entries=body.entries.map(x=>{
    if(!x||typeof x.source_id!=='string'||!/^[a-zA-Z0-9:_-]{1,100}$/.test(x.source_id)||ids.has(x.source_id))throw Error('Eski yozuv ID noto‘g‘ri');
    ids.add(x.source_id);
    const note=String(x.note||'').trim();
    const originalCategory=String(x.category||'').slice(0,80);
    const category=F.BASE[w.kind][x.kind]?.includes(originalCategory)?originalCategory:'Boshqa';
    const transformed={kind:x.kind,date:x.date,amount:x.amount,category,
      note:category!==originalCategory?('['+originalCategory+'] '+note).slice(0,160):(note||originalCategory)};
    return {...prepareEntries([transformed],w.kind)[0],source_id:x.source_id};
   });
   steps.push({sql:'INSERT INTO mn_api_ops(id,uid,workspace_id,kind,created) VALUES(?,?,?,?,?)',args:[opId,uid,wid,action,now]});
   for(const x of entries){
    const transactionId=randomUUID();
    steps.push({sql:'INSERT INTO mn_transactions(id,uid,workspace_id,update_id,kind,category,amount,note,day,created) SELECT ?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM mn_import_rows WHERE uid=? AND source_workspace=? AND source_txid=?)',
      args:[transactionId,uid,wid,updateId('import:'+uid+':'+source+':'+x.source_id,0),x.kind,x.category,x.amount,x.note,x.date,now,uid,source,x.source_id]});
    steps.push({sql:'INSERT OR IGNORE INTO mn_import_rows(uid,source_workspace,source_txid,workspace_id,transaction_id) VALUES(?,?,?,?,?)',
     args:[uid,source,x.source_id,wid,transactionId]});
   }
   result={attempted:entries.length};
  }else if(action==='budget'){
   if(!F.BASE[w.kind].expense.includes(body.category))throw Error('Kategoriya noto‘g‘ri');
   if(!validMonth(body.month))throw Error('Oy noto‘g‘ri');
   const limit=Number(body.limit);
   if(!Number.isSafeInteger(limit)||limit<0||limit>1000000000000)throw Error('Limit noto‘g‘ri');
   steps.push({sql:'INSERT INTO mn_api_ops(id,uid,workspace_id,kind,created) VALUES(?,?,?,?,?)',args:[opId,uid,wid,action,now]});
   if(limit===0)steps.push({sql:'DELETE FROM mn_budgets WHERE workspace_id=? AND month=? AND category=?',args:[wid,body.month,body.category]});
   else steps.push({sql:'INSERT INTO mn_budgets(workspace_id,month,category,limit_amount) VALUES(?,?,?,?) ON CONFLICT(workspace_id,month,category) DO UPDATE SET limit_amount=excluded.limit_amount',args:[wid,body.month,body.category,limit]});
  }else if(action==='delete'){
   if(typeof body.transaction_id!=='string'||body.transaction_id.length>96)throw Error('Yozuv ID noto‘g‘ri');
   steps.push({sql:'INSERT INTO mn_api_ops(id,uid,workspace_id,kind,created) VALUES(?,?,?,?,?)',args:[opId,uid,wid,action,now]});
   steps.push({sql:'DELETE FROM mn_transactions WHERE uid=? AND workspace_id=? AND id=?',args:[uid,wid,body.transaction_id]});
  }else if(action==='switch'){
   steps.push({sql:'INSERT INTO mn_api_ops(id,uid,workspace_id,kind,created) VALUES(?,?,?,?,?)',args:[opId,uid,wid,action,now]});
   steps.push({sql:'UPDATE mn_users SET active=? WHERE uid=?',args:[wid,uid]});
  }else if(action==='new_workspace'){
   const kind=body.new_kind,name=String(body.name||'').trim().slice(0,60);
   if(!F.KINDS[kind])throw Error('Hisob turi noto‘g‘ri');
   const count=await db.execute({sql:'SELECT COUNT(*) AS n FROM mn_workspaces WHERE uid=?',args:[uid]});
   if(Number(count.rows[0].n)>=12)throw Error('12 tadan ortiq hisob ochilmaydi');
   const id=randomUUID();
   steps.push({sql:'INSERT INTO mn_api_ops(id,uid,workspace_id,kind,created) VALUES(?,?,?,?,?)',args:[opId,uid,wid,action,now]});
   steps.push({sql:'INSERT INTO mn_workspaces(id,uid,kind,name,created) VALUES(?,?,?,?,?)',args:[id,uid,kind,name||F.KINDS[kind],now]});
   steps.push({sql:'UPDATE mn_users SET active=? WHERE uid=?',args:[id,uid]});
   result={workspace_id:id};
  }
  try{await db.batch(steps,'write');}
  catch(e){
   const retry=await db.execute({sql:'SELECT uid FROM mn_api_ops WHERE id=?',args:[opId]});
   if(retry.rows.length&&retry.rows[0].uid===uid)return {already:true};
   throw e;
  }
  return result;
 }
 async function handle(req,res){
  const origin=req.headers.origin;
  if(origin&&origin!==ORIGIN){json(res,403,{ok:false,error:'Ruxsat etilmagan sayt'});return true;}
  const headers=sendCors;
  if(req.method==='OPTIONS'){res.writeHead(204,headers);res.end();return true;}
  try{
   let uid;
   try{({uid}=validateInitData(req.headers['x-telegram-init-data'],botToken));}
   catch(e){throw forbidden('Telegram Mini App sessiyasi noto‘g‘ri yoki eskirgan',401);}
   await ensure(uid);
   if(req.method==='GET'&&req.url==='/api/v1/workspaces'){
    json(res,200,{ok:true,...await workspaces(uid)},headers);return true;
   }
   if(req.method==='GET'&&req.url?.startsWith('/api/v1/ledger?')){
    const u=new URL(req.url,'https://localhost');
    const data=await ledger(uid,u.searchParams.get('workspace'),u.searchParams.get('month'));
    json(res,200,{ok:true,...data},headers);return true;
   }
   if(req.method==='POST'&&req.url==='/api/v1/op'){
    const data=await readJson(req);
    const result=await execute(uid,data);
    json(res,200,{ok:true,...result},headers);return true;
   }
   json(res,404,{ok:false,error:'API topilmadi'},headers);return true;
  }catch(e){respondError(res,e,headers);return true;}
 }
 return {init,handle,ledger,execute};
}
module.exports={makeFinanceApi,prepareEntries,updateId,ORIGIN};
