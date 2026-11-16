'use strict';
// Encrypted, bounded daily *logical recovery copies* in Turso.
// These are not independent/off-site disaster recovery backups.
const {randomBytes,createCipheriv,createDecipheriv,createHash}=require('node:crypto');
const {status:earlyStatus}=require('./early-access.cjs');
const DAYS=30,MAX_BYTES=2*1024*1024;
const TABLES=[
 ['mn_users',"SELECT uid,active FROM mn_users WHERE uid=?"],
 ['mn_early_access',"SELECT uid,first_seen,free_forever,reason FROM mn_early_access WHERE uid=?"],
 ['mn_workspaces',"SELECT id,uid,kind,name,created FROM mn_workspaces WHERE uid=?"],
 ['mn_workspace_archive',"SELECT a.workspace_id,a.uid,a.archived_at FROM mn_workspace_archive a WHERE a.uid=?"],
 ['mn_transactions',"SELECT id,uid,workspace_id,update_id,kind,category,amount,note,day,created FROM mn_transactions WHERE uid=?"],
 ['mn_budgets',"SELECT b.workspace_id,b.month,b.category,b.limit_amount FROM mn_budgets b JOIN mn_workspaces w ON w.id=b.workspace_id WHERE w.uid=?"],
 ['mn_extra_categories',"SELECT x.workspace_id,x.kind,x.name FROM mn_extra_categories x JOIN mn_workspaces w ON w.id=x.workspace_id WHERE w.uid=?"],
 ['mn_keyword_aliases',"SELECT x.workspace_id,x.kind,x.category,x.word FROM mn_keyword_aliases x JOIN mn_workspaces w ON w.id=x.workspace_id WHERE w.uid=?"],
 ['mn_closed_months',"SELECT workspace_id,uid,month,closed_at FROM mn_closed_months WHERE uid=?"],
 ['mn_month_reset_meta',"SELECT id,uid,workspace_id,month,created,restored_at FROM mn_month_reset_meta WHERE uid=?"],
 ['mn_month_reset_tx',"SELECT reset_id,id,uid,workspace_id,update_id,kind,category,amount,note,day,created FROM mn_month_reset_tx WHERE uid=?"],
 ['mn_month_reset_budget',"SELECT b.reset_id,b.workspace_id,b.month,b.category,b.limit_amount FROM mn_month_reset_budget b JOIN mn_month_reset_meta m ON b.reset_id=m.id WHERE m.uid=?"],
 ['mn_processed_lists',"SELECT update_id,uid,workspace_id,created FROM mn_processed_lists WHERE uid=?"],
 ['mn_import_rows',"SELECT uid,source_workspace,source_txid,workspace_id,transaction_id FROM mn_import_rows WHERE uid=?"],
 ['mn_api_ops',"SELECT id,uid,workspace_id,kind,created FROM mn_api_ops WHERE uid=?"]
];
function keyFromEnv(raw=process.env.ME_NOTES_BACKUP_KEY_B64){
 if(!raw)return null;
 const key=Buffer.from(raw,'base64');
 if(key.length!==32||key.toString('base64')!==raw)throw Error('ME_NOTES_BACKUP_KEY_B64 must be a canonical 32-byte base64 value');
 return key;
}
async function init(db){
 await db.execute({sql:"CREATE TABLE IF NOT EXISTS mn_user_backups(uid TEXT NOT NULL,day TEXT NOT NULL,created TEXT NOT NULL,payload TEXT NOT NULL,sha256 TEXT NOT NULL,source_first_seen TEXT NOT NULL,PRIMARY KEY(uid,day))"});
}
function pack(payload,key){
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
 const buffer=Buffer.from(payload,'utf8');
 const encrypted=Buffer.concat([cipher.update(buffer),cipher.final()]);
 return JSON.stringify({v:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:encrypted.toString('base64')});
}
function unpack(raw,key){
 const item=JSON.parse(raw);
 if(item.v!==1)throw Error('Backup version unsupported');
 const iv=Buffer.from(item.iv,'base64'),tag=Buffer.from(item.tag,'base64'),data=Buffer.from(item.data,'base64');
 if(iv.length!==12||tag.length!==16||data.length>MAX_BYTES+64)throw Error('Backup metadata invalid');
 const decipher=createDecipheriv('aes-256-gcm',key,iv);decipher.setAuthTag(tag);
 return Buffer.concat([decipher.update(data),decipher.final()]).toString('utf8');
}
async function create(db,uid,{key=keyFromEnv(),now=new Date(),force=false}={}){
 if(!key)throw Error('Backup kaliti sozlanmagan');
 const day=now.toISOString().slice(0,10),created=now.toISOString();
 const membership=await earlyStatus(db,uid);
 if(!membership)return {skipped:'no_user'};
 if(!force){
  const existing=await db.execute({sql:'SELECT day FROM mn_user_backups WHERE uid=? AND day=?',args:[String(uid),day]});
  if(existing.rows.length)return {skipped:'already_exists',day};
 }
 // Read batches use a consistent database snapshot; never store plaintext financial data.
 const res=await db.batch(TABLES.map(([,sql])=>({sql,args:[String(uid)]})),'read');
 const tables={};
 res.forEach((data,i)=>{
  tables[TABLES[i][0]]=data.rows.map(row=>Object.fromEntries(data.columns.map((col,n)=>[col,row[n]])));
 });
 const raw=JSON.stringify({format:'me-notes-recovery-v1',uid:String(uid),created,tables});
 if(Buffer.byteLength(raw,'utf8')>MAX_BYTES)throw Error('Backup maksimal hajmdan oshdi. Tashqi zaxira kerak');
 const sha=createHash('sha256').update(raw).digest('hex');
 const encrypted=pack(raw,key);
 // If the user deleted their profile while this snapshot was being read, do not
 // re-introduce their financial information into the backup table.
 const write=await db.execute({sql:"INSERT INTO mn_user_backups(uid,day,created,payload,sha256,source_first_seen) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM mn_early_access WHERE uid=? AND first_seen=?) ON CONFLICT(uid,day) DO UPDATE SET created=excluded.created,payload=excluded.payload,sha256=excluded.sha256,source_first_seen=excluded.source_first_seen",
  args:[String(uid),day,created,encrypted,sha,membership.first_seen,String(uid),membership.first_seen]});
 return write.rowsAffected?{day,created,sha256:sha,bytes:Buffer.byteLength(raw)}:{skipped:'deleted'};
}
async function list(db,uid){
 const result=await db.execute({sql:'SELECT day,created,sha256 FROM mn_user_backups WHERE uid=? ORDER BY day DESC LIMIT 40',args:[String(uid)]});
 return result.rows.map(r=>({day:String(r.day),created:String(r.created),sha256:String(r.sha256)}));
}
async function exportBackup(db,uid,day,{key=keyFromEnv()}={}){
 if(!key)throw Error('Backup kaliti sozlanmagan');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day))throw Error('Backup sanasi noto‘g‘ri');
 const result=await db.execute({sql:'SELECT payload,sha256 FROM mn_user_backups WHERE uid=? AND day=?',args:[String(uid),day]});
 if(!result.rows.length)throw Error('Tanlangan kun zaxirasi topilmadi');
 const raw=unpack(String(result.rows[0].payload),key);
 const digest=createHash('sha256').update(raw).digest('hex');
 if(digest!==String(result.rows[0].sha256))throw Error('Backup nazorat summasi mos kelmadi');
 const backup=JSON.parse(raw);
 if(backup.uid!==String(uid)||backup.format!=='me-notes-recovery-v1')throw Error('Backup egasi yoki formati noto‘g‘ri');
 return backup;
}
async function sweep(db,{key=keyFromEnv(),now=new Date(),limit=10000}={}){
 if(!key)return {disabled:true,reason:'key_not_set'};
 const cutoff=new Date(now.getTime()-DAYS*86400000).toISOString().slice(0,10);
 await db.execute({sql:'DELETE FROM mn_user_backups WHERE day<?',args:[cutoff]});
 let cursor='',created=0,skipped=0,failed=0,processed=0;
 while(processed<limit){
  const page=await db.execute({sql:"SELECT uid FROM mn_users WHERE uid>? ORDER BY uid LIMIT 50",args:[cursor]});
  if(!page.rows.length)break;
  for(const row of page.rows){
   cursor=String(row.uid);
   try{const result=await create(db,cursor,{key,now});if(result.skipped)skipped++;else created++;}
   catch(e){failed++;console.error('ME Notes backup user failed:',String(e.message).slice(0,100));}
   processed++;
  }
  if(page.rows.length<50)break;
 }
 return {created,skipped,failed,processed};
}
module.exports={DAYS,MAX_BYTES,TABLES,keyFromEnv,init,pack,unpack,create,list,exportBackup,sweep};
