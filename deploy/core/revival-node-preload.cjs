'use strict';
// This trusted preload runs before the real Node CLI entry. Waiting for stdin
// is intentional: the parent opens it only after the OS job quota is verified.
const fs=require('node:fs'),path=require('node:path'),context=require('./revival-node-context.cjs');
if(!require('node:worker_threads').isMainThread){context.normalizeArgv(__filename);context.installInheritedWorker();return;}
const rawRead=fs.readFileSync.bind(fs),rawWrite=fs.writeSync.bind(fs);
const inspect=value=>require('node:util').inspect(value,{depth:5,maxArrayLength:100,maxStringLength:4096,customInspect:false,getters:false,colors:false});
const config=JSON.parse(rawRead(0,'utf8'));if(!config||typeof config.root!=='string'||typeof config.key!=='string')throw Error('Invalid Node launch');
context.normalizeArgv(__filename);
let graph=null,snapshots=new Map(),metadata=new Map(),value,captured=false,keepalive,sent=false,evaluationError,uncaughtError;
function capture(result){captured=true;clearInterval(keepalive);keepalive=setInterval(()=>{},25);Promise.resolve(result).then(result=>{value=result;clearInterval(keepalive);},fail);}
Object.defineProperty(globalThis,config.key,{value:capture,configurable:false,writable:false});
function format(value){
 const type=typeof value,complex=value&&type==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null;
 if(value===undefined)return 'undefined';if(type==='number'&&!Number.isFinite(value))return String(value);
 if(['bigint','symbol','function'].includes(type)||complex)return inspect(value);
 const getter=value&&type==='object'&&Object.values(Object.getOwnPropertyDescriptors(value)).some(item=>item.get);if(getter)return inspect(value);
 try{return JSON.stringify(value)??inspect(value);}catch(_){return inspect(value);}
}
let watchValues=new Map();
function report(error){
 if(sent)return;sent=true;
 error=error||watchValues.failure;
 let contexts=[{pid:process.pid,threadId:0}];try{contexts=graph?.collect()||contexts;}catch(failure){error=error||failure;}
 const packages=[...metadata.values()].filter(item=>item.source!==null&&item.path.split(path.sep).includes('node_modules')).flatMap(item=>{try{const json=JSON.parse(item.source.replace(/^\uFEFF/,''));return typeof json.name==='string'?[{name:json.name.slice(0,256),version:String(json.version||'unversioned').slice(0,128),path:path.dirname(item.path),manifest:item.path,sha256:item.sha256}]:[];}catch(_){return [];}});
 let result='undefined';if(!error){try{
  result=format(value);if(Buffer.byteLength(result)>16384)throw Error('Node result exceeds 16 KiB');
 }catch(failure){error=failure;}}
 let configurationLocation=null;try{if(error)configurationLocation=graph?.configurationDiagnostic(error)||context.diagnostic(config,error);}catch(failure){error=error||failure;}
 const message={ltNode:config.key,result,contexts,watches:[...watchValues].map(([id,result])=>({id,result})),snapshots:[...snapshots.values()],metadata:[...metadata.values()],packages,...(error?{error:String(error.message||error).slice(0,2048),stack:String(error.stack||'').slice(0,8192),errorInstrumented:!graph?.isSecondaryError(error),...(configurationLocation?{configurationLocation}:{})}:{})};
 // A synchronous private pipe survives explicit process.exit and fatal Node
 // termination. It adds no IPC channel or beforeExit work to the project.
 // The parent drains it while this process exits and bounds it to 64 MiB.
 try{const bytes=Buffer.from(JSON.stringify(message));if(bytes.length>64*1024*1024)throw Error('Node report exceeds 64 MiB');for(let offset=0;offset<bytes.length;){const count=rawWrite(4,bytes,offset,bytes.length-offset);if(count===0)throw Error('Node report pipe made no progress');offset+=count;}}
 catch(failure){try{rawWrite(2,'Light Table could not capture the Node result: '+String(failure.message||failure).slice(0,2048)+'\n');}catch(_){}if(!process.exitCode)process.exitCode=2;}
 if(message.error&&!process.exitCode)process.exitCode=1;
}
function fail(error){evaluationError=error;clearInterval(keepalive);process.exit(1);}
if(!config.script){
 // Observe fatal exceptions without installing handlers that change Node's
 // default behavior or override a project's own exception/rejection handling.
 process.on('uncaughtExceptionMonitor',error=>{if(!process.hasUncaughtExceptionCaptureCallback()&&!process.listenerCount('uncaughtException'))uncaughtError=error;});
 process.on('exit',code=>{
  // process.emit('exit') is also a legal project event. Only Node's real exit
  // starts termination and sets _exiting, so manual events cannot send an
  // incomplete source/result report or change the project's exit code.
  if(!process._exiting)return;
  if(!captured)value=require.cache[config.entry]?.exports;
  report(evaluationError||(code===0?null:uncaughtError));
 });
 // Configuration can reject before the first metadata snapshot is finalized.
 // Keep the private exit report installed before creating the source hooks.
 try{graph=context.install(config);snapshots=graph.snapshots;metadata=graph.metadata;watchValues=graph.watchValues;}catch(error){context.persistDiagnostic(config,error);throw error;}
}
