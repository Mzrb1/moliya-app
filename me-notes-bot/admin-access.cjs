'use strict';
// ME Notes admin displays Telegram IDs/names/entitlements only, never finances.
function validUid(value){
 const str=String(value??'');
 return /^[1-9][0-9]{0,15}$/.test(str)&&Number.isSafeInteger(Number(str));
}
function isAdmin(uid,raw=process.env.ME_NOTES_ADMIN_IDS||''){
 return validUid(uid)&&String(raw).split(/[,\s;]+/).filter(validUid).includes(String(uid));
}
function cleanName(value){
 return String(value||'').replace(/[\u0000-\u001f\u007f-\u009f<>]/g,' ').replace(/\s+/g,' ').trim().slice(0,100);
}
function displayName(user){
 if(!user||typeof user!=='object')return '';
 return cleanName([user.first_name,user.last_name].map(cleanName).filter(Boolean).join(' '));
}
async function init(db){
 await db.batch([
  "CREATE TABLE IF NOT EXISTS mn_user_profiles(uid TEXT PRIMARY KEY,display_name TEXT NOT NULL,updated_at TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS mn_manual_grants(uid TEXT PRIMARY KEY,granted_by TEXT NOT NULL,granted_at TEXT NOT NULL)"
 ],'write');
}
async function capture(db,user){
 const uid=String(user?.id??''),name=displayName(user);
 if(!validUid(uid)||!name)return false;
 await db.execute({sql:"INSERT INTO mn_user_profiles(uid,display_name,updated_at) VALUES(?,?,?) ON CONFLICT(uid) DO UPDATE SET display_name=excluded.display_name,updated_at=excluded.updated_at",
  args:[uid,name,new Date().toISOString()]});
 return true;
}
function nameOf(row){
 return row?.display_name?String(row.display_name):'Ism hali olinmagan';
}
async function inspect(db,uid){
 if(!validUid(uid))throw Error('Telegram ID faqat musbat raqamlardan iborat bo‘lsin');
 const sql="SELECT p.display_name,u.uid AS registered,a.free_forever,a.reason,a.first_seen,"+
   "g.granted_by,g.granted_at FROM (SELECT ? AS uid) x "+
   "LEFT JOIN mn_users u ON u.uid=x.uid "+
   "LEFT JOIN mn_user_profiles p ON p.uid=x.uid "+
   "LEFT JOIN mn_early_access a ON a.uid=x.uid "+
   "LEFT JOIN mn_manual_grants g ON g.uid=x.uid";
 const r=await db.execute({sql,args:[String(uid)]}),x=r.rows[0];
 return {uid:String(uid),name:nameOf(x),registered:!!x.registered,
  free_forever:Number(x.free_forever||0)===1||!!x.granted_at,
  manually_granted:!!x.granted_at,reason:x.granted_at?'admin':String(x.reason||''),
  granted_at:x.granted_at?String(x.granted_at):null,granted_by:x.granted_by?String(x.granted_by):null,
  first_seen:x.first_seen?String(x.first_seen):null};
}
async function grant(db,adminUid,targetUid,now=new Date()){
 if(!validUid(adminUid)||!validUid(targetUid))throw Error('Telegram ID noto‘g‘ri');
 // Reservations for promised users work before /start. Duplicate taps are safe.
 const res=await db.execute({sql:'INSERT OR IGNORE INTO mn_manual_grants(uid,granted_by,granted_at) VALUES(?,?,?)',
  args:[String(targetUid),String(adminUid),now.toISOString()]});
 return {created:Number(res.rowsAffected||0)===1,...await inspect(db,targetUid)};
}
async function stats(db){
 const [users,early,manual]=await Promise.all([
  db.execute({sql:'SELECT COUNT(*) AS n FROM mn_users'}),
  db.execute({sql:'SELECT COUNT(*) AS n FROM mn_early_access WHERE free_forever=1'}),
  db.execute({sql:'SELECT COUNT(*) AS n FROM mn_manual_grants'})
 ]);
 return {users:Number(users.rows[0].n),automatic:Number(early.rows[0].n),manual:Number(manual.rows[0].n)};
}
const LIMIT=10;
async function list(db,kind='users',page=0){
 if(!['users','grants'].includes(kind))throw Error('Ro‘yxat turi noto‘g‘ri');
 if(!Number.isSafeInteger(page)||page<0||page>9999)throw Error('Sahifa noto‘g‘ri');
 const sql=kind==='users'
  ? "SELECT u.uid,COALESCE(p.display_name,'') AS display_name,a.first_seen,a.free_forever,g.granted_at "+
    "FROM mn_users u LEFT JOIN mn_user_profiles p ON p.uid=u.uid "+
    "LEFT JOIN mn_early_access a ON a.uid=u.uid LEFT JOIN mn_manual_grants g ON g.uid=u.uid "+
    "ORDER BY COALESCE(a.first_seen,'') DESC,u.uid DESC LIMIT ? OFFSET ?"
  : "SELECT g.uid,COALESCE(p.display_name,'') AS display_name,g.granted_at,g.granted_by,u.uid AS registered "+
    "FROM mn_manual_grants g LEFT JOIN mn_user_profiles p ON p.uid=g.uid "+
    "LEFT JOIN mn_users u ON u.uid=g.uid "+
    "ORDER BY g.granted_at DESC,g.uid DESC LIMIT ? OFFSET ?";
 const result=await db.execute({sql,args:[LIMIT+1,page*LIMIT]}),more=result.rows.length>LIMIT;
 const entries=result.rows.slice(0,LIMIT).map(r=>({
  uid:String(r.uid),name:nameOf(r),
  registered:kind==='users'?true:!!r.registered,
  free_forever:Number(r.free_forever||0)===1||!!r.granted_at,
  manually_granted:!!r.granted_at,
  first_seen:r.first_seen?String(r.first_seen):null,
  granted_at:r.granted_at?String(r.granted_at):null
 }));
 return {kind,page,more,entries};
}
module.exports={validUid,isAdmin,cleanName,displayName,init,capture,inspect,grant,stats,list};
