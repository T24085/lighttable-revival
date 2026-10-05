'use strict';
process.env.LT_REVIVAL_TEST='1';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const policy=require('../../deploy/core/proof-policy.cjs'),projects=require('../../deploy/core/revival-projects.cjs'),node=require('../../deploy/core/revival-node.cjs'),memory=require('../../deploy/core/proof-memory.cjs');
const root=path.join(policy.root,'node-lifecycle-tests',crypto.randomUUID()),saved=fs.existsSync(projects.statePath)?fs.readFileSync(projects.statePath):null,checks=[];
fs.mkdirSync(root,{recursive:true});fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({name:'node-lifecycle-fixture',private:true}));
function vanilla(entry,source){
 // Only fixed, authored test fixtures run here. This is a comparison with the
 // actual Node CLI, not an execution path for project code in the application.
 fs.writeFileSync(entry,source);
 const environment={};for(const name of ['SystemRoot','WINDIR','TEMP','TMP'])if(process.env[name])environment[name]=process.env[name];environment.NO_COLOR='1';
 return new Promise((resolve,reject)=>{const child=spawn(node.discover().executable,[entry],{cwd:root,windowsHide:true,env:environment,stdio:['ignore','pipe','pipe']});let stdout='',stderr='',bytes=0;
  const timeout=setTimeout(()=>{child.kill();reject(Error('Own plain-Node fixture exceeded 3 seconds'));},3000);
  for(const stream of ['stdout','stderr'])child[stream].on('data',data=>{bytes+=data.length;if(bytes>1024*1024){child.kill();reject(Error('Own plain-Node fixture output exceeded 1 MiB'));return;}if(stream==='stdout')stdout+=data;else stderr+=data;});
  child.once('error',error=>{clearTimeout(timeout);reject(error);});child.once('close',code=>{clearTimeout(timeout);resolve({code,stdout,stderr});});
 });
}
const stdout=result=>result.logs.find(value=>value.startsWith('stdout: '))?.slice(8)||'';
async function compare(source,name='index.cjs',expected='42'){
 const entry=path.join(root,name),baseline=await vanilla(entry,source);assert.equal(baseline.code,0,baseline.stderr);
 const result=await node.run(103,{path:entry,source});assert.equal(stdout(result),baseline.stdout);if(expected!==undefined)assert.equal(result.result,expected);
 assert.equal(result.source,source);assert.equal(result.memory.hardPrivateCommit,true);assert.equal(result.memory.processExited,true);assert.equal(node.activeCount(),0);assert.equal(memory.status().jobs,0);return result;
}
async function check(name,fn){try{await fn();checks.push(name);}catch(error){error.message=name+': '+error.message;throw error;}}
(async()=>{try{
 projects.activate(root);
 await check('Project exception/rejection listener counts and CLI IPC match plain Node',async()=>{await compare('console.log(JSON.stringify({exceptions:process.listenerCount("uncaughtException"),rejections:process.listenerCount("unhandledRejection"),send:typeof process.send,connected:typeof process.connected}));42;');});
 const handled='process.once("uncaughtException",(error,origin)=>console.log(JSON.stringify({handled:error.message,origin})));setTimeout(()=>{throw new Error("handled timer failure")},5);42;';
 await check('Project uncaughtException handling preserves native success and output',async()=>{await compare(handled);});
 await check('ESM project exception handling preserves native success and output',async()=>{await compare(handled,'entry.mjs');});
 await check('Project unhandledRejection handler receives the native rejection',async()=>{await compare('process.once("unhandledRejection",(reason,promise)=>console.log(JSON.stringify({handled:reason.message,promise:promise instanceof Promise})));Promise.reject(new Error("handled rejection"));42;');});
 await check('A late Promise catch retains native rejectionHandled ordering',async()=>{await compare('process.on("unhandledRejection",reason=>console.log("unhandled:"+reason.message));process.on("rejectionHandled",()=>console.log("handled-later"));const rejected=Promise.reject(new Error("late"));setImmediate(()=>rejected.catch(()=>console.log("caught")));42;');});
 await check('Uncaught-exception capture callbacks retain native behavior',async()=>{await compare('process.setUncaughtExceptionCaptureCallback(error=>console.log("captured:"+error.message));setTimeout(()=>{throw new Error("capture callback")},5);42;');});
 await check('Project monitor and exception handlers retain native ordering',async()=>{await compare('process.once("uncaughtExceptionMonitor",(error,origin)=>console.log("monitor:"+origin));'+handled);});
 await check('A handler installed by a project monitor can recover the exception',async()=>{await compare('process.once("uncaughtExceptionMonitor",()=>process.once("uncaughtException",error=>console.log("late handler:"+error.message)));setTimeout(()=>{throw new Error("monitor recovery")},5);42;');});
 await check('A removed handler restores native fatal-error reporting and source position',async()=>{
  const source='function ignored(){}\nprocess.on("uncaughtException",ignored);process.removeListener("uncaughtException",ignored);\nsetTimeout(()=>{throw new Error("unhandled timer failure")},5);\n42;',entry=path.join(root,'removed.cjs'),baseline=await vanilla(entry,source);assert.equal(baseline.code,1);
  await assert.rejects(()=>node.run(103,{path:entry,source}),error=>error.message.includes('unhandled timer failure')&&error.location?.path===entry&&error.location.line===3);
 });
 await check('A throwing project exception handler retains fatal exit and its own source',async()=>{
  const source='process.once("uncaughtException",()=>{\n throw new Error("handler failed");\n});setTimeout(()=>{throw new Error("original failure")},5);42;',entry=path.join(root,'handler.cjs'),baseline=await vanilla(entry,source);assert.equal(baseline.code,7);
  await assert.rejects(()=>node.run(103,{path:entry,source}),error=>error.message.includes('Node exited with code 7')&&error.logs.join('\n').includes('handler failed')&&error.location?.path===entry&&error.location.line===2);
 });
 await check('A throwing project exception monitor reports its own fatal failure',async()=>{
  const source='process.once("uncaughtExceptionMonitor",()=>{\n throw new Error("monitor failed");\n});setTimeout(()=>{throw new Error("initial failure")},5);42;',entry=path.join(root,'monitor.cjs'),baseline=await vanilla(entry,source);assert.equal(baseline.code,7);
  await assert.rejects(()=>node.run(103,{path:entry,source}),error=>error.message.includes('Node exited with code 7')&&error.logs.join('\n').includes('monitor failed')&&error.location?.path===entry&&error.location.line===2);
 });
 await check('Unhandled dependency errors retain the loaded original dependency snapshot',async()=>{
  const dependency=path.join(root,'broken.cjs'),source='module.exports=()=>{\n throw new Error("fatal dependency");\n};',entry=path.join(root,'dependency.cjs');fs.writeFileSync(dependency,source);fs.writeFileSync(entry,'');
  await assert.rejects(()=>node.run(103,{path:entry,source:'const fail=require("./broken.cjs");setTimeout(fail,5);42;'}),error=>error.message.includes('fatal dependency')&&error.location?.path===dependency&&error.location.line===2&&error.location.source===source);
 });
 await check('Default unhandled rejection still fails at the original source',async()=>{
  const source='Promise.reject(new Error("default rejection"));\n42;',entry=path.join(root,'rejected.cjs'),baseline=await vanilla(entry,source);assert.equal(baseline.code,1);
  await assert.rejects(()=>node.run(103,{path:entry,source}),error=>error.message.includes('default rejection')&&error.location?.path===entry&&error.location.line===1);
 });
 await check('Native beforeExit work finishes before module exports are captured',async()=>{await compare('module.exports={answer:21};process.once("beforeExit",()=>{module.exports={answer:42};});process.on("exit",()=>console.log(JSON.stringify(module.exports)));','before-exit.cjs','{"answer":42}');});
 await check('Asynchronous beforeExit work completes without report-induced extra events',async()=>{await compare('let exits=0;module.exports={answer:21};process.on("beforeExit",()=>{if(++exits===1)setTimeout(()=>{module.exports={answer:42};},5);else console.log("beforeExit:"+exits);});process.on("exit",()=>console.log(JSON.stringify(module.exports)));','async-before-exit.cjs','{"answer":42}');});
 await check('Explicit successful exit captures source, exports and project exit output',async()=>{await compare('module.exports={answer:42};process.on("exit",code=>console.log("cleanup:"+code));process.exit(0);','explicit-exit.cjs','{"answer":42}');});
 await check('Manually emitted exit events do not capture an unfinished result',async()=>{await compare('module.exports={answer:21};process.on("exit",code=>console.log("exit-event:"+code));process.emit("exit",0);module.exports={answer:42};','manual-exit.cjs','{"answer":42}');});
 await check('An explicit exit reliably transfers a large source snapshot',async()=>{const source='const payload='+JSON.stringify('x'.repeat(512*1024))+';module.exports={answer:42,bytes:payload.length};process.exit(0);';const result=await compare(source,'large-exit.cjs','{"answer":42,"bytes":524288}');assert.equal(result.project.modules.find(item=>item.name==='large-exit.cjs').sha256,crypto.createHash('sha256').update(source).digest('hex'));});
 await check('Explicit nonzero exit preserves the native status and cleanup output',async()=>{
  const source='process.on("exit",code=>console.log("cleanup:"+code));process.exit(3);',entry=path.join(root,'nonzero.cjs'),baseline=await vanilla(entry,source);assert.equal(baseline.code,3);
  await assert.rejects(()=>node.run(103,{path:entry,source}),error=>error.message.includes('Node exited with code 3')&&stdout(error)===baseline.stdout);
 });
 await check('Returned Promise values still resolve and reject as evaluation results',async()=>{
  const entry=path.join(root,'promise.cjs');fs.writeFileSync(entry,'');assert.equal((await node.run(103,{path:entry,source:'new Promise(resolve=>setTimeout(()=>resolve(42),5));'})).result,'42');
  await assert.rejects(()=>node.run(103,{path:entry,source:'Promise.reject(new Error("returned Promise failed"));'}),error=>error.message.includes('returned Promise failed')&&error.location?.path===entry);
 });
 const recent=node.diagnostics().recent;assert.equal(node.activeCount(),0);assert.equal(memory.status().jobs,0);assert.ok(recent.every(item=>item.memory?.processExited));
 const report={passed:true,checks,runtime:node.info(),cleanup:{active:node.activeCount(),jobs:memory.status().jobs}};fs.writeFileSync(path.join(policy.root,'node-lifecycle-result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:true,checks:checks.length,cleanup:report.cleanup}));
 }finally{await node.shutdown();await memory.stop();if(saved)fs.writeFileSync(projects.statePath,saved);else if(fs.existsSync(projects.statePath))fs.unlinkSync(projects.statePath);}})().catch(error=>{console.error(error);process.exitCode=1;});
