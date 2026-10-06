'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'lt-runtime-setup-')),checks=[];
const atomic=require('../../deploy/core/revival-atomic-json.cjs'),profiles=require('../../deploy/core/revival-assistant-profile.cjs'),runtimes=require('../../deploy/core/revival-runtime-paths.cjs');
function check(name,fn){fn();checks.push(name);}
try{
 const file=path.join(root,'checkpoint.json');fs.writeFileSync(file,'{"version":"old"}');
 check('Transient Windows rename locks retry while preserving the complete previous checkpoint',()=>{
  const waits=[];let attempts=0;
  atomic.write(file,{version:'new'},{io:{...fs,renameSync:(stage,target)=>{if(attempts++<2){assert.equal(JSON.parse(fs.readFileSync(target)).version,'old');throw Object.assign(Error('sharing violation'),{code:'EPERM'});}fs.renameSync(stage,target);}},wait:ms=>waits.push(ms)});
  assert.equal(attempts,3);assert.deepEqual(waits,[10,25]);assert.equal(JSON.parse(fs.readFileSync(file)).version,'new');assert.deepEqual(fs.readdirSync(root),['checkpoint.json']);
 });
 check('Persistent Windows locks stop after bounded retries and keep the previous checkpoint',()=>{
  let attempts=0;const denied=Object.assign(Error('permanent sharing violation'),{code:'EACCES'});
  assert.throws(()=>atomic.write(file,{version:'bad'},{io:{...fs,renameSync:()=>{attempts++;throw denied;}},wait:()=>{}}),error=>error===denied);
  assert.equal(attempts,6);assert.equal(JSON.parse(fs.readFileSync(file)).version,'new');assert.deepEqual(fs.readdirSync(root),['checkpoint.json']);
 });
 check('Non-transient write errors remain visible and never replace checkpoint data',()=>{
  const full=Object.assign(Error('disk full'),{code:'ENOSPC'});let attempts=0;
  assert.throws(()=>atomic.write(file,{version:'bad'},{io:{...fs,writeFileSync:()=>{throw full;},renameSync:()=>attempts++},wait:()=>{}}),error=>error===full);
  assert.equal(attempts,0);assert.equal(JSON.parse(fs.readFileSync(file)).version,'new');
 });
 check('Assistant settings and journaled conversations migrate outside OneDrive without altering originals',()=>{
  const legacy=path.join(root,'OneDrive/assistant'),localAppData=path.join(root,'local-app-data');fs.mkdirSync(legacy,{recursive:true});
  fs.writeFileSync(path.join(legacy,'settings.json'),'{"model":"coder","reviewerModel":"judge"}');fs.writeFileSync(path.join(legacy,'chat.json'),'{"messages":["keep"],"journal":["original"]}');fs.writeFileSync(path.join(legacy,'unfinished.tmp'),'partial');
  const destination=profiles.directory(legacy,{test:false,localAppData});assert(destination.startsWith(localAppData+path.sep));assert(!destination.startsWith(path.join(root,'OneDrive')));assert.equal(fs.readFileSync(path.join(destination,'chat.json'),'utf8'),fs.readFileSync(path.join(legacy,'chat.json'),'utf8'));assert(!fs.existsSync(path.join(destination,'unfinished.tmp')));
  fs.writeFileSync(path.join(destination,'settings.json'),'{"model":"new"}');assert.equal(profiles.directory(legacy,{test:false,localAppData}),destination);assert.equal(JSON.parse(fs.readFileSync(path.join(destination,'settings.json'))).model,'new');assert.equal(JSON.parse(fs.readFileSync(path.join(legacy,'settings.json'))).model,'coder');assert.equal(profiles.directory(legacy,{test:true,localAppData}),legacy);
 });
 check('Portable PowerShell resolves locally and explicit overrides take precedence',()=>{
  const names=['LT_TOOLCHAIN_ROOT','LT_POWERSHELL_EXECUTABLE'],saved=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  try{
   process.env.LT_TOOLCHAIN_ROOT=path.join(root,'toolchain');delete process.env.LT_POWERSHELL_EXECUTABLE;const portable=path.join(runtimes.toolchain(),'powershell/pwsh.exe');fs.mkdirSync(path.dirname(portable),{recursive:true});fs.writeFileSync(portable,'fixture');assert.equal(runtimes.powershell(),portable);
   const override=path.join(root,'override.exe');fs.writeFileSync(override,'fixture');process.env.LT_POWERSHELL_EXECUTABLE=override;assert.equal(runtimes.powershell(),override);
  }finally{for(const name of names)if(saved[name]===undefined)delete process.env[name];else process.env[name]=saved[name];}
  });
 check('Repeated real conversation checkpoints retain every saved event without leftover temporary files',()=>{
  const store=require('../../deploy/core/revival-assistant-store.cjs').create(path.join(root,'checkpoint-stress')),session=store.conversation(root);
  for(let index=0;index<200;index++){session.events.push({type:'progress',index});store.save(session);assert.equal(store.load(session.id).events.length,index+1);}
  assert.equal(store.load(session.id).events[199].index,199);assert.deepEqual(fs.readdirSync(store.directory),[session.id+'.json']);
 });
 console.log(JSON.stringify({passed:true,checks},null,2));
}finally{assert.equal(path.dirname(root),os.tmpdir());fs.rmSync(root,{recursive:true});}
