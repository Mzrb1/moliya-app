'use strict';
// Delete ALL account-owned finance records, including closed workspaces and
// logical recovery copies, inside one transaction. No automatic operation calls this.
const CONFIRM='HAMMASINI OCHIR';
async function erase(db,uid,body){
 if(!body||body.confirm!==CONFIRM||String(body.telegram_id||'')!==String(uid))
  throw Error('Barcha ma’lumotlarni o‘chirish tasdiqlanmagan');
 const expected=body.workspace_count;
 if(!Number.isSafeInteger(expected)||expected<1||expected>1000)
  throw Error('Hisoblar sonini tasdiqlang');
 const q=await db.execute({sql:'SELECT COUNT(*) AS n FROM mn_workspaces WHERE uid=?',args:[String(uid)]});
 const total=Number(q.rows[0].n);
 if(total!==expected)throw Error('Hisoblar soni o‘zgargan. Avval sahifani yangilang');
 const steps=[
  {sql:'DELETE FROM mn_month_reset_budget WHERE reset_id IN (SELECT id FROM mn_month_reset_meta WHERE uid=?)',args:[uid]},
  {sql:'DELETE FROM mn_month_reset_tx WHERE uid=?',args:[uid]},
  {sql:'DELETE FROM mn_month_reset_meta WHERE uid=?',args:[uid]},
  {sql:'DELETE FROM mn_budgets WHERE workspace_id IN (SELECT id FROM mn_workspaces WHERE uid=?)',args:[uid]},
  {sql:'DELETE FROM mn_extra_categories WHERE workspace_id IN (SELECT id FROM mn_workspaces WHERE uid=?)',args:[uid]},
  {sql:'DELETE FROM mn_keyword_aliases WHERE workspace_id IN (SELECT id FROM mn_workspaces WHERE uid=?)',args:[uid]},
  {sql:'DELETE FROM mn_closed_months WHERE uid=?',args:[uid]},
  {sql:'DELETE FROM mn_workspace_archive WHERE uid=?',args:[uid]},
  {sql:'DELETE FROM mn_processed_lists WHERE uid=?',args:[uid]},
  {sql:'DELETE FROM mn_import_rows WHERE uid=?',args:[uid]},
  {sql:'DELETE FROM mn_api_ops WHERE uid=?',args:[uid]},
  {sql:'DELETE FROM mn_transactions WHERE uid=?',args:[uid]},
  {sql:'DELETE FROM mn_user_backups WHERE uid=?',args:[uid]},
  {sql:'DELETE FROM mn_user_profiles WHERE uid=?',args:[uid]},
  {sql:'DELETE FROM mn_manual_grants WHERE uid=?',args:[uid]},
  {sql:'DELETE FROM mn_workspaces WHERE uid=?',args:[uid]},
  {sql:'DELETE FROM mn_early_access WHERE uid=?',args:[uid]},
  {sql:'DELETE FROM mn_users WHERE uid=?',args:[uid]}
 ];
 // New community tables are optional in fixtures and older databases.
 const tables=await db.execute({sql:"SELECT name FROM sqlite_master WHERE type='table' AND name IN ('mn_notice_prefs','mn_notice_drafts','mn_notice_outbox','mn_workspace_allocation')"});
 const available=new Set(tables.rows.map(x=>String(x.name)));
 if(available.has('mn_workspace_allocation'))steps.unshift({sql:'DELETE FROM mn_workspace_allocation WHERE uid=?',args:[uid]});
 if(available.has('mn_notice_outbox')){
  steps.unshift({sql:'DELETE FROM mn_notice_outbox WHERE target=?',args:['u:'+uid]});
  if(available.has('mn_notice_drafts'))steps.unshift({sql:'DELETE FROM mn_notice_outbox WHERE notice_id IN (SELECT id FROM mn_notice_drafts WHERE admin_uid=?)',args:[uid]});
 }
 if(available.has('mn_notice_drafts'))steps.unshift({sql:'DELETE FROM mn_notice_drafts WHERE admin_uid=?',args:[uid]});
 if(available.has('mn_notice_prefs'))steps.unshift({sql:'DELETE FROM mn_notice_prefs WHERE uid=?',args:[uid]});
 await db.batch(steps,'write');
 return {deleted:true,deleted_workspaces:total};
}
module.exports={CONFIRM,erase};
