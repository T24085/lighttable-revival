'use strict';
const fs=require('fs'),path=require('path'),net=require('net'),crypto=require('crypto'),{spawn}=require('child_process'),readline=require('readline');
const policy=require('./proof-policy.cjs'),memory=require('./proof-memory.cjs');
function runtime(){const executable=process.env.LT_IPYTHON_EXECUTABLE||path.join(require('./revival-runtime-paths.cjs').toolchain(),'repl-python/Scripts/python.exe');if(!path.isAbsolute(executable)||!fs.existsSync(executable))throw Error('IPython client Python was not found. Run script/revival-repl-setup.ps1 or set LT_IPYTHON_EXECUTABLE.');return fs.realpathSync(executable);}
function prepare(options){
 const file=policy.checked(options.connectionFile);if(fs.statSync(file).size>16384)throw Error('Kernel connection file exceeds 16 KiB');let data;try{data=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));}catch(_){throw Error('Choose a valid Jupyter kernel connection JSON file');}
 const ports=['shell_port','iopub_port','stdin_port','control_port','hb_port'];
 if(data.transport!=='tcp'||typeof data.ip!=='string'||!(net.isIP(data.ip)||/^[a-zA-Z0-9.-]{1,253}$/.test(data.ip))||ports.some(key=>!Number.isInteger(data[key])||data[key]<1||data[key]>65535)||new Set(ports.map(key=>data[key])).size!==5||typeof data.key!=='string'||Buffer.byteLength(data.key)>1024||!/^hmac-sha(?:1|224|256|384|512)$/.test(data.signature_scheme))throw Error('Unsupported Jupyter connection settings');
 const connection=Object.fromEntries(['transport','ip','key','signature_scheme',...ports].map(key=>[key,data[key]]));runtime();return {connection,file,label:data.ip+':'+data.shell_port};
}
async function connect(owner,prepared,options,register=()=>{}){
 const target=prepare(options),executable=runtime(),child=spawn(executable,['-I','-S','-u',path.join(__dirname,'revival-ipython-worker.py')],{cwd:__dirname,windowsHide:true,stdio:['pipe','pipe','pipe'],env:{SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR,USERPROFILE:process.env.USERPROFILE,TEMP:process.env.TEMP,TMP:process.env.TMP,PATH:process.env.PATH,PYTHONIOENCODING:'utf-8'}});
 let done=false,connected=false,quota,active,readyResolve,readyReject,lifetime,cleanup,bytes=0,stderr='';
 const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});ready.catch(()=>{});
 const id=crypto.randomUUID(),attachment=memory.attach(child.pid,[],executable);
 const session={owner,root:prepared.root,language:'python',transport:'ipython',identity:target.file,id,
  snapshot:()=>({id,root:prepared.root,language:'python',transport:'ipython',endpoint:target.label,status:done?'stopped':!connected?'connecting':active?'running':'connected',version:'IPython / Jupyter',external:true,memory:null,clientMemory:quota?.metadata||null}),
  finish:async reason=>{
   if(done)return cleanup;done=true;clearTimeout(startup);clearTimeout(lifetime);readyReject(Error(reason));if(active){clearTimeout(active.timer);active.reject(Error(reason));active=null;}
   cleanup=(async()=>{try{quota=await attachment;}catch(_){}if(!child.stdin.destroyed){child.stdin.write(JSON.stringify({stop:true})+'\n');child.stdin.end();}await new Promise(resolve=>{if(child.exitCode!==null)return resolve();const timer=setTimeout(resolve,1000);child.once('exit',()=>{clearTimeout(timer);resolve();});});if(quota)await quota.release();else child.kill();return session.snapshot();})();return cleanup;
  },evaluate:async request=>{
   await ready;if(done)throw Error('IPython connection stopped');if(active)throw Error('IPython is already evaluating');
   return new Promise((resolve,reject)=>{const timer=setTimeout(()=>session.finish('IPython execution exceeded 30000 ms').catch(()=>{}),30000);active={id:request.id,resolve,reject,timer};child.stdin.write(JSON.stringify(request)+'\n',error=>{if(error)session.finish(error.message).catch(()=>{});});});
  }
 };
 const startup=setTimeout(()=>session.finish('IPython connection exceeded 15000 ms').catch(()=>{}),15000);
 const lines=readline.createInterface({input:child.stdout});child.stdout.on('data',chunk=>{bytes+=chunk.length;if(bytes>128*1024*1024)session.finish('IPython transfer exceeds 128 MiB').catch(()=>{});});
 lines.on('line',line=>{try{if(Buffer.byteLength(line)>65536)throw Error('IPython response exceeds 64 KiB');const reply=JSON.parse(line);if(reply.fatal)throw Error(reply.fatal);if(reply.ready){clearTimeout(startup);readyResolve(session.snapshot());return;}if(!active||reply.id!==active.id)throw Error('Unexpected IPython response identity');const request=active;active=null;clearTimeout(request.timer);request.resolve(reply);}catch(error){session.finish(error.message).catch(()=>{});}});
 child.stderr.on('data',chunk=>{stderr=(stderr+chunk.toString()).slice(-4096);});child.on('error',error=>session.finish(error.message).catch(()=>{}));child.on('exit',()=>{if(!done)session.finish('IPython client exited'+(stderr?'\n'+stderr:'')).catch(()=>{});});
 register(session);
 try{quota=await attachment;if(done)throw Error('IPython connection stopped');child.stdin.write(JSON.stringify({connection:target.connection})+'\n');await ready;connected=true;lifetime=setTimeout(()=>session.finish('IPython connection reached its 15-minute limit').catch(()=>{}),900000);return session;}catch(error){await session.finish(error.message);throw error;}
}
module.exports={prepare,runtime,connect};
