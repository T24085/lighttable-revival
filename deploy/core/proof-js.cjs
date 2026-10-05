'use strict';
const {BrowserWindow,app}=require('electron');
const crypto=require('crypto'),fs=require('fs'),path=require('path');
const memory=require('./proof-memory.cjs');
const modules=require('./proof-modules.cjs');
const watchSupport=require('./proof-watches.cjs');
const active=new Map(),recent=[];
function cancel(owner){return active.get(owner)?.finish(Error('Execution cancelled'))||Promise.resolve();}
function run(owner,source,options={}){
 const previous=cancel(owner);
 if(typeof source!=='string'||Buffer.byteLength(source)>16384)return Promise.reject(Error('Source exceeds 16 KiB'));
 return new Promise((resolve,reject)=>{
  let w,done=false,timer,monitor,attachment,rendererPid=0,cleanup,compilation,prepared;
  const controller=new AbortController();
  const job={finish,window:null};active.set(owner,job);
  function finish(error,value){
   if(done)return cleanup;
   done=true;controller.abort();clearTimeout(timer);clearInterval(monitor);
   if(!error)try{if(typeof value?.output!=='string'||Buffer.byteLength(value.output)>16384||!Array.isArray(value.logs)||value.logs.length>32||Buffer.byteLength(value.logs.join('\n'))>16384)throw Error('Output exceeds 16 KiB');value.watches=watchSupport.validate(value.watches||[],prepared?.watch);}catch(failure){error=failure;}
   cleanup=(async()=>{
    await previous;
    try{await compilation;}catch(_){}
    let quota,accounting;
    try{quota=await attachment;}catch(attachError){error=error||attachError;}
    if(w&&!w.isDestroyed())w.destroy();
    try{if(quota)accounting=await quota.release();}catch(cleanupError){error=cleanupError;}
    if(active.get(owner)===job)active.delete(owner);
    const limits=quota?{...quota.metadata,...accounting}:null;
    recent.push({rendererPid,passed:!error,error:error?.message,memory:limits});if(recent.length>16)recent.shift();
    if(error)reject(error);
    else resolve({source,sha256:crypto.createHash('sha256').update(source).digest('hex'),result:value.output,logs:value.logs,watches:value.watches,...(prepared?.watch?{watchSnapshot:{specs:prepared.watch.specs,sha256:prepared.watch.sha256}}:{}),mode:prepared?.project?'project-javascript':prepared?.module?'module-javascript':'disposable-javascript',...(prepared?.project?{project:prepared.project}:{}),rendererPid,sandbox:true,nodeIntegration:false,memory:limits});
   })();return cleanup;
  }
  (async()=>{
   await previous;if(done)return;
   compilation=modules.prepare(source,options,controller.signal);prepared=await compilation;if(done)return;
   await memory.start();if(done)return;
   timer=setTimeout(()=>finish(Error('Evaluation startup exceeded 5000 ms budget')),5000);
   const partition='js-proof-'+crypto.randomBytes(16).toString('hex');
   w=new BrowserWindow({show:false,webPreferences:{sandbox:true,nodeIntegration:false,nodeIntegrationInWorker:false,contextIsolation:true,enableRemoteModule:false,webSecurity:true,backgroundThrottling:false,partition}});job.window=w;
   w.webContents.session.webRequest.onBeforeRequest((d,cb)=>cb({cancel:!d.url.startsWith('data:')&&!d.url.startsWith('blob:')}));
   w.webContents.session.setPermissionRequestHandler((_wc,_permission,cb)=>cb(false));
   w.webContents.session.setPermissionCheckHandler(()=>false);
   w.webContents.setWindowOpenHandler(()=>({action:'deny'}));
   w.webContents.on('will-navigate',e=>e.preventDefault());
   w.webContents.on('render-process-gone',(_event,details)=>finish(Error('Evaluation process terminated ('+details.reason+'); memory limit is '+memory.defaultLimitBytes/(1024*1024)+' MiB private commit')));
   const html='<meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; script-src &#39;unsafe-eval&#39; blob:; worker-src blob:; connect-src &#39;none&#39;">';
   await w.loadURL('data:text/html,'+encodeURIComponent(html));if(done)return;
   rendererPid=w.webContents.getOSProcessId();
   const excluded=BrowserWindow.getAllWindows().filter(other=>other!==w).map(other=>other.webContents.getOSProcessId());
   // No user code starts until the separate renderer has a verified OS quota.
   attachment=memory.attach(rendererPid,excluded);
   await attachment;if(done)return;
   // The existing 5s inert-startup deadline also covers trusted worker startup.
   // No authored code is posted until readiness and the OS quota are verified.
   monitor=setInterval(()=>{if(done||w.isDestroyed())return;const metrics=app.getAppMetrics().find(m=>m.pid===rendererPid);if(metrics?.memory?.workingSetSize>memory.defaultLimitBytes/1024)finish(Error('Evaluation exceeded '+memory.defaultLimitBytes/(1024*1024)+' MiB observed working set'));},20);
   const token=crypto.randomBytes(24).toString('hex');
   const worker=fs.readFileSync(path.join(__dirname,'proof-worker.js'),'utf8').replace('__PROOF_TOKEN__',JSON.stringify(token));
   const slot='__lt_worker_'+token;
   const bootstrap=`new Promise((ready,reject)=>{const worker=new Worker(URL.createObjectURL(new Blob([${JSON.stringify(worker)}],{type:'text/javascript'})));let resolveResult,rejectResult;const result=new Promise((resolve,reject)=>{resolveResult=resolve;rejectResult=reject;});result.catch(()=>{});globalThis[${JSON.stringify(slot)}]={worker,result};worker.onmessage=e=>{if(e.data.token!==${JSON.stringify(token)})return;if(e.data.ready===true){ready(true);return;}resolveResult(e.data.error?{error:e.data.error,stack:e.data.stack}:{output:e.data.output,logs:e.data.logs,watches:e.data.watches});};worker.onerror=e=>{const error=Error(e.message);reject(error);rejectResult(error);};worker.postMessage({warmup:${JSON.stringify(token)}});})`;
   clearTimeout(timer);timer=setTimeout(()=>finish(Error('Trusted worker startup exceeded 5000 ms budget')),5000);
   await w.webContents.executeJavaScript(bootstrap);if(done)return;
   clearTimeout(timer);timer=setTimeout(()=>finish(Error('Execution exceeded 1500 ms budget')),1500);
   const host=`(()=>{const key=${JSON.stringify(slot)},job=globalThis[key];job.worker.postMessage(${JSON.stringify({code:prepared.code,module:!!prepared.module,resultExport:prepared.resultExport||'default',watch:prepared.watch?{key:prepared.watch.key,ids:prepared.watch.specs.map(item=>item.id)}:null})});return job.result.finally(()=>{job.worker.terminate();delete globalThis[key];});})()`;
   const value=await w.webContents.executeJavaScript(host);
   if(value?.error)throw modules.runtimeError(prepared,value);
   await finish(null,value);
  })().catch(error=>finish(error));
 });
}
async function shutdown(){await Promise.all([...active.values()].map(job=>job.finish(Error('Application closing'))));await memory.stop();modules.stop();}
module.exports={run,cancel,shutdown,activeCount:()=>active.size,diagnostics:()=>({recent:[...recent],...memory.status()})};
