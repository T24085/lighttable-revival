'use strict';
const watches=require('./proof-watches.cjs');

// Installed in the quota-attached page before project scripts run. The CDP
// binding only carries bounded watch text; it grants no editor or host access.
function install(key,binding,specs,revision,generationAware){
 const send=globalThis[binding],define=Object.defineProperty,stringify=JSON.stringify,finite=Number.isFinite,nativeString=String,NativeError=Error;
 const encode=Function.call.bind(TextEncoder.prototype.encode,new TextEncoder()),set=Function.call.bind(Map.prototype.set),get=Function.call.bind(Map.prototype.get),entries=Function.call.bind(Map.prototype.entries),has=Function.call.bind(Map.prototype.has),clear=Function.call.bind(Map.prototype.clear),remove=Function.call.bind(Map.prototype.delete);
 const allowed=new Map(),values=new Map(),schedule=setTimeout.bind(globalThis),cancel=clearTimeout.bind(globalThis);for(const item of specs)set(allowed,item.id,item.captureToken);
 let bytes=0,timer=null,dirty=false,failure=null;
 delete globalThis[binding];
 function flush(){
  if(timer!==null){cancel(timer);timer=null;}if(!dirty)return;dirty=false;
  const snapshot=[];for(const [id,item] of entries(values))snapshot[snapshot.length]={id,...item};
  send(stringify({values:snapshot,revision,...(failure?{error:failure}:{})}));
 }
 function capture(id,value,captureToken){
  if(failure)throw new NativeError(failure);
  try{
   if(generationAware&&(!has(allowed,id)||get(allowed,id)!==captureToken))return value;
   if(!has(allowed,id))throw new NativeError('Unknown browser expression watch');
   let result;
   try{result=value===undefined?'undefined':typeof value==='function'?'[Function]':typeof value==='bigint'?nativeString(value)+'n':typeof value==='symbol'?nativeString(value):typeof value==='number'&&!finite(value)?nativeString(value):stringify(value);}catch(_){result='[Value cannot be serialized]';}
   if(typeof result!=='string')result=nativeString(value);
   const previous=get(values,id)?.result||'',size=encode(result).byteLength,next=bytes+size-encode(previous).byteLength;
   if(size>1024||next>16384)throw new NativeError('Browser watch values exceed 1 KiB each / 16 KiB total');
   if(get(values,id)?.result!==result){bytes=next;set(values,id,{result,...(generationAware?{captureToken}:{})});dirty=true;if(timer===null)timer=schedule(flush,25);}
   return value;
  }catch(error){failure=nativeString(error.message||error).slice(0,1024);dirty=true;flush();throw error;}
 }
 function update(next,newRevision){if(newRevision<=revision)return;clear(allowed);for(const item of next)set(allowed,item.id,item.captureToken);bytes=0;for(const [id,item] of entries(values)){if(!has(allowed,id)||get(allowed,id)!==item.captureToken)remove(values,id);else bytes+=encode(item.result).byteLength;}revision=newRevision;dirty=true;flush();}
 define(capture,'flush',{value:flush});define(capture,'update',{value:update});define(globalThis,key,{value:capture,writable:false,configurable:false});
}
function configuration(watch){return watch.specs.map(({id,captureToken})=>({id,captureToken}));}
function source(watch,binding){return '('+install.toString()+')('+JSON.stringify(watch.key)+','+JSON.stringify(binding)+','+JSON.stringify(configuration(watch))+','+(watch.revision||0)+','+!!watch.generationAware+')';}
function updateSource(watch){return watch.key+'.update('+JSON.stringify(configuration(watch))+','+watch.revision+')';}
function decode(payload,watch){
 if(typeof payload!=='string'||Buffer.byteLength(payload)>128*1024)throw Error('Browser watch message exceeds 128 KiB');
 const input=JSON.parse(payload);if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid browser watch message');
 if(watch.generationAware&&input.revision!==watch.revision)return null;
 if(input.error!==undefined){if(typeof input.error!=='string'||Buffer.byteLength(input.error)>4096)throw Error('Invalid browser watch failure');throw Error(input.error);}
 const values=watches.validate(input.values,watch);if(watch.generationAware){for(let index=0;index<values.length;index++){const token=watch.specs.find(item=>item.id===values[index].id).captureToken;if(input.values[index].captureToken!==token)throw Error('Browser watch source identity changed');values[index].captureToken=token;}}return values;
}
module.exports={source,updateSource,decode};
