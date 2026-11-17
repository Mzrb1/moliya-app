'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const bot=fs.readFileSync('me-notes-bot/server.cjs','utf8');
const code=fs.readFileSync('me-notes-bot/entry-undo.cjs','utf8');
test('Each single-message receipt gets a specific callback button, not a slash command link',()=>{
 assert.match(bot,/reply_markup:undo\.singleButton\(savedId\)/);
 assert.match(bot,/const savedId=await undo\.saveSingle/);
 assert.doesNotMatch(bot,/Xato bo‘lsa: \/bekor/);
 assert.match(code,/callback_data:'undo:tx:'\+id/);
 assert.match(code,/WHERE uid=\? AND id=\?/);
});
test('Multi-line confirmation has an exact message update callback',()=>{
 assert.match(bot,/reply_markup:undo\.listButton\(update\.update_id\)/);
 assert.match(code,/callback_data:'undo:list:'\+updateId/);
 assert.match(code,/mn_processed_lists WHERE uid=\? AND update_id=\?/);
});
test('Telegram callback answers, removes one-time button, and retains /bekor legacy behavior',()=>{
 assert.match(bot,/const cancelled=await undo\.fromCallback\(db,uid,cmd\)/);
 assert.match(bot,/editMessageReplyMarkup/);
 assert.match(bot,/reply_markup:\{inline_keyboard:\[\]\}/);
 assert.match(bot,/if\(command==='\/bekor'\)/);
 const legacy=bot.slice(bot.indexOf("if(command==='/bekor')"),bot.indexOf("if(command==='/limit')"));
 assert.match(legacy,/undo\.singleButton\(String\(item\.id\)\)/);
 assert.match(legacy,/undo\.listButton\(source\)/);
 assert.doesNotMatch(legacy,/undo\.one\(|undo\.list\(|DELETE FROM/,'old slash command cannot delete without confirmation');
});
