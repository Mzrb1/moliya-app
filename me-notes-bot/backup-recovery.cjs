'use strict';
// Non-destructive merge from a validated, signed-owner encrypted snapshot.
// Keep current values; insert only rows missing since the snapshot was created.
const backup=require('./automatic-backup.cjs');
async function restoreMissing(db,uid,day,body,{key}={}){
 if(body?.confirm!=='TIKLA')throw Error('Tiklash uchun TIKLA deb tasdiqlang');
 const snapshot=await backup.exportBackup(db,uid,day,{key});
 const tables=snapshot.tables;
 const current=await db.execute({sql:'SELECT id FROM mn_workspaces WHERE uid=?',args:[uid]});
 const allowed=new Set(current.rows.map(r=>String(r.id)));
 for(const w of tables.mn_workspaces||[]){
  if(!allowed.has(String(w.id)))throw Error('Zaxiradagi hisob endi mavjud emas. Qo‘lda tiklash talab qilinadi');
 }
 const layouts=[
  ['mn_extra_categories',['workspace_id','kind','name']],
  ['mn_keyword_aliases',['workspace_id','kind','category','word']],
  ['mn_budgets',['workspace_id','month','category','limit_amount']],
  ['mn_workspace_allocation',['workspace_id','uid','enabled','updated_at']],
  ['mn_transactions',['id','uid','workspace_id','update_id','kind','category','amount','note','day','created']]
 ];
 const statements=[];
 for(const [table,cols] of layouts){
  const rows=tables[table]||[];
  if(!Array.isArray(rows))throw Error('Zaxira jadvali noto‘g‘ri');
  for(const row of rows){
   if(!allowed.has(String(row.workspace_id)))throw Error('Boshqa hisobga tiklash mumkin emas');
   if('uid' in row&&String(row.uid)!==String(uid))throw Error('Zaxira egasi mos kelmadi');
   if(cols.some(col=>row[col]===undefined))throw Error('Zaxira maydonlari yetishmayapti');
   statements.push({sql:'INSERT OR IGNORE INTO '+table+'('+cols.join(',')+') VALUES('+cols.map(()=>'?').join(',')+')',
    args:cols.map(col=>row[col])});
  }
 }
 if(statements.length>2500)throw Error('Juda katta tiklash paketi. Qo‘lda zaxira tiklash talab qilinadi');
 if(!statements.length)return {restored:0,checked:0};
 // All inserts commit together or none; current transactions, budgets and categories never overwritten.
 const out=await db.batch(statements,'write');
 return {restored:out.reduce((sum,result)=>sum+Number(result.rowsAffected||0),0),checked:statements.length};
}
module.exports={restoreMissing};
