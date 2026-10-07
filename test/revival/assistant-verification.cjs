'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const core=path.resolve(__dirname,'../../deploy/core'),verification=require(core+'/revival-assistant-verification.cjs');
const call=(name,args={})=>({function:{name,arguments:args}}),response=calls=>({message:{role:'assistant',content:calls?'':'Done',...(calls?{tool_calls:calls}:{})}});
async function run(check){
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'lt-verification-'));let next=0;
 const folder=()=>{const root=path.join(base,String(next++));fs.mkdirSync(root);return root;};
 const until=async runtime=>{const deadline=Date.now()+5000;while(runtime.activeCount()){if(Date.now()>deadline)throw Error('Verification controller timed out');await new Promise(r=>setTimeout(r,5));}};
 function runtime(root,steps,extra={}){
  const store=require(core+'/revival-assistant-store.cjs').create(path.join(base,'history-'+next++));store.settings({model:'coder',reviewerModel:'judge'});let index=0;
  const options={store,client:{show:async()=>({capabilities:['tools','decision']}),models:async()=>[{name:'judge',digest:'fixture'}],unload:async()=>{},chat:async()=>response(index<steps.length?[steps[index++]]:null)},editor:async(_owner,op)=>op==='context'?{buffers:[]}:null,commands:{stop:async()=>{},shutdown:async()=>{}},preview:{stop:async()=>{}},...extra};
  return require(core+'/revival-assistant.cjs').create(options);
 }
 async function coding(root,steps){const a=runtime(root,steps);await a.start(1,{root,text:'Repair the saved file'});await until(a);return {a,saved:a.load(a.state().sessionId)};}
 try{
  await check('Tests get a reproducible source revision before any preview exists, including tests and added files',()=>{
   const root=folder(),file=path.join(root,'index.html');fs.writeFileSync(file,'original');fs.writeFileSync(path.join(root,'test.cjs'),'assertions');const first=verification.projectRevision(root);assert(first);assert.equal(verification.projectRevision(root),first);fs.writeFileSync(path.join(root,'test.cjs'),'changed assertions');assert.notEqual(verification.projectRevision(root),first);fs.writeFileSync(path.join(root,'other.py'),'new dependency');const added=verification.projectRevision(root);fs.unlinkSync(path.join(root,'other.py'));assert.notEqual(verification.projectRevision(root),added);
  });
  await check('Unsaved or missing editor files and incomplete linked inventories cannot verify disk tests',()=>{
   const root=folder(),file=path.join(root,'main.py');fs.writeFileSync(file,'saved\r\n');assert(verification.projectRevision(root,[{path:file,source:'saved\n'}]));assert.equal(verification.projectRevision(root,[{path:file,source:'unsaved'}]),null);assert.equal(verification.projectRevision(root,[{path:path.join(root,'new.py'),source:'new'}]),null);const linked=folder();fs.symlinkSync(linked,path.join(root,'linked'),process.platform==='win32'?'junction':'dir');assert.equal(verification.projectRevision(root),null);
  });
  await check('Generated dependencies do not change source receipts and oversized inventories remain unverified',()=>{
   const root=folder();fs.writeFileSync(path.join(root,'main.py'),'source');const revision=verification.projectRevision(root);fs.mkdirSync(path.join(root,'node_modules'));fs.writeFileSync(path.join(root,'node_modules','generated'),'ignored');assert.equal(verification.projectRevision(root),revision);fs.writeFileSync(path.join(root,'large.bin'),Buffer.alloc(16*1024*1024+1));assert.equal(verification.projectRevision(root),null);
  });
  await check('An alternate journaled write repairs a failed exact edit without a false unsaved checkpoint',async()=>{
   const root=folder(),file=path.join(root,'main.py');fs.writeFileSync(file,'value = 1');const {a,saved}=await coding(root,[call('read_file',{path:file}),call('edit_file',{path:file,old_text:'value = 1',new_text:'value = 2',expected_sha256:'wrong'}),call('write_file',{path:file,content:'value = 2'})]);assert.equal(a.state().status,'completed');assert.deepEqual(saved.unresolvedFileActions,[]);assert(saved.journal.some(e=>e.status==='saved'));assert.equal(fs.readFileSync(file,'utf8'),'value = 2');
  });
  await check('An unrelated rewrite of the same file cannot erase a failed edit requirement',async()=>{
   const root=folder(),file=path.join(root,'main.py');fs.writeFileSync(file,'value = 1');const {a,saved}=await coding(root,[call('read_file',{path:file}),call('edit_file',{path:file,old_text:'value = 1',new_text:'value = 2',expected_sha256:'wrong'}),call('write_file',{path:file,content:'value = 3'})]);assert.equal(a.state().status,'paused');assert.equal(saved.unresolvedFileActions.length,1);
  });
  await check('A genuine replacement can resolve the edit while preserving additional source changes',async()=>{
   const root=folder(),file=path.join(root,'main.py');fs.writeFileSync(file,'value = 1\n# retain');const {a,saved}=await coding(root,[call('read_file',{path:file}),call('edit_file',{path:file,old_text:'value = 1',new_text:'value = 2',expected_sha256:'wrong'}),call('write_file',{path:file,content:'value = 2\n# retain\n# additional source'})]);assert.equal(a.state().status,'completed');assert.deepEqual(saved.unresolvedFileActions,[]);
  });
  await check('A repaired ambiguous match must actually introduce the requested change',async()=>{
   const root=folder(),file=path.join(root,'main.py');fs.writeFileSync(file,'old old');const {a}=await coding(root,[call('read_file',{path:file}),call('edit_file',{path:file,old_text:'old',new_text:'new'}),call('write_file',{path:file,content:'new old'})]);assert.equal(a.state().status,'completed');
  });
  await check('A missing-path write is cleared only by a journaled save of its intended content',async()=>{
   const root=folder(),file=path.join(root,'other.txt');const {a,saved}=await coding(root,[call('write_file',{content:'required source'}),call('write_file',{path:file,content:'unrelated source'})]);assert.equal(a.state().status,'paused');assert.equal(saved.unresolvedFileActions.length,1);
  });
  await check('Different rename destinations and ordinary writes cannot resolve rename or delete failures',async()=>{
   const root=folder(),file=path.join(root,'main.py'),blocked=path.join(root,'blocked.py'),other=path.join(root,'other.py');fs.writeFileSync(file,'source');fs.writeFileSync(blocked,'retained');const {a,saved}=await coding(root,[call('read_file',{path:file}),call('rename_file',{path:file,new_path:blocked}),call('rename_file',{path:file,new_path:other})]);assert.equal(a.state().status,'paused');assert.equal(saved.unresolvedFileActions[0].newPath,blocked.toLowerCase());
   const file2=path.join(root,'delete.py');fs.writeFileSync(file2,'retain');const result=await coding(root,[call('delete_file',{path:file2}),call('read_file',{path:file2}),call('write_file',{path:file2,content:'rewritten'})]);assert.equal(result.a.state().status,'paused');assert.equal(result.saved.unresolvedFileActions[0].name,'delete_file');
  });
  await check('A matching journaled delete resolves its failure while read-before-edit remains enforced',async()=>{
   const root=folder(),file=path.join(root,'main.py');fs.writeFileSync(file,'source');const {a,saved}=await coding(root,[call('delete_file',{path:file}),call('read_file',{path:file}),call('delete_file',{path:file})]);assert.equal(a.state().status,'completed');assert(!fs.existsSync(file));assert.deepEqual(saved.unresolvedFileActions,[]);
  });
  await check('Restart and Resume retain an edit intent until an alternate-tool repair is saved',async()=>{
   const root=folder(),file=path.join(root,'main.py');fs.writeFileSync(file,'value = 1');const initial=await coding(root,[call('read_file',{path:file}),call('edit_file',{path:file,old_text:'value = 1',new_text:'value = 2',expected_sha256:'wrong'})]);assert.equal(initial.a.state().status,'paused');const store=require(core+'/revival-assistant-store.cjs').create(initial.a.store.directory);const resumed=runtime(root,[call('read_file',{path:file}),call('write_file',{path:file,content:'value = 2'})],{store});await resumed.resume(1,{sessionId:initial.saved.id});await until(resumed);assert.equal(resumed.state().status,'completed');assert.deepEqual(resumed.load(initial.saved.id).unresolvedFileActions,[]);
  });
  await check('Every applicable test command must finish and match current project source independently',()=>{
   const root=folder(),revision='current',record={purpose:'test',command:'node --test',cwd:root,sourceRoot:root,sourceRevision:revision,status:'exited',exitCode:0},a={session:{root,commands:[record]},testsDirty:false},testEvidence=require(core+'/revival-reviewer.cjs').testEvidence;assert(testEvidence(a,revision).passed);assert(!testEvidence(a,'edited').passed);a.session.commands.push({...record,command:'npm test',sourceRevision:'old'});assert(!testEvidence(a,revision).passed);a.session.commands=[{...record,status:'stopped'}];assert(!testEvidence(a,revision).passed);a.session.commands=[{...record,sourceRevision:null}];assert(!testEvidence(a,revision).passed);a.session.commands=[{...record,cwd:folder()}];assert(!testEvidence(a,revision).passed);
  });
  await check('Acceptance check schemas reject invalid nested fields instead of silently accepting them',()=>{
   const validate=require(core+'/revival-assistant-tools.cjs').validate;assert.throws(()=>validate(call('set_review_criteria',{checks:[{id:'x',description:'X',kind:'control',unexpected:true}]})));assert.throws(()=>validate(call('set_review_criteria',{checks:[{id:1,description:'X',kind:'control'}]})));assert.throws(()=>validate(call('set_review_criteria',{checks:Array(9).fill({id:'x',description:'X',kind:'control'})})));assert(validate(call('set_review_criteria',{checks:[{id:'increment',description:'Increment is visible',kind:'control',selector:'#increment'}]})));
  });
 }finally{const resolved=fs.realpathSync(base);assert(resolved.startsWith(fs.realpathSync(os.tmpdir())+path.sep));fs.rmSync(base,{recursive:true});}
}
module.exports={run};
if(require.main===module){const checks=[];run(async(name,fn)=>{await fn();checks.push(name);}).then(()=>console.log(JSON.stringify({passed:true,checks},null,2))).catch(error=>{console.error(error);process.exitCode=1;});}
