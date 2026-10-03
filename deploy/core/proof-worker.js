'use strict';
(()=>{
const token=__PROOF_TOKEN__,send=self.postMessage.bind(self),stringify=JSON.stringify,evaluate=(0,eval);
const nativeSetTimeout=self.setTimeout.bind(self),nativeClearTimeout=self.clearTimeout.bind(self),resolve=Promise.resolve.bind(Promise),then=Function.call.bind(Promise.prototype.then);
const keys=Object.keys,finite=Number.isFinite,timers=Object.create(null);let finished=false,totalTimers=0,liveTimers=0;
function finish(error,value){if(finished)return;finished=true;const handles=keys(timers);for(let i=0;i<handles.length;i++)nativeClearTimeout(Number(handles[i]));try{if(error){send({token,error:String(error.message||error).slice(0,1024)});return;}const output=typeof value==='undefined'?'undefined':typeof value==='function'?'[Function]':stringify(value);if(typeof output!=='string'||output.length>16384)throw Error('Output exceeds 16 KiB or cannot be serialized');send({token,output});}catch(e){send({token,error:String(e.message||e).slice(0,1024)});}}
function boundedTimeout(callback,delay=0,...args){if(finished)throw Error('Context already completed');if(typeof callback!=='function')throw Error('Timer callback must be a function');if(typeof delay!=='number'||!finite(delay)||delay<0||delay>500)throw Error('Timer delay must be between 0 and 500 ms');if(liveTimers>=32||++totalTimers>128)throw Error('Timer budget exceeded');let handle=nativeSetTimeout(()=>{delete timers[handle];liveTimers--;if(finished)return;try{then(resolve(callback(...args)),()=>{},error=>finish(error));}catch(error){finish(error);}},delay);timers[handle]=true;liveTimers++;return handle;}
function clearBoundedTimeout(handle){if(timers[handle]){delete timers[handle];liveTimers--;nativeClearTimeout(handle);}}
function lock(name,value){for(let target=self;target;target=Object.getPrototypeOf(target)){if(target===self||Object.prototype.hasOwnProperty.call(target,name))try{Object.defineProperty(target,name,{value,writable:false,configurable:false});}catch(_){}}}
for(const name of ['fetch','XMLHttpRequest','WebSocket','importScripts','Worker','SharedWorker','setInterval','indexedDB','caches','navigator'])lock(name,undefined);
lock('setTimeout',boundedTimeout);lock('clearTimeout',clearBoundedTimeout);
self.addEventListener('unhandledrejection',e=>{e.preventDefault();finish(e.reason||Error('Unhandled rejection'));});
self.onmessage=async e=>{self.onmessage=null;try{finish(null,await evaluate(e.data));}catch(error){finish(error);}};
})();
