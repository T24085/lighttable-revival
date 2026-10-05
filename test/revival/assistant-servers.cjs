'use strict';
const assert=require('node:assert/strict'),registry=require('../../deploy/core/revival-assistant-servers.cjs');
const shared={pid:42},different={pid:43};
const first=registry.register('test-owner','server',shared);assert.equal(registry.server('test-owner','server'),shared);
const replacement=registry.register('test-owner','server',shared);first();assert.equal(registry.server('test-owner','server'),shared);
const newest=registry.register('test-owner','server',different);replacement();assert.equal(registry.server('test-owner','server'),different);
const unrelated=registry.register('other-owner','server',shared);newest();assert.equal(registry.server('test-owner','server'),null);assert.equal(registry.server('other-owner','server'),shared);
unrelated();assert.equal(registry.server('other-owner','server'),null);
console.log(JSON.stringify({passed:true,checks:5,scenario:'Late unregister preserves replacement registrations, including reused provider objects and unrelated owners'}));
