'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const h=fs.readFileSync('me-notes-sahifalab/finance-unified.html','utf8');
const js=fs.readFileSync('me-notes-sahifalab/finance-unified.js','utf8');
const api=fs.readFileSync('me-notes-bot/miniapp-api.cjs','utf8');
const backup=fs.readFileSync('me-notes-bot/automatic-backup.cjs','utf8');
const restore=fs.readFileSync('me-notes-bot/backup-recovery.cjs','utf8');
const erase=fs.readFileSync('me-notes-bot/account-erasure.cjs','utf8');
test('Budget controls allocation separately for the selected active workspace',()=>{
 assert.match(h,/id="allocation-toggle"/);
 assert.match(h,/id="allocation-scope"/);
 assert.match(js,/op\.workspace_id!==w\.id/);
 assert.match(js,/op\.action==='allocation_toggle'/);
 assert.match(js,/allocation_enabled:data\.allocation_enabled/);
 assert.match(js,/enqueue\(\{action:'allocation_toggle',enabled:!enabled\}\)/);
 assert.match(js,/if\(!enabled\)return;/);
});
test('Owner-scoped allocation toggle is persisted with no edits to actual transactions',()=>{
 assert.match(api,/CREATE TABLE IF NOT EXISTS mn_workspace_allocation/);
 assert.match(api,/SELECT enabled FROM mn_workspace_allocation WHERE uid=\? AND workspace_id=\?/);
 assert.match(api,/action==='allocation_toggle'/);
 assert.match(api,/typeof body\.enabled!=='boolean'/);
 assert.match(api,/ON CONFLICT\(workspace_id\) DO UPDATE SET enabled=excluded\.enabled/);
 const toggle=api.slice(api.indexOf("}else if(action==='allocation_toggle')"),api.indexOf("}else if(action==='budget')"));
 assert.doesNotMatch(toggle,/mn_transactions|mn_budgets|DELETE/);
});
test('Encrypted backup, recovery and full erasure handle workspace setting as owned data',()=>{
 assert.match(backup,/\['mn_workspace_allocation'/);
 assert.match(restore,/\['mn_workspace_allocation'/);
 assert.match(erase,/DELETE FROM mn_workspace_allocation WHERE uid=\?/);
});
