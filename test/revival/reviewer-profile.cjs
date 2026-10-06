"use strict";
process.env.LT_REVIVAL_TEST='1';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const core=path.resolve(__dirname,'../../deploy/core'),policy=require(core+'/proof-policy.cjs'),profile=require(core+'/revival-assistant-profile.cjs'),loader=require(core+'/revival-preview-files.cjs');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'lt-reviewer-profile-')),legacy=path.join(policy.user,'assistant'),originalDirectory=profile.directory;
profile.directory=input=>originalDirectory(input,{test:false,localAppData:temporary});
const migrated=profile.directory(legacy),base=path.join(migrated,'reviewer-fixtures'),fixture=path.join(base,crypto.randomUUID()),entry=path.join(fixture,'index.html'),checks=[];
fs.mkdirSync(fixture,{recursive:true});fs.writeFileSync(entry,'<h1>Reviewer fixture from migrated profile</h1>');policy.grantDirectory(fixture);
function check(name,fn){fn();checks.push(name);}
try{
 check('An internal reviewer fixture uses the actual migrated assistant profile without opening it as a user project',()=>{const prepared=loader.prepare({path:entry,[loader.reviewerFixtureRoot]:fixture},'lt-preview://migrated-reviewer');assert.equal(prepared.root,fixture);assert.match(prepared.html,/migrated profile/);});
 check('A renderer string field cannot authorize an internal reviewer fixture',()=>assert.throws(()=>loader.prepare({path:entry,reviewerFixtureRoot:fixture},'lt-preview://rejected'),/Open the containing folder/));
 check('A granted sibling directory cannot become a reviewer fixture',()=>{const sibling=path.join(migrated,'reviewer-fixtures-other',crypto.randomUUID());fs.mkdirSync(sibling,{recursive:true});const file=path.join(sibling,'index.html');fs.writeFileSync(file,'Sibling');policy.grantDirectory(sibling);assert.throws(()=>loader.prepare({path:file,[loader.reviewerFixtureRoot]:sibling},'lt-preview://rejected'),/Invalid internal reviewer fixture root/);});
 check('An entry outside its authorized fixture cannot use the fixture override',()=>{const other=path.join(base,crypto.randomUUID());fs.mkdirSync(other);const file=path.join(other,'index.html');fs.writeFileSync(file,'Other fixture');policy.grantDirectory(other);assert.throws(()=>loader.prepare({path:file,[loader.reviewerFixtureRoot]:fixture},'lt-preview://rejected'),/Invalid internal reviewer fixture root/);});
 check('Nested source and resource paths retain fixture containment',()=>{const prepared=loader.prepare({path:entry,[loader.reviewerFixtureRoot]:fixture},'lt-preview://migrated-reviewer');assert.throws(()=>prepared.read(path.join(migrated,'settings.json')),/leaves the project/);assert.throws(()=>prepared.fromURL('lt-preview://migrated-reviewer/%2f..%2f../settings.json'));});
 console.log(JSON.stringify({passed:true,checks},null,2));
}finally{profile.directory=originalDirectory;const resolved=fs.realpathSync(temporary);assert.equal(path.dirname(resolved),fs.realpathSync(os.tmpdir()));assert(path.basename(resolved).startsWith('lt-reviewer-profile-'));fs.rmSync(resolved,{recursive:true});}
