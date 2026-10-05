'use strict';
const net=require('net'),crypto=require('crypto'),{encode,Decoder}=require('./revival-bencode.cjs');
function endpoint(options){
 const host=options.host||'127.0.0.1',port=Number(options.port);
 if(typeof host!=='string'||host.length>253||!(/^[a-zA-Z0-9.-]+$/.test(host)||net.isIP(host))||!Number.isInteger(port)||port<1||port>65535)throw Error('Enter an nREPL host and port (1–65535)');
 return {host,port,label:host+':'+port};
}
async function connect(owner,prepared,options,register=()=>{}){
 const target=endpoint(options),socket=net.createConnection({host:target.host,port:target.port}),decoder=new Decoder(),requests=new Map(),id=crypto.randomUUID();
 let done=false,connected=false,sessionId,cloneId,closeId,activeEval,lifetime,cleanup,version='nREPL',operations=[];
 function closeSession(){closeId=crypto.randomUUID();socket.write(encode({op:'close',id:closeId,session:sessionId}));}
 const session={owner,root:prepared.root,language:'clojure',transport:'nrepl',identity:target.label,id,
  snapshot:()=>({id,root:prepared.root,language:'clojure',transport:'nrepl',endpoint:target.label,status:done?'stopped':!connected?'connecting':activeEval?'running':'connected',version,external:true,memory:null}),
  finish:async reason=>{
   if(done)return cleanup;done=true;clearTimeout(lifetime);
   if(activeEval&&operations.includes('interrupt'))socket.write(encode({op:'interrupt',id:crypto.randomUUID(),session:sessionId,'interrupt-id':activeEval}));
   if(sessionId)closeSession();
   for(const pending of requests.values()){clearTimeout(pending.timer);pending.reject(Error(reason));}requests.clear();activeEval=null;
   cleanup=new Promise(resolve=>{const timer=setTimeout(()=>{socket.destroy();resolve(session.snapshot());},750);socket.once('close',()=>{clearTimeout(timer);resolve(session.snapshot());});if(!sessionId&&!cloneId)socket.end();});return cleanup;
  },evaluate:async request=>{
   if(done)throw Error('nREPL connection stopped');if(activeEval)throw Error('nREPL is already evaluating');
   const replies=await call('eval',{session:sessionId,code:request.source,file:request.path,'file-name':require('path').basename(request.path),line:1,column:0},30000,true);
   let logs='',value='nil',failure;for(const reply of replies){logs+=(reply.out||'')+(reply.err||'');if(logs.length>32768)throw Error('nREPL output exceeds 32 KiB');if(reply.value!==undefined)value=String(reply.value);if(reply.ex||reply['root-ex']||(reply.status||[]).some(s=>/error|interrupted|need-input/.test(s)))failure=reply.ex||reply['root-ex']||reply.status.join(', ');}
   if(value.length>4096)throw Error('nREPL value exceeds 4 KiB');
   return failure?{error:{message:logs.trim()||failure,line:1,column:1},logs}:{value,logs};
  }
 };
 function call(op,fields={},timeout=10000,evaluation=false){
  const requestId=crypto.randomUUID();if(evaluation)activeEval=requestId;if(op==='clone')cloneId=requestId;
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>session.finish('nREPL '+op+' exceeded '+timeout+' ms').catch(()=>{}),timeout);requests.set(requestId,{resolve,reject,timer,replies:[],bytes:0,evaluation});socket.write(encode({op,id:requestId,...fields}),error=>{if(error)session.finish(error.message).catch(()=>{});});});
 }
 socket.on('data',chunk=>{try{for(const reply of decoder.feed(chunk)){if(reply.status!==undefined&&(!Array.isArray(reply.status)||reply.status.some(value=>typeof value!=='string')))throw Error('Invalid nREPL status');if(done&&reply.id===cloneId&&typeof reply['new-session']==='string'&&reply['new-session'].length<=256){sessionId=reply['new-session'];closeSession();}if(done&&reply.id===closeId&&(reply.status||[]).includes('done')){socket.end();continue;}const pending=requests.get(reply.id);if(!pending)continue;pending.bytes+=Buffer.byteLength(JSON.stringify(reply));if(pending.bytes>1024*1024)throw Error('nREPL response exceeds 1 MiB');pending.replies.push(reply);if((reply.status||[]).includes('need-input'))throw Error('nREPL input requests are not supported; execution was interrupted');if((reply.status||[]).includes('done')){clearTimeout(pending.timer);requests.delete(reply.id);if(pending.evaluation)activeEval=null;pending.resolve(pending.replies);}}}catch(error){session.finish(error.message).catch(()=>{});}});
 socket.on('error',error=>session.finish('nREPL: '+error.message).catch(()=>{}));socket.on('close',()=>{if(!done)session.finish('nREPL connection closed').catch(()=>{});});
 register(session);
 try{
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{reject(Error('nREPL connection exceeded 10000 ms'));socket.destroy();},10000);socket.once('connect',()=>{clearTimeout(timer);resolve();});socket.once('error',error=>{clearTimeout(timer);reject(error);});socket.once('close',()=>{clearTimeout(timer);reject(Error('nREPL connection closed'));});});
  const description=(await call('describe')).find(reply=>reply.ops);if(!description)throw Error('nREPL server did not describe its operations');operations=Array.isArray(description.ops)?description.ops:Object.keys(description.ops);
  if(!['eval','clone','close','interrupt'].every(op=>operations.includes(op)))throw Error('nREPL server must support eval, clone, close and interrupt');
  version='nREPL '+(description.versions?.nrepl?.['version-string']||'external');sessionId=(await call('clone')).find(reply=>reply['new-session'])?.['new-session'];if(typeof sessionId!=='string'||sessionId.length>256)throw Error('nREPL server did not create a session');
  connected=true;lifetime=setTimeout(()=>session.finish('nREPL connection reached its 15-minute limit').catch(()=>{}),900000);return session;
 }catch(error){await session.finish(error.message);throw error;}
}
module.exports={endpoint,connect};
