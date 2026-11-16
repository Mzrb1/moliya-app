'use strict';
// The advertised deadline is 2026-11-30 23:59:59 Asia/Tashkent (UTC+05:00).
// Exclusive UTC cutoff: 2026-11-30 19:00:00Z.
const DEADLINE_UTC='2026-11-30T19:00:00.000Z';
const CUTOFF_MS=Date.parse(DEADLINE_UTC);
function eligibleAt(now=new Date()){
 const ms=now instanceof Date?now.getTime():Date.parse(now);
 if(!Number.isFinite(ms))throw Error('Invalid enrollment timestamp');
 return ms<CUTOFF_MS;
}
async function initEarlyAccess(db,now=new Date()){
 const timestamp=now.toISOString();
 await db.execute({sql:"CREATE TABLE IF NOT EXISTS mn_early_access(uid TEXT PRIMARY KEY,first_seen TEXT NOT NULL,free_forever INTEGER NOT NULL CHECK(free_forever IN (0,1)),reason TEXT NOT NULL CHECK(reason IN ('legacy','early','standard')))"});
 // Every user registered before this feature went live keeps the promised benefit.
 // Missing rows for pre-existing mn_users are migrated once, idempotently.
 await db.execute({sql:"INSERT OR IGNORE INTO mn_early_access(uid,first_seen,free_forever,reason) SELECT uid,?,1,'legacy' FROM mn_users",
   args:[timestamp]});
}
async function register(db,uid,now=new Date()){
 const timestamp=now.toISOString(),free=eligibleAt(now);
 await db.execute({sql:"INSERT OR IGNORE INTO mn_early_access(uid,first_seen,free_forever,reason) VALUES(?,?,?,?)",
  args:[String(uid),timestamp,free?1:0,free?'early':'standard']});
}
async function status(db,uid){
 const r=await db.execute({sql:'SELECT first_seen,free_forever,reason FROM mn_early_access WHERE uid=?',args:[String(uid)]});
 if(!r.rows.length)return null;
 return {first_seen:String(r.rows[0].first_seen),free_forever:Number(r.rows[0].free_forever)===1,
  reason:String(r.rows[0].reason),deadline:'2026-11-30',timezone:'Asia/Tashkent'};
}
module.exports={DEADLINE_UTC,eligibleAt,initEarlyAccess,register,status};
