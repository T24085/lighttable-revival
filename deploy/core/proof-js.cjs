'use strict';
const {BrowserWindow,app}=require('electron');
const crypto=require('crypto');
const active=new Map();
function cancel(owner){const job=active.get(owner);if(job)job.finish(Error('Execution cancelled'));}
function run(owner,source){
 cancel(owner);
 if(typeof source!=='string'||Buffer.byteLength(source)>16384)return Promise.reject(Error('Source exceeds 16 KiB'));
 return new Promise((resolve,reject)=>{
 let rendererPid=0;
 const partition='js-proof-'+crypto.randomBytes(16).toString('hex');
 const w=new BrowserWindow({show:false,webPreferences:{sandbox:true,nodeIntegration:false,nodeIntegrationInWorker:false,contextIsolation:true,enableRemoteModule:false,webSecurity:true,partition}});
 let done=false,timer,monitor;
 const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);clearInterval(monitor);if(active.get(owner)?.window===w)active.delete(owner);if(!w.isDestroyed())w.destroy();error?reject(error):resolve({source,sha256:crypto.createHash('sha256').update(source).digest('hex'),result:value,mode:'disposable-javascript',rendererPid,sandbox:true,nodeIntegration:false});};
 active.set(owner,{window:w,finish});
 w.webContents.session.webRequest.onBeforeRequest((d,cb)=>cb({cancel:!d.url.startsWith('data:')&&!d.url.startsWith('blob:')}));
 w.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 w.webContents.on('will-navigate',e=>e.preventDefault());
 w.webContents.on('render-process-gone',()=>finish(Error('Evaluation process terminated')));
 timer=setTimeout(()=>finish(Error('Execution exceeded 750 ms budget')),750);
 monitor=setInterval(()=>{if(done||w.isDestroyed())return;const pid=w.webContents.getOSProcessId();const metrics=app.getAppMetrics().find(m=>m.pid===pid);if(metrics?.memory?.workingSetSize>192*1024)finish(Error('Evaluation exceeded 192 MiB observed working set'));},20);
 const token=crypto.randomBytes(24).toString('hex');
 const worker=`(()=>{const send=self.postMessage.bind(self), stringify=JSON.stringify, evaluate=(0,eval), token=${JSON.stringify(token)}; self.onmessage=e=>{self.onmessage=null; for(const name of ['fetch','XMLHttpRequest','WebSocket','importScripts','Worker','SharedWorker','setTimeout','setInterval','indexedDB','caches','navigator'])try{Object.defineProperty(self,name,{value:undefined,writable:false,configurable:false});}catch(_){};try{const value=evaluate(e.data);if(value&&typeof value.then==='function')throw Error('Async results are unsupported');let output=typeof value==='undefined'?'undefined':typeof value==='function'?'[Function]':stringify(value);if(typeof output!=='string'||output.length>16384)throw Error('Output exceeds 16 KiB or cannot be serialized');send({token,output});}catch(error){send({token,error:String(error.message||error).slice(0,1024)});}};})();`;
 const host=`new Promise((resolve,reject)=>{const worker=new Worker(URL.createObjectURL(new Blob([${JSON.stringify(worker)}],{type:'text/javascript'})));worker.onmessage=e=>{if(e.data.token!==${JSON.stringify(token)})return;worker.terminate();e.data.error?reject(Error(e.data.error)):resolve(e.data.output);};worker.onerror=e=>{worker.terminate();reject(Error(e.message));};worker.postMessage(${JSON.stringify(source)});})`;
 const html='<meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; script-src &#39;unsafe-eval&#39;; worker-src blob:; connect-src &#39;none&#39;">';
 w.loadURL('data:text/html,'+encodeURIComponent(html)).then(()=>{rendererPid=w.webContents.getOSProcessId();return w.webContents.executeJavaScript(host);}).then(value=>finish(null,value),error=>finish(error));
 });
}
module.exports={run,cancel};
