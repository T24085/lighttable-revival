'use strict';
process.env.LT_REVIVAL_TEST='1';
const {app,BrowserWindow}=require('electron'),fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict');
app.on('window-all-closed',()=>{});
const policy=require('../../deploy/core/proof-policy.cjs'),projects=require('../../deploy/core/revival-projects.cjs'),memory=require('../../deploy/core/proof-memory.cjs');
const proof=require('../../deploy/core/proof-js.cjs'),node=require('../../deploy/core/revival-node.cjs'),preview=require('../../deploy/core/revival-preview.cjs'),languages=require('../../deploy/core/revival-languages.cjs'),npm=require('../../deploy/core/revival-npm.cjs');
const base=path.join(policy.root,'memory-cap-fixtures'),root=path.join(base,crypto.randomUUID()),before=fs.existsSync(projects.statePath)?fs.readFileSync(projects.statePath):null;
fs.mkdirSync(root,{recursive:true});fs.writeFileSync(path.join(root,'project-state-before.bin'),before||'');projects.activate(root);
const files={node:'program.cjs',python:'program.py',clojure:'program.clj',clojurescript:'program.cljs',preview:'index.html'};
for(const key of Object.keys(files)){files[key]=path.join(root,files[key]);fs.writeFileSync(files[key],'');}
const GiB=1024*1024*1024,MiB=1024*1024,result={passed:false,checks:[],observations:[]};let host,ended=false;
const check=async(label,fn)=>{await fn();result.checks.push(label);console.log(label);};
const quota=(value,limit=GiB)=>{assert.equal(value.limitBytes,limit);assert(value.hardPrivateCommit);};
const run=(language,source)=>languages.run(981,{language,path:files[language],source});
async function finish(error){
 if(ended)return;ended=true;clearTimeout(deadline);if(error)result.error=error.stack;
 try{
  await languages.shutdown();await npm.shutdown();await preview.shutdown();await node.shutdown();await proof.shutdown();await memory.stop();if(host&&!host.isDestroyed())host.destroy();
  result.cleanup={languages:languages.activeCount(),npm:npm.activeCount(),preview:preview.activeCount(),node:node.activeCount(),proof:proof.activeCount(),...memory.status()};
  if(before)fs.writeFileSync(projects.statePath,before);else if(fs.existsSync(projects.statePath))fs.unlinkSync(projects.statePath);
  result.projectRestored=before?fs.readFileSync(projects.statePath).equals(before):!fs.existsSync(projects.statePath);
  const relative=path.relative(base,root);assert(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative));fs.rmSync(root,{recursive:true,force:true});result.tempRemoved=!fs.existsSync(root);
  result.passed=!error&&result.projectRestored&&result.tempRemoved&&Object.values(result.cleanup).every(value=>!value);
 }catch(reason){result.cleanupError=reason.stack;}
 fs.writeFileSync(path.join(policy.root,'memory-cap-result.json'),JSON.stringify(result,null,2));app.exit(result.passed?0:1);
}
const deadline=setTimeout(()=>finish(Error('Memory allowance proof exceeded 110000 ms')),110000);
app.whenReady().then(async()=>{try{
 await check('Default execution and development-server limits are 1 GiB',()=>{assert.equal(memory.defaultLimitBytes,GiB);assert.equal(memory.jvmLimitBytes,2*GiB);assert.equal(npm.limits.serverMemoryBytes,GiB);});
 await check('Isolated JavaScript can allocate and fill 320 MiB above the old limit',async()=>{const value=await proof.run(981,'const bytes=new Uint8Array(320*1024*1024);bytes.fill(7);bytes.length');assert.equal(value.result,String(320*MiB));quota(value.memory);assert(value.memory.processExited);result.observations.push({runtime:'isolated',memory:value.memory});});
 await check('Native Node can allocate 512 MiB above the old limits',async()=>{const value=await node.run(981,{path:files.node,source:'globalThis.bytes=Buffer.alloc(512*1024*1024,1);bytes.length;'});assert.equal(value.result,String(512*MiB));quota(value.memory);assert(value.memory.processExited);assert(value.memory.peakJobBytes>384*MiB&&value.memory.peakJobBytes<=GiB);result.observations.push({runtime:'node',memory:value.memory});});
 await check('A real browser preview can allocate and fill 320 MiB',async()=>{
  fs.writeFileSync(files.preview,'<script>globalThis.bytes=new Uint8Array(320*1024*1024);bytes.fill(3);</script>');
  host=new BrowserWindow({show:false,opacity:0,skipTaskbar:true,webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true,backgroundThrottling:false}});host.showInactive();await host.loadURL('data:text/html,Memory test host');
  const state=await preview.start(981,{path:files.preview},host,()=>{});quota(state.memory);assert.equal((await preview.evaluate(981,'bytes.length')).result,String(320*MiB));result.observations.push({runtime:'preview',memory:state.memory});
 });
 await check('Stop reaps the larger browser renderer and its job',async()=>{const stopped=await preview.stop(981);assert(stopped.memory.processExited);assert.equal(memory.status().jobs,0);});
 await check('Local Python can retain a 320 MiB allocation under a 1 GiB quota',async()=>{const value=await run('python','payload=bytearray(320*1024*1024)\nlen(payload)');assert.equal(value.value,String(320*MiB));quota(value.memory);result.observations.push({runtime:'python',session:value.session});await languages.stop(981);});
 await check('Clojure has a 1 GiB Java heap and 2 GiB total JVM allowance',async()=>{const value=await run('clojure','(def payload (byte-array (* 256 1024 1024)))\n(alength payload)');assert.equal(value.value,String(256*MiB));quota(value.memory,2*GiB);const heap=Number((await run('clojure','(.maxMemory (Runtime/getRuntime))')).value);assert(heap>=900*MiB&&heap<=GiB);result.observations.push({runtime:'clojure',heapBytes:heap,session:value.session});await languages.stop(981);});
 await check('ClojureScript can allocate and fill 320 MiB under a 1 GiB quota',async()=>{const value=await run('clojurescript','(def payload (js/Uint8Array. (* 320 1024 1024)))\n(.fill payload 3)\n(.-length payload)');assert.equal(value.value,String(320*MiB));quota(value.memory);result.observations.push({runtime:'clojurescript',session:value.session});await languages.stop(981);});
 await check('An actual npm development server can retain 512 MiB',async()=>{
  const manifest=path.join(root,'package.json'),source=JSON.stringify({name:'lt-memory-allowance',private:true,scripts:{dev:'node server.cjs'}});fs.writeFileSync(manifest,source);fs.writeFileSync(path.join(root,'server.cjs'),'globalThis.bytes=Buffer.alloc(512*1024*1024,1);const server=require("http").createServer((req,res)=>res.end(String(bytes.length)));server.listen(0,"127.0.0.1",()=>console.log("READY http://127.0.0.1:"+server.address().port));');
  const state=await npm.start(981,{path:manifest,source,kind:'server',script:'dev'});quota(state.memory);let live,url;const end=Date.now()+10000;
  while(Date.now()<end){live=npm.status(981);url=live?.output.stdout.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];if(url)break;assert.equal(live.status,'running');await new Promise(resolve=>setTimeout(resolve,25));}assert(url,'Server did not become ready');assert.equal(await(await fetch(url)).text(),String(512*MiB));
  const stopped=await npm.stop(981);assert(stopped.memory.processExited);assert(stopped.memory.peakJobBytes>384*MiB&&stopped.memory.peakJobBytes<=GiB);await assert.rejects(fetch(url));result.observations.push({runtime:'npm-server',memory:stopped.memory});
 });
 await check('Isolated allocations exceeding 1 GiB still fail and later runs recover',async()=>{await assert.rejects(proof.run(981,'new Uint8Array(1536*1024*1024).length'));const last=proof.diagnostics().recent.at(-1);quota(last.memory);assert(last.memory.processExited);assert.equal((await proof.run(981,'6*7')).result,'42');});
 await check('Native Node allocations exceeding 1 GiB are reaped and recover',async()=>{await assert.rejects(node.run(981,{path:files.node,source:'Buffer.alloc(1536*1024*1024,1).length;'}));const last=node.diagnostics().recent.at(-1);quota(last.memory);assert(last.memory.processExited);assert(last.memory.peakJobBytes<=GiB);assert.equal((await node.run(981,{path:files.node,source:'6*7;'})).result,'42');});
 await finish();
 }catch(error){await finish(error);}});
