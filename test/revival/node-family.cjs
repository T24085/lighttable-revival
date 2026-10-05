'use strict';
process.env.LT_REVIVAL_TEST='1';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const policy=require('../../deploy/core/proof-policy.cjs'),projects=require('../../deploy/core/revival-projects.cjs'),node=require('../../deploy/core/revival-node.cjs'),memory=require('../../deploy/core/proof-memory.cjs');
const root=path.join(policy.root,'node-family-tests',crypto.randomUUID()),saved=fs.existsSync(projects.statePath)?fs.readFileSync(projects.statePath):null,checks=[];
fs.mkdirSync(root,{recursive:true});fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({name:'node-family-fixture',private:true}));
const write=(name,source)=>{const file=path.join(root,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,source);return file;};
const entry=write('index.cjs',''),workerSource='const {parentPort,workerData}=require("node:worker_threads");parentPort.postMessage(workerData.value*2);',worker=write('worker.cjs',workerSource),childSource='process.on("message",({value})=>process.send(value*2,()=>process.disconnect()));',child=write('child.cjs',childSource);
const thread='const {Worker}=require("node:worker_threads");new Promise((resolve,reject)=>{const worker=new Worker("./worker.cjs",{workerData:{value:21}});worker.once("message",answer=>{console.log("answer:"+answer);resolve(answer)});worker.once("error",reject);});';
const fork='const {fork}=require("node:child_process");new Promise((resolve,reject)=>{const child=fork("./child.cjs");child.once("message",answer=>{console.log("answer:"+answer);resolve(answer)});child.once("error",reject);child.once("exit",code=>{if(code!==0)reject(new Error("Child exited with "+code))});child.send({value:21});});';
const stdout=result=>result.logs.find(value=>value.startsWith('stdout: '))?.slice(8)||'';
function plain(source){
 // Fixed authored fixtures only. Plain Node comparisons are not an application
 // execution boundary and never accept user programs.
 fs.writeFileSync(entry,source);const env={NO_COLOR:'1'};for(const name of ['SystemRoot','WINDIR','TEMP','TMP'])if(process.env[name])env[name]=process.env[name];
 return execFileSync(node.discover().executable,[entry],{cwd:root,env,windowsHide:true,timeout:3000,maxBuffer:1024*1024}).toString();
}
const run=async(source,options={})=>{const result=await node.run(104,{path:entry,source,...options});assert.equal(result.memory.contextFilesRemoved,true);assert.equal(result.memory.processExited,true);return result;};
async function compare(source,expected='42'){const baseline=plain(source),result=await run(source);assert.equal(stdout(result),baseline);assert.equal(result.result,expected);assert.equal(result.memory.hardPrivateCommit,true);assert.equal(result.memory.processExited,true);return result;}
async function check(name,fn){try{await fn();checks.push(name);}catch(error){error.message=name+': '+error.message;throw error;}}
async function withSource(file,source,fn){const before=fs.readFileSync(file,'utf8');fs.writeFileSync(file,source);try{return await fn();}finally{fs.writeFileSync(file,before);}}
(async()=>{try{
 projects.activate(root);
 await check('Actual worker_threads executes with native messages and result',async()=>{const result=await compare(thread);assert.ok(result.project.modules.some(item=>item.path===worker&&item.source===workerSource));});
 await check('Actual fork executes with its own native IPC channel',async()=>{const result=await compare(fork);assert.ok(result.project.modules.some(item=>item.path===child&&item.source===childSource));});
 await check('Worker entry buffers execute without saving their disk source',async()=>{const source=workerSource.replace('value*2','value*2+1'),result=await run(thread,{buffers:[{path:worker,source}]});assert.equal(result.result,'43');assert.equal(fs.readFileSync(worker,'utf8'),workerSource);assert.ok(result.project.modules.some(item=>item.path===worker&&item.source===source&&item.origin==='editor'));});
 await check('Fork entry buffers execute without saving their disk source',async()=>{const source=childSource.replace('value*2','value*2+1'),result=await run(fork,{buffers:[{path:child,source}]});assert.equal(result.result,'43');assert.equal(fs.readFileSync(child,'utf8'),childSource);assert.ok(result.project.modules.some(item=>item.path===child&&item.source===source&&item.origin==='editor'));});
 await check('A worker can run the current entry file with native thread identity',async()=>{
  const source='const {Worker,isMainThread,parentPort}=require("node:worker_threads");if(!isMainThread){parentPort.postMessage(42)}else{globalThis.answer=new Promise((resolve,reject)=>{const worker=new Worker(__filename);worker.once("message",value=>{console.log("answer:"+value);resolve(value)});worker.once("error",reject);});}globalThis.answer;';
  const result=await compare(source);assert.equal(result.contexts.length,2);assert.equal(result.project.modules.filter(item=>item.path===entry).length,1);
 });
 const shared=write('shared.cjs','exports.answer=42;');
 await check('Unsaved dependencies load inside a real worker and enter its snapshot',async()=>{
  const source='const {parentPort}=require("node:worker_threads");parentPort.postMessage(require("./shared.cjs").answer);';
  await withSource(worker,source,async()=>{const result=await run(thread,{buffers:[{path:shared,source:'exports.answer=43;'}]});assert.equal(result.result,'43');assert.ok(result.project.modules.some(item=>item.path===shared&&item.source==='exports.answer=43;'&&item.origin==='editor'));assert.equal(fs.readFileSync(shared,'utf8'),'exports.answer=42;');});
 });
 await check('Unsaved dependencies load inside a real fork and enter its snapshot',async()=>{
  const source='process.on("message",()=>process.send(require("./shared.cjs").answer,()=>process.disconnect()));';
  await withSource(child,source,async()=>{const result=await run(fork,{buffers:[{path:shared,source:'exports.answer=43;'}]});assert.equal(result.result,'43');assert.ok(result.project.modules.some(item=>item.path===shared&&item.origin==='editor'));});
 });
 const esmShared=write('shared.mjs','export const answer=42;'),esmWorker=write('worker.mjs','import {parentPort} from "node:worker_threads";import {answer} from "./shared.mjs";parentPort.postMessage(answer);');
 await check('ESM workers preserve native imports and current module buffers',async()=>{const result=await run(thread.replace('./worker.cjs','./worker.mjs'),{buffers:[{path:esmShared,source:'export const answer=43;'}]});assert.equal(result.result,'43');assert.ok(result.project.modules.some(item=>item.path===esmWorker));assert.ok(result.project.modules.some(item=>item.path===esmShared&&item.source==='export const answer=43;'));});
 const esmChild=write('child.mjs','import {answer} from "./shared.mjs";process.on("message",()=>process.send(answer,()=>process.disconnect()));');
 await check('ESM forked programs preserve native imports and current module buffers',async()=>{const result=await run(fork.replace('./child.cjs','./child.mjs'),{buffers:[{path:esmShared,source:'export const answer=43;'}]});assert.equal(result.result,'43');assert.ok(result.project.modules.some(item=>item.path===esmChild));});
 const data=write('input.json','{"answer":42}');
 await check('Worker filesystem input contributes exact source identity',async()=>{
  await withSource(worker,'const {parentPort}=require("node:worker_threads");parentPort.postMessage(JSON.parse(require("node:fs").readFileSync("input.json","utf8")).answer);',async()=>{const result=await compare(thread);assert.ok(result.project.modules.some(item=>item.path===data&&item.sha256===crypto.createHash('sha256').update('{"answer":42}').digest('hex')));});
 });
 write('nested-worker.cjs',workerSource);
 await check('Nested workers inherit their source context and finish natively',async()=>{
  await withSource(worker,'const {Worker,parentPort,workerData}=require("node:worker_threads");const nested=new Worker("./nested-worker.cjs",{workerData});nested.once("message",value=>parentPort.postMessage(value));',async()=>{const result=await compare(thread);assert.equal(result.contexts.length,3);assert.ok(result.project.modules.some(item=>item.name==='nested-worker.cjs'));});
 });
 write('nested-child.cjs',childSource);
 await check('Nested forks retain normal messages and their loaded sources',async()=>{
  await withSource(child,'process.on("message",data=>{const nested=require("node:child_process").fork("./nested-child.cjs");nested.once("message",value=>process.send(value,()=>process.disconnect()));nested.send(data);});',async()=>{const result=await compare(fork);assert.equal(result.contexts.length,3);assert.ok(result.project.modules.some(item=>item.name==='nested-child.cjs'));});
 });
 await check('Forked programs preserve custom environment and hide infrastructure markers',async()=>{
  await withSource(child,'process.on("message",()=>process.send({hello:process.env.HELLO,private:Object.keys(process.env).some(key=>key.startsWith("LT_REVIVAL_NODE")),flags:process.execArgv},()=>process.disconnect()));',async()=>{const source=fork.replace('fork("./child.cjs")','fork("./child.cjs",[],{env:{HELLO:"native"}})').replace('resolve(answer)','resolve(answer.hello==="native"&&!answer.private&&answer.flags.length===0?42:0)');const result=await compare(source);assert.equal(result.result,'42');});
 });
 await check('Worker SHARE_ENV and transferred memory retain native behavior',async()=>{
  const code='const {parentPort,workerData}=require("node:worker_threads");process.env.SHARED_LIGHTTABLE_FIXTURE="changed";parentPort.postMessage(workerData.buffer.byteLength);';
  await withSource(worker,code,async()=>{const source='const {Worker,SHARE_ENV}=require("node:worker_threads");const buffer=new ArrayBuffer(42);process.env.SHARED_LIGHTTABLE_FIXTURE="before";new Promise((resolve,reject)=>{const worker=new Worker("./worker.cjs",{env:SHARE_ENV,workerData:{buffer},transferList:[buffer]});worker.once("error",reject);worker.once("message",value=>{const answer=value===42&&buffer.byteLength===0&&process.env.SHARED_LIGHTTABLE_FIXTURE==="changed"?42:0;console.log("answer:"+answer);resolve(answer);});});';await compare(source);});
 });
 await check('Eval workers retain native user data and an explicit empty argument list',async()=>{const body='require("node:worker_threads").parentPort.postMessage(42)';await compare('const {Worker}=require("node:worker_threads");new Promise((resolve,reject)=>{const worker=new Worker('+JSON.stringify(body)+',{eval:true,execArgv:[],workerData:{answer:42}});worker.once("message",value=>{console.log("answer:"+value);resolve(value)});worker.once("error",reject);});');});
 const stdinChild=write('stdin-child.cjs','let value="";process.stdin.on("data",chunk=>value+=chunk);process.stdin.on("end",()=>console.log(Number(value)*2));');
 await check('Direct Node spawn keeps program stdin intact and tracks its source',async()=>{
  const source='const {spawn}=require("node:child_process");new Promise((resolve,reject)=>{const child=spawn(process.execPath,["stdin-child.cjs"]);let output="";child.stdout.on("data",chunk=>output+=chunk);child.once("error",reject);child.once("close",code=>{if(code)reject(new Error("spawn failed"));else{console.log("answer:"+Number(output));resolve(Number(output));}});child.stdin.end("21");});';const result=await compare(source);assert.ok(result.project.modules.some(item=>item.path===stdinChild));
 });
 const outputChild=write('output-child.cjs','console.log(require("./shared.cjs").answer);');
 await check('execFileSync Node children use unsaved source and dependency buffers',async()=>{const source='Number(require("node:child_process").execFileSync(process.execPath,["output-child.cjs"]).toString());',result=await run(source,{buffers:[{path:shared,source:'exports.answer=43;'}]});assert.equal(result.result,'43');assert.ok(result.project.modules.some(item=>item.path===outputChild));assert.ok(result.project.modules.some(item=>item.path===shared&&item.origin==='editor'));});
 await check('execFile Node callbacks retain native output and loaded sources',async()=>{const source='new Promise((resolve,reject)=>require("node:child_process").execFile(process.execPath,["output-child.cjs"],(error,stdout)=>{if(error)reject(error);else{console.log("answer:"+Number(stdout));resolve(Number(stdout));}}));',result=await compare(source);assert.ok(result.project.modules.some(item=>item.path===outputChild));});
 await check('spawnSync Node results retain native status and loaded sources',async()=>{const source='const output=require("node:child_process").spawnSync(process.execPath,["output-child.cjs"]);console.log("answer:"+Number(output.stdout));Number(output.stdout);',result=await compare(source);assert.ok(result.project.modules.some(item=>item.path===outputChild));});
 await check('Worker errors identify the original worker source',async()=>{
  const code='const value=21;\nthrow new Error("worker source failed");';await withSource(worker,code,async()=>{await assert.rejects(()=>run(thread),error=>error.message.includes('worker source failed')&&error.location?.path===worker&&error.location.line===2&&error.location.source===code);});
 });
 await check('Same-entry worker errors do not apply the root watch instrumentation map',async()=>{
  const source='const {Worker,isMainThread,parentPort}=require("node:worker_threads");if(isMainThread){globalThis.work=new Promise((resolve,reject)=>{const worker=new Worker(__filename);worker.once("error",reject);worker.once("message",resolve);});}else{const value=21;throw new Error("same-entry worker failure");}globalThis.work;',from=source.indexOf('21');
  let failure;try{await run(source,{watches:[{id:'value',from,to:from+2}]});}catch(error){failure=error;}assert.ok(failure);assert.equal(failure.location.path,entry);assert.equal(failure.location.column,source.indexOf('new Error("same-entry')+1);
 });
 await check('Parallel context completion preserves stable project graph identity',async()=>{const source='const {Worker}=require("node:worker_threads");Promise.all([21,21].map(value=>new Promise((resolve,reject)=>{const worker=new Worker("./worker.cjs",{workerData:{value}});worker.once("message",resolve);worker.once("error",reject)}))).then(values=>values[0]);',first=await run(source),second=await run(source);assert.equal(first.result,'42');assert.equal(second.result,'42');assert.equal(first.project.sha256,second.project.sha256);assert.equal(first.contexts.length,3);});
 fs.mkdirSync(path.join(root,'node_modules'),{recursive:true});fs.cpSync(path.resolve(__dirname,'../../deploy/core/node_modules/acorn'),path.join(root,'node_modules/acorn'),{recursive:true});
 await check('A real installed package executes and appears in a worker graph',async()=>{await withSource(worker,'const {parentPort}=require("node:worker_threads");parentPort.postMessage(require("acorn").parse("42",{ecmaVersion:"latest"}).body[0].expression.value);',async()=>{const result=await compare(thread);assert.ok(result.project.packages.some(item=>item.name==='acorn'&&item.version==='8.18.0'));assert.ok(result.project.modules.some(item=>item.name.startsWith('node_modules'+path.sep+'acorn')));});});
 await check('Sequential Node contexts stop at their fixed total limit',async()=>{await assert.rejects(()=>run('for(let index=0;index<33;index++)require("node:child_process").execFileSync(process.execPath,["-e","0"]);42;'),/32 child execution contexts/);const last=node.diagnostics().recent.at(-1);assert.equal(last.memory.contextFilesRemoved,true);assert.equal(last.memory.processExited,true);});
 await check('A worker memory failure remains inside the shared hard quota',async()=>{
  await withSource(worker,'const values=[];while(true)values.push(Buffer.alloc(8*1024*1024,1));',async()=>{await assert.rejects(()=>run(thread));const last=node.diagnostics().recent.at(-1);assert.equal(last.memory.hardPrivateCommit,true);assert.equal(last.memory.processExited,true);assert.equal(last.memory.contextFilesRemoved,true);assert.ok(last.memory.peakJobBytes<=1073741824);});
 });
 await check('Stop destroys a busy worker and clears its private source context',async()=>{
  await withSource(worker,'require("node:worker_threads").parentPort.postMessage("ready");while(true){}',async()=>{let ready;const listening=new Promise(resolve=>ready=resolve),task=node.run(104,{path:entry,source:'const {Worker}=require("node:worker_threads");const worker=new Worker("./worker.cjs");worker.once("message",value=>console.log(value));new Promise(()=>{});'},event=>{if(event.text.includes('ready'))ready();}).then(result=>({result}),error=>({error}));
   let guard;try{await Promise.race([listening,new Promise((_,reject)=>{guard=setTimeout(()=>reject(Error('Own busy worker did not start')),3000);})]);await node.cancel(104);assert.match((await task).error.message,/cancelled/);}finally{clearTimeout(guard);await node.cancel(104);await task;}const last=node.diagnostics().recent.at(-1);assert.equal(last.memory.contextFilesRemoved,true);assert.equal(last.memory.processExited,true);
  });
 });
 assert.equal(node.activeCount(),0);assert.equal(memory.status().jobs,0);
 const report={passed:true,checks,cleanup:{active:node.activeCount(),jobs:memory.status().jobs}};fs.writeFileSync(path.join(policy.root,'node-family-result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:true,checks:checks.length,cleanup:report.cleanup}));
 }finally{await node.shutdown();await memory.stop();if(saved)fs.writeFileSync(projects.statePath,saved);else if(fs.existsSync(projects.statePath))fs.unlinkSync(projects.statePath);}})().catch(error=>{console.error(error);process.exitCode=1;});
