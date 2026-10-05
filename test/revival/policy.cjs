'use strict';
process.env.LT_REVIVAL_TEST='1';
const assert=require('assert/strict'),fs=require('fs'),path=require('path');
const p=require('../../deploy/core/proof-policy.cjs');
let checks=0;function check(fn){fn();checks++;}
check(()=>assert.equal(p.calculate('(12 + 30)').result,42));
check(()=>assert.equal(p.calculate('(12 + 31)').result,43));
check(()=>assert.notEqual(p.calculate('(12 + 30)').sha256,p.calculate('(12 + 31)').sha256));
for(const source of ['process.exit()','require("fs")','globalThis.x=1','fetch("https://example.com")','1;2','1/*comment*/+2','2**1000000','1/0','("x")','1'.repeat(257)])check(()=>assert.throws(()=>p.calculate(source)));
check(()=>assert.throws(()=>p.operation('read',['C:\\Windows\\win.ini'])));
check(()=>assert.throws(()=>p.operation('write',[path.join(p.root,'proof-files','calculation.js'),'bad'])));
check(()=>assert.throws(()=>p.operation('write',[path.join(p.root,'proof-user','User','user.behaviors'),'bad'])));
check(()=>assert.throws(()=>p.operation('write',[path.join(p.deploy,'core','main.js'),'bad'])));
check(()=>assert.throws(()=>p.operation('write',[path.join(p.docs,'..','escape.js'),'bad'])));
check(()=>assert.throws(()=>p.operation('shell',['echo nope'])));
check(()=>{const target=path.join(p.docs,'bridge-test.txt');p.operation('write',[target,'verified']);assert.equal(p.operation('read',[target]),'verified');});
for(const source of ['while(true){}','for(;;){}','Promise.resolve(1)','setTimeout(()=>1,0)','async()=>1','Object.prototype.x=1','globalThis','this.constructor.constructor("return process")()','[].constructor','({}).__proto__','fetch(1)','process.mainModule','import("fs")','1\\u003b2','1e999','NaN','Infinity','1//hi','1/*','1..toString()'])check(()=>assert.throws(()=>p.calculate(source)));
check(()=>assert.throws(()=>p.calculate('(1 +')));
check(()=>assert.equal(p.calculate('2 * (3 + 4)').result,14));
check(()=>assert.equal(p.calculate('-5 + 2').result,-3));
check(()=>assert.equal(p.calculate('7 % 3').result,1));
check(()=>assert.equal(p.calculate('0.5 + .25').result,.75));
const selected=path.join(p.root,'selected-file-test');fs.mkdirSync(selected,{recursive:true});const chosen=path.join(selected,'chosen.js');fs.writeFileSync(chosen,'40+2');
check(()=>assert.throws(()=>p.operation('read',[chosen])));
check(()=>{p.grantFile(chosen);assert.equal(p.operation('read',[chosen]),'40+2');p.operation('write',[chosen,'41+2']);assert.equal(fs.readFileSync(chosen,'utf8'),'41+2');});
check(()=>assert.throws(()=>p.operation('read',[path.join(selected,'sibling.js')])));
check(()=>assert.throws(()=>p.operation('grant-file',[path.join(selected,'sibling.js')])));
check(()=>{const saved=path.join(selected,'new.js');p.grantFile(saved);p.operation('write',[saved,'42']);assert.equal(fs.readFileSync(saved,'utf8'),'42');});
check(()=>{const folder=path.join(selected,'project');fs.mkdirSync(folder,{recursive:true});p.grantDirectory(folder);p.operation('write',[path.join(folder,'report.js'),'42']);assert.equal(p.operation('read',[path.join(folder,'report.js')]),'42');assert.throws(()=>p.operation('write',[path.join(folder,'..','escape.js'),'bad']));});
check(()=>{const link=path.join(p.docs,'policy-test-junction');if(fs.existsSync(link))fs.unlinkSync(link);fs.symlinkSync(selected,link,'junction');try{assert.throws(()=>p.operation('read',[path.join(link,'chosen.js')]));assert.throws(()=>p.grantDirectory(link));}finally{fs.unlinkSync(link);}});
check(()=>assert.deepEqual(p.fingerprints([path.join(p.docs,'bridge-test.txt'),path.join(p.docs,'missing-snapshot.txt')]),[require('crypto').createHash('sha256').update('verified').digest('hex'),null]));
check(()=>assert.throws(()=>p.fingerprints([path.join(p.root,'outside-snapshot.txt')])));
check(()=>assert.throws(()=>p.fingerprints(Array(545).fill(chosen))));
check(()=>{const file=path.join(p.docs,'large-snapshot.txt');fs.writeFileSync(file,' '.repeat(2*1024*1024+1));assert.throws(()=>p.fingerprints([file]),/2 MiB/);});
const writeLimit=8*1024*1024,writeRoot=fs.mkdtempSync(path.join(p.docs,'policy-write-boundary-')),writeFiles=[];
const ownedFile=name=>{const file=path.join(writeRoot,name);writeFiles.push(file);return file;};
// The real target changes after an actual staged write, before the real commit.
function changeDuringStage(change,verify){const nativeWrite=fs.writeFileSync;let changed=false;fs.writeFileSync=(file,...args)=>{const result=nativeWrite(file,...args);if(typeof file==='number'&&!changed){changed=true;change(nativeWrite);}return result;};try{verify();assert(changed);}finally{fs.writeFileSync=nativeWrite;}}
const noSaveStages=()=>assert.equal(fs.readdirSync(writeRoot).filter(name=>name.startsWith('.lt-save-')).length,0);
try{
 const large=ownedFile('legitimate.txt');
 check(()=>{const source='x'.repeat(65537);p.operation('write',[large,source]);assert.equal(p.operation('read',[large]),source);});
 check(()=>{const source='A'.repeat(writeLimit);p.operation('write',[large,source]);assert.equal(fs.statSync(large).size,writeLimit);assert.equal(p.operation('read',[large]),source);});
 check(()=>{const before=fs.readFileSync(large);assert.throws(()=>p.operation('write',[large,'B'.repeat(writeLimit+1)]),/8 MiB/);assert(fs.readFileSync(large).equals(before));});
 const unicode=ownedFile('utf8.txt');
 check(()=>{const source='\ud83d\ude00'.repeat(writeLimit/4);assert.equal(Buffer.byteLength(source,'utf8'),writeLimit);p.operation('write',[unicode,source]);assert.equal(p.operation('read',[unicode]),source);assert.equal(fs.statSync(unicode).size,writeLimit);});
 check(()=>{const before=fs.readFileSync(unicode),source='\u00e9'.repeat(writeLimit/2+1);assert(source.length<writeLimit);assert.equal(Buffer.byteLength(source,'utf8'),writeLimit+2);assert.throws(()=>p.operation('write',[unicode,source]),/8 MiB/);assert(fs.readFileSync(unicode).equals(before));});
 const appended=ownedFile('appended.txt');
 check(()=>{p.operation('write',[appended,'x'.repeat(writeLimit-4)]);p.operation('append',[appended,'\ud83d\ude00']);assert.equal(fs.statSync(appended).size,writeLimit);assert.equal(p.operation('read',[appended]),'x'.repeat(writeLimit-4)+'\ud83d\ude00');});
 check(()=>{const before=fs.readFileSync(appended);assert.throws(()=>p.operation('append',[appended,'\u00e9']),/8 MiB/);assert(fs.readFileSync(appended).equals(before));});
 const appendExact=ownedFile('append-exact.txt');
 check(()=>{const source='C'.repeat(writeLimit);p.operation('append',[appendExact,source]);assert.equal(p.operation('read',[appendExact]),source);});
 check(()=>{const before=fs.readFileSync(appendExact);assert.throws(()=>p.operation('append',[appendExact,'D'.repeat(writeLimit+1)]),/8 MiB/);assert(fs.readFileSync(appendExact).equals(before));});
 const partial=ownedFile('partial.txt');fs.writeFileSync(partial,'Existing file remains exact.');
 check(()=>{const before=fs.readFileSync(partial),originalWrite=fs.writeFileSync;fs.writeFileSync=(file,...args)=>{if(typeof file==='number'){fs.writeSync(file,Buffer.from('partial stage'));const error=Error('Owned simulated stage write failure');error.code='EIO';throw error;}return originalWrite(file,...args);};try{assert.throws(()=>p.operation('write',[partial,'Replacement must fail']),/stage write failure/);}finally{fs.writeFileSync=originalWrite;}assert(fs.readFileSync(partial).equals(before));assert.equal(fs.readdirSync(writeRoot).filter(name=>name.startsWith('.lt-save-')).length,0);});
 check(()=>{const before=fs.readFileSync(partial),originalRename=fs.renameSync;fs.renameSync=(from,to)=>{if(to===partial){const error=Error('Owned simulated stage commit failure');error.code='EACCES';throw error;}return originalRename(from,to);};try{assert.throws(()=>p.operation('write',[partial,'Replacement commit must fail']),/stage commit failure/);}finally{fs.renameSync=originalRename;}assert(fs.readFileSync(partial).equals(before));assert.equal(fs.readdirSync(writeRoot).filter(name=>name.startsWith('.lt-save-')).length,0);});
 const absent=ownedFile('too-large-new.txt');
 check(()=>{assert.throws(()=>p.operation('write',[absent,'x'.repeat(writeLimit+1)]),/8 MiB/);assert.equal(fs.existsSync(absent),false);assert.throws(()=>p.operation('append',[absent,'x'.repeat(writeLimit+1)]),/8 MiB/);assert.equal(fs.existsSync(absent),false);});
 check(()=>{assert.throws(()=>p.operation('write',[partial,null]),/8 MiB/);assert.throws(()=>p.operation('append',[partial,42]),/8 MiB/);assert.equal(fs.readFileSync(partial,'utf8'),'Existing file remains exact.');assert.equal(fs.readdirSync(writeRoot).filter(name=>name.startsWith('.lt-save-')).length,0);});
 const modified=ownedFile('changed-during-save.txt');fs.writeFileSync(modified,'Previous saved source.');
 check(()=>{const external='New external saved bytes.';changeDuringStage(nativeWrite=>nativeWrite(modified,external),()=>assert.throws(()=>p.operation('write',[modified,'Do not overwrite the external source.']),/file changed while saving/));assert.equal(fs.readFileSync(modified,'utf8'),external);noSaveStages();});
 const replacement=ownedFile('external-replacement.txt');
 check(()=>{const external='Actual replacement file.';changeDuringStage(nativeWrite=>{nativeWrite(replacement,external);fs.renameSync(replacement,modified);},()=>assert.throws(()=>p.operation('write',[modified,'Do not overwrite the replacement file.']),/file changed while saving/));assert.equal(fs.readFileSync(modified,'utf8'),external);assert.equal(fs.existsSync(replacement),false);noSaveStages();});
 const created=ownedFile('created-during-save.txt');
 check(()=>{const external='External file created while staging.';changeDuringStage(nativeWrite=>nativeWrite(created,external,{flag:'wx'}),()=>assert.throws(()=>p.operation('write',[created,'Do not replace a newly created target.']),/file changed while saving/));assert.equal(fs.readFileSync(created,'utf8'),external);noSaveStages();});
 const removed=ownedFile('removed-during-save.txt');fs.writeFileSync(removed,'Previously existing target.');
 check(()=>{changeDuringStage(()=>fs.unlinkSync(removed),()=>assert.throws(()=>p.operation('write',[removed,'Do not recreate a removed target.']),/file changed while saving/));assert.equal(fs.existsSync(removed),false);noSaveStages();});
 const metadata=ownedFile('metadata-during-save.txt');fs.writeFileSync(metadata,'Saved bytes stay unchanged.');
 check(()=>{const before=fs.readFileSync(metadata),stat=fs.statSync(metadata);changeDuringStage(()=>fs.utimesSync(metadata,stat.atime,new Date(stat.mtimeMs-1000)),()=>assert.throws(()=>p.operation('write',[metadata,'Do not replace a changed target.']),/file changed while saving/));assert(fs.readFileSync(metadata).equals(before));assert.notEqual(fs.statSync(metadata).mtimeMs,stat.mtimeMs);noSaveStages();});
}finally{
 for(const file of writeFiles)if(fs.existsSync(file)){assert.equal(path.dirname(file),writeRoot);assert(fs.lstatSync(file).isFile());fs.unlinkSync(file);}
 assert.equal(fs.readdirSync(writeRoot).length,0);fs.rmdirSync(writeRoot);
}
console.log(JSON.stringify({passed:checks,calculationA:p.calculate('(12 + 30)'),calculationB:p.calculate('(12 + 31)')},null,2));
