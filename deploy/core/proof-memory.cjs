'use strict';
const {spawn}=require('child_process'),path=require('path'),fs=require('fs'),readline=require('readline'),crypto=require('crypto');
const defaultLimitBytes=1024*1024*1024,jvmLimitBytes=2*defaultLimitBytes;
// Smaller explicit caps remain available to disposable quota-test fixtures.
const allowedLimits=new Set([192*1024*1024,384*1024*1024,512*1024*1024,defaultLimitBytes,jvmLimitBytes]);
let child=null,ready=null,failure=null;const requests=new Map(),jobs=new Set();
function start(){if(failure)return Promise.reject(failure);if(ready)return ready;
 ready=new Promise((resolve,reject)=>{
 let exe;try{exe=require('./revival-runtime-paths.cjs').powershell();}catch(error){failure=error;reject(error);return;}
 function lost(error){failure=error;reject(error);for(const request of requests.values()){clearTimeout(request.timer);request.reject(error);}requests.clear();jobs.clear();}
 if(process.platform!=='win32'||!fs.existsSync(exe)){lost(Error('Existing Windows PowerShell 7 is required for the hard memory quota'));return;}
 const temp=path.join(require('./proof-policy.cjs').root,'memory-helper-temp');fs.mkdirSync(temp,{recursive:true});
 child=spawn(exe,['-NoProfile','-NonInteractive','-File',path.join(__dirname,'proof-memory.ps1')],{windowsHide:true,stdio:['pipe','pipe','pipe'],env:{SystemRoot:process.env.SystemRoot,ProgramFiles:process.env.ProgramFiles,USERPROFILE:process.env.USERPROFILE,PATH:process.env.PATH,TEMP:temp,TMP:temp,POWERSHELL_TELEMETRY_OPTOUT:'1'}});
 const current=child;let errors='';const timeout=setTimeout(()=>{lost(Error('Memory limiter startup timed out'));current.kill();},5000);
 readline.createInterface({input:current.stdout}).on('line',line=>{try{const reply=JSON.parse(line);if(reply.ready){clearTimeout(timeout);resolve();return;}const request=requests.get(reply.id);if(!request)return;requests.delete(reply.id);clearTimeout(request.timer);reply.ok?request.resolve(reply):request.reject(Error(reply.error));}catch(_){lost(Error('Invalid memory limiter response'));current.kill();}});
 current.stderr.on('data',b=>{errors=(errors+b.toString()).slice(-2048)});
 current.on('error',error=>{clearTimeout(timeout);lost(error)});current.on('exit',()=>{clearTimeout(timeout);lost(Error('Memory limiter stopped'+(errors?': '+errors:'')));});
 });return ready;
}
async function command(op,id,pid,executable=process.execPath,details={}){await start();if(!child||child.exitCode!==null||child.killed)throw Error('Memory limiter unavailable');return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{requests.delete(id);reject(Error('Memory limiter did not respond'));if(child)child.kill();},4000);requests.set(id,{resolve,reject,timer});child.stdin.write(JSON.stringify({...details,op,id,pid,executable})+'\n',error=>{if(error){clearTimeout(timer);requests.delete(id);reject(error);}});});}
async function attach(pid,excluded=[],executable=process.execPath,options={}){if(!options||typeof options!=='object'||Array.isArray(options))throw Error('Invalid memory quota options');const limitBytes=options.limitBytes===undefined?defaultLimitBytes:options.limitBytes;if(!Number.isInteger(limitBytes)||!allowedLimits.has(limitBytes))throw Error('Memory quota must be 192, 384, 512, 1024 or 2048 MiB');if(!Number.isInteger(pid)||pid<=0||pid===process.pid||excluded.includes(pid))throw Error('Quota target is not a separate evaluation process');if(typeof executable!=='string'||!path.isAbsolute(executable)||!fs.statSync(executable).isFile())throw Error('Invalid quota executable');const id=crypto.randomBytes(16).toString('hex'),metadata=await command('attach',id,pid,executable,{limitBytes});if(!metadata.hardPrivateCommit||metadata.limitBytes!==limitBytes)throw Error('Hard quota was not verified');jobs.add(id);let release;
 return {metadata,peer:(address,serverPort,clientPort)=>{if(release)throw Error('The npm quota is closing');return command('peer',crypto.randomBytes(16).toString('hex'),undefined,process.execPath,{job:id,address,serverPort,clientPort});},release:()=>release||(release=command('release',id).then(reply=>{jobs.delete(id);if(!reply.processExited)throw Error('Evaluation process did not exit');return reply;}))};
}
function stop(){const current=child;if(!current||current.exitCode!==null||current.signalCode!==null){if(child===current)child=null;return Promise.resolve(true);}return new Promise(resolve=>{const timeout=setTimeout(()=>current.kill(),1000);current.once('exit',()=>{clearTimeout(timeout);if(child===current)child=null;resolve(true);});current.stdin.end();});}
module.exports={defaultLimitBytes,jvmLimitBytes,start,attach,stop,status:()=>({jobs:jobs.size,pending:requests.size,helperPid:child?.pid||null})};
