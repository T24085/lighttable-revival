'use strict';
// A model's cold load can outlast fetch's implicit header deadline. Chat uses
// untimed local HTTP; explicit discovery deadlines and Stop still abort it.
function localRequest(url,{method,headers,body,signal}){
 return new Promise((resolve,reject)=>{const request=require('node:http').request(url,{method,headers,signal,agent:false},response=>{
  const text=async()=>{const chunks=[];let size=0;for await(const chunk of response){size+=chunk.length;if(size>8*1024*1024)throw Error('Ollama metadata exceeds the transport budget');chunks.push(chunk);}return Buffer.concat(chunks).toString('utf8');};
  resolve({ok:response.statusCode>=200&&response.statusCode<300,status:response.statusCode,body:response,text,json:async()=>JSON.parse(await text())});
 });request.on('error',reject);request.end(body);});
}
function create({baseURL='http://127.0.0.1:11434',fetchImpl=localRequest}={}){
 const endpoint=new URL(baseURL);if(!['127.0.0.1','localhost','[::1]'].includes(endpoint.hostname)||endpoint.protocol!=='http:')throw Error('The assistant uses local Ollama HTTP');
 async function request(route,body,signal){const response=await fetchImpl(new URL('api/'+route,endpoint),{method:body?'POST':'GET',headers:body?{'content-type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,signal});if(!response.ok){const text=(await response.text()).slice(0,2048);throw Error('Ollama '+response.status+': '+text);}return response;}
 const models=async()=>{try{const r=await request('tags',null,AbortSignal.timeout(5000));return (await r.json()).models||[];}catch(error){throw Error('Cannot reach local Ollama. Start Ollama and refresh models. '+error.message);}};
 const show=async(model,{signal}={})=>{const deadline=AbortSignal.timeout(30000),combined=signal?AbortSignal.any([signal,deadline]):deadline;try{return await(await request('show',{model},combined)).json();}catch(error){if(signal?.aborted)throw signal.reason||error;throw Error('Cannot read Ollama model details for '+model+'. Refresh models and try again. '+error.message);}};
 async function chat(body,{signal,onChunk=()=>{}}={}){
  const response=await request('chat',{...body,stream:true},signal);let pending='',complete=false,receivedBytes=0,message={role:'assistant',content:'',thinking:'',tool_calls:[]},receipt={};
  const decoder=new TextDecoder();
  function parse(line){if(!line.trim())return;const chunk=JSON.parse(line);if(!chunk||typeof chunk!=='object'||Array.isArray(chunk)||chunk.done!==undefined&&typeof chunk.done!=='boolean')throw Error('Invalid Ollama stream record');if(chunk.error)throw Error('Ollama: '+chunk.error);if(complete)throw Error('Ollama sent data after completion');const m=chunk.message||{};if(m.content!==undefined&&typeof m.content!=='string'||m.thinking!==undefined&&typeof m.thinking!=='string')throw Error('Invalid Ollama message text');if(m.content)message.content+=m.content;if(m.thinking)message.thinking+=m.thinking;if(m.tool_calls){if(!Array.isArray(m.tool_calls))throw Error('Invalid Ollama tool calls');message.tool_calls.push(...m.tool_calls);}onChunk({content:m.content||'',thinking:m.thinking||''});if(chunk.done===true){complete=true;receipt={doneReason:chunk.done_reason,promptTokens:chunk.prompt_eval_count,outputTokens:chunk.eval_count,totalDuration:chunk.total_duration};}}
  for await(const bytes of response.body){if(signal?.aborted)throw signal.reason||Error('Assistant stopped');receivedBytes+=bytes.length;if(receivedBytes>16*1024*1024)throw Error('Ollama response exceeds the transport budget');pending+=decoder.decode(bytes,{stream:true});let index;while((index=pending.indexOf('\n'))>=0){parse(pending.slice(0,index));pending=pending.slice(index+1);}}
  pending+=decoder.decode();if(pending.trim())parse(pending);if(!complete)throw Error('Ollama response interrupted before completion; no pending actions executed');if(receipt.doneReason==='length')throw Error('Ollama response reached its generation limit; no pending actions executed');
  if(!message.thinking)delete message.thinking;if(!message.tool_calls.length)delete message.tool_calls;return {message,receipt};
 }
 async function unload(model,{signal}={}){if(!model)return;return (await request('generate',{model,keep_alive:0,stream:false},signal?AbortSignal.any([signal,AbortSignal.timeout(30000)]):AbortSignal.timeout(30000))).json();}
 async function decision(body,{signal}={}){
  if(require('./revival-model-policy.cjs').clef(body?.model))throw Error('Clef support is temporarily removed. Choose another decision model or Off.');
  const {validateRequest,validateResponse}=require('./revival-reviewer-protocol.cjs');validateRequest(body);
  const deadline=AbortSignal.timeout(300000),combined=signal?AbortSignal.any([signal,deadline]):deadline;
  try{
   const response=await fetchImpl(new URL('v1/systemone',endpoint),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({keep_alive:0,...body}),signal:combined});
   if(!response.ok)throw Error('Reviewer Ollama '+response.status+': '+(await response.text()).slice(0,2048));
   const result=await response.json();validateResponse(body,result);return result;
  }catch(error){if(signal?.aborted)throw signal.reason||error;if(deadline.aborted)throw Error('Reviewer exceeded the five-minute request deadline. Loading and inference must complete within this limit.');throw error;}
 }
 return {models,show,chat,decision,unload,processes:async()=> (await(await request('ps',null,AbortSignal.timeout(5000))).json()).models||[]};
}
module.exports={create};
