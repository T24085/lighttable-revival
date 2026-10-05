'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),{spawn}=require('child_process'),{StringDecoder}=require('string_decoder');
const node=require('./revival-node.cjs'),policy=require('./proof-policy.cjs'),packages=require('./proof-packages.cjs'),memory=require('./proof-memory.cjs');
const active=new Map(),versions=new Map(),completed=new Map(),recent=[];
const limits=Object.freeze({installMs:300000,serverMs:900000,serverMemoryBytes:memory.defaultLimitBytes,outputBytes:1024*1024});
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
function prepare(options){
 if(!options||typeof options!=='object'||Array.isArray(options)||!['install','server'].includes(options.kind)||typeof options.path!=='string')throw Error('Choose Install dependencies or a project development script.');
 const entry=policy.checked(options.path),root=node.rootFor(entry),manifest=policy.checked(path.join(root,'package.json'));
 if(entry.toLowerCase()!==manifest.toLowerCase())throw Error('Choose the opened project package.json.');
 const source=packages.readText(manifest,65536,'package.json exceeds 64 KiB');JSON.parse(source.replace(/^\uFEFF/,''));
 if(typeof options.source!=='string'||options.source.replace(/\r\n/g,'\n')!==source.replace(/\r\n/g,'\n'))throw Error('Save package.json before running npm.');
 const inside=file=>{const relative=path.relative(root,file);return relative===''||(!path.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith('..'+path.sep));};
 if(options.buffers!==undefined){
  if(!Array.isArray(options.buffers)||options.buffers.length>256)throw Error('npm accepts at most 256 editor buffers.');let bytes=0;
  for(const item of options.buffers){if(!item||typeof item.path!=='string'||typeof item.source!=='string')throw Error('Invalid npm project buffer.');const file=policy.checked(item.path);if(!inside(file))continue;
   bytes+=Buffer.byteLength(item.source);if(Buffer.byteLength(item.source)>2*1024*1024||bytes>8*1024*1024)throw Error('npm project buffers exceed 2 MiB / 8 MiB.');
   if(item.source.replace(/\r\n/g,'\n')!==packages.readText(file,2*1024*1024,'Project file exceeds 2 MiB').replace(/\r\n/g,'\n'))throw Error('Save project files before running npm: '+path.relative(root,file));
  }
 }
 const runtime=node.discover();if(!runtime.npm)throw Error('npm was not found beside the selected Node executable.');
 if(options.kind==='server'&&(typeof options.script!=='string'||!node.scripts(root).includes(options.script)))throw Error('Choose a script defined in this project package.json.');
 const maximum=options.kind==='install'?limits.installMs:limits.serverMs,budgetMs=options.budgetMs===undefined?maximum:options.budgetMs;
 if(!Number.isInteger(budgetMs)||budgetMs<100||budgetMs>maximum)throw Error('Invalid npm execution budget.');
 const inputs=node.initialInputs(root);return {entry,root,source,runtime,kind:options.kind,script:options.script,budgetMs,inputs,runId:typeof options.runId==='string'?options.runId.slice(0,128):crypto.randomUUID()};
}
function status(owner){return active.get(owner)?.snapshot()||null;}
function stop(owner,reason='Stopped by user'){versions.set(owner,(versions.get(owner)||0)+1);const previous=[...completed].reverse().find(([key])=>key.startsWith(owner+'|'))?.[1]||null;return active.get(owner)?.finish('stopped',reason)||Promise.resolve(previous);}
async function start(owner,options,notify=()=>{}){
 const revision=(versions.get(owner)||0)+1;versions.set(owner,revision);await(active.get(owner)?.finish('stopped','Replaced by a new npm operation')||Promise.resolve());
 if(versions.get(owner)!==revision)throw Error('npm operation replaced before startup.');
 const prepared=prepare(options);if(options.expectedRoot&&prepared.root.toLowerCase()!==options.expectedRoot.toLowerCase())throw Error('The project changed while authorizing npm. Try again.');const id=crypto.randomUUID();let child,attachment,quota,accounting,done=false,cleanup,timer,outputTimer,stdout='',stderr='',outputBytes=0,startedAt=null,expiresAt=null,state='starting',reason=null,exitCode=null;
 let complete;const completion=new Promise(resolve=>{complete=resolve;});
 const stopListeners=new Set(),job={finish,snapshot,completion,id,stopListeners,connect};active.set(owner,job);
 async function connect(url){
  if(done||state!=='running'||prepared.kind!=='server')throw Error('The development server is not running.');
  const parsed=new URL(url);if(parsed.protocol!=='http:'||parsed.username||parsed.password||!['127.0.0.1','localhost','[::1]'].includes(parsed.hostname)||!parsed.port)throw Error('Preview an HTTP loopback URL printed by the development server.');
  const addresses=parsed.hostname==='localhost'?['127.0.0.1','::1']:[parsed.hostname==='[::1]'?'::1':parsed.hostname];let failure;
  for(const address of addresses){let socket;try{
   socket=require('net').connect({host:address,port:Number(parsed.port)});socket.on('error',()=>{});
   await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Development server connection exceeded 1500 ms')),1500);socket.once('connect',()=>{clearTimeout(timer);resolve();});socket.once('error',error=>{clearTimeout(timer);reject(error);});});
   const peer=await quota.peer(address,Number(parsed.port),socket.localPort);if(done||active.get(owner)!==job||socket.destroyed)throw Error('Development server changed during connection.');
   socket.ltPeer=peer;return socket;
  }catch(error){socket?.destroy();failure=error;}}
  throw failure;
 }
 function snapshot(){return {id,runId:prepared.runId,kind:prepared.kind,script:prepared.kind==='server'?prepared.script:null,status:state,reason,exitCode,pid:child?.pid||null,root:prepared.root,command:prepared.kind==='install'?'npm install':'npm run '+prepared.script,startedAt,expiresAt,budgetMs:prepared.budgetMs,output:{stdout,stderr,bytes:outputBytes},source:prepared.source,sha256:hash(prepared.source),project:{root:prepared.root,entry:prepared.entry,snapshotKind:'inputs',files:prepared.inputs,sha256:hash(JSON.stringify(prepared.inputs.map(({name,sha256})=>({name,sha256}))))},memory:quota?{...quota.metadata,...accounting}:null};}
 function emit(event){try{const value=snapshot();if(event==='output')delete value.project;else value.project.files=value.project.files.map(({source,...item})=>item);delete value.source;notify({...value,event});}catch(_){} }
 function finish(nextStatus,message,code=null){
  if(done)return cleanup;done=true;clearTimeout(timer);clearTimeout(outputTimer);state=nextStatus;reason=message;exitCode=code;for(const listener of stopListeners){try{listener(message);}catch(_){}}stopListeners.clear();
  cleanup=(async()=>{
   try{quota=await attachment;}catch(error){reason=error.message;state='failed';}
   try{if(quota)accounting=await quota.release();else if(child&&child.exitCode===null&&!child.killed)child.kill();}
   catch(error){state='failed';reason=error.message;}
   if(child&&child.exitCode===null&&child.signalCode===null)await new Promise(resolve=>{const timeout=setTimeout(resolve,2000);child.once('close',()=>{clearTimeout(timeout);resolve();});});
   if(active.get(owner)===job)active.delete(owner);const result=snapshot();completed.set(owner+'|'+id,result);if(completed.size>16)completed.delete(completed.keys().next().value);recent.push({id,pid:child?.pid||null,status:state,reason,memory:result.memory});if(recent.length>16)recent.shift();emit('finished');complete(result);return result;
  })();return cleanup;
 }
 try{
  await memory.start();if(done)throw Error(reason);
  // The verified process-family quota governs installers and project scripts.
  child=spawn(prepared.runtime.executable,['--require',path.join(__dirname,'revival-npm-preload.cjs'),prepared.runtime.npm.cli,...(prepared.kind==='install'?['install','--global=false']:['run','--',prepared.script])],{cwd:prepared.root,windowsHide:true,shell:false,env:node.environment(prepared.runtime.executable),stdio:['pipe','pipe','pipe']});
  child.on('error',error=>finish('failed',error.message));child.stdin.on('error',error=>{if(!done)finish('failed',error.message);});
  for(const stream of ['stdout','stderr']){
   const decoder=new StringDecoder('utf8');child[stream].on('data',data=>{if(done)return;outputBytes+=data.length;if(outputBytes>limits.outputBytes){finish('failed','npm output exceeded 1 MiB');return;}const text=decoder.write(data);if(stream==='stdout')stdout=(stdout+text).slice(-32768);else stderr=(stderr+text).slice(-32768);if(!outputTimer)outputTimer=setTimeout(()=>{outputTimer=null;if(!done)emit('output');},50);});
  }
  child.on('close',code=>{if(!done)finish(code===0?'exited':'failed',code===0?(prepared.kind==='install'?'Dependencies installed':'Development script exited'):'npm exited with code '+code,code);});
  timer=setTimeout(()=>finish('failed','npm startup exceeded 5000 ms'),5000);
  attachment=memory.attach(child.pid,[process.pid],prepared.runtime.executable,prepared.kind==='server'?{limitBytes:limits.serverMemoryBytes}:{});quota=await attachment;if(done)throw Error(reason);
  clearTimeout(timer);startedAt=Date.now();expiresAt=startedAt+prepared.budgetMs;state='running';timer=setTimeout(()=>finish('stopped','npm reached its '+prepared.budgetMs+' ms lifetime limit'),prepared.budgetMs);
  // No npm or lifecycle code runs until quota assignment/readback has completed.
  child.stdin.end(JSON.stringify({ready:true,install:prepared.kind==='install'}));emit('started');return snapshot();
 }catch(error){await finish('failed',error.message);throw error;}
}
function wait(owner,id){const job=active.get(owner);return job?.id===id?job.completion:Promise.resolve(completed.get(owner+'|'+id)||null);}
async function shutdown(){await Promise.all([...active.values()].map(job=>job.finish('stopped','Application closing')));}
function server(owner,id){const job=active.get(owner),state=job?.snapshot();if(!job||state.status!=='running'||state.kind!=='server'||id&&id!==job.id)throw Error('Start a development server first.');return {state,connect:url=>job.connect(url),onStop:listener=>{const current=job.snapshot();if(active.get(owner)!==job||current.status!=='running'){listener(current.reason||'Development server stopped');return ()=>{};}job.stopListeners.add(listener);return ()=>job.stopListeners.delete(listener);}};}
module.exports={prepare,start,status,stop,wait,server,shutdown,limits,activeCount:()=>active.size,diagnostics:()=>({recent:[...recent],...memory.status()})};
