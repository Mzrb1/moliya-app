'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {requestRoute}=require('../request-route.cjs');
test('Mini App GET endpoint does not fall into Telegram-only 404',()=>{
 assert.equal(requestRoute('GET','/api/v1/workspaces'),'api');
 assert.equal(requestRoute('GET','/api/v1/ledger?workspace=abc&month=2026-11'),'api');
});
test('Telegram Mini App OPTIONS preflight gets API route',()=>{
 assert.equal(requestRoute('OPTIONS','/api/v1/workspaces'),'api');
 assert.equal(requestRoute('OPTIONS','/api/v1/op'),'api');
});
test('Mini App POST operation gets API route',()=>{
 assert.equal(requestRoute('POST','/api/v1/op'),'api');
});
test('Telegram webhook and health remain independent',()=>{
 assert.equal(requestRoute('POST','/telegram/webhook'),'telegram');
 assert.equal(requestRoute('GET','/health'),'health');
 assert.equal(requestRoute('GET','/telegram/webhook'),'not_found');
 assert.equal(requestRoute('POST','/unknown'),'not_found');
});
