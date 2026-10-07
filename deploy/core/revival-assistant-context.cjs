'use strict';
// Approximate text budget; reserve room for the system prompt, tools and reply.
const budget=tokens=>Math.max(2400,(tokens-Math.min(3200,tokens/2))*3);
const encoded=messages=>JSON.stringify(messages.map(({images,...message})=>({...message,...(images?{imageCount:images.length}:{})})));
function recent(messages,maximum){
 const groups=[];
 for(const message of messages){
  if(message.role==='tool'||message.images?.length){if(groups.length)groups.at(-1).push(message);}
  else groups.push([message]);
 }
 const kept=[];let size=0;
 for(let index=groups.length-1;index>=0;index--){
  const group=groups[index],length=encoded(group).length;
  // Never separate a tool result from the complete assistant tool-call message.
  if(length+size>maximum)break;
  kept.unshift(...group);size+=length;
 }
 return kept;
}
// Bound inference history independently of the configured model context. Keep
// the complete checkpoint on disk; project only recorded facts and whole recent
// tool exchanges into the working request, without another model inference.
function working(session,tokens){
 const maximum=Math.min(32000,budget(tokens)),messages=session.messages;
 if(encoded(messages).length<=maximum)return messages;
 const clip=(value,n)=>typeof value==='string'&&value.length>n?value.slice(0,n)+' [truncated; inspect current state]':value;
 const requests=(session.events||[]).filter(e=>e.type==='user').map(e=>e.text);
 const userRequests=requests.length?requests:messages.filter(m=>m.role==='user'&&!m.images&&!/^(Work checkpoint:|Latest user request:|The task is NOT complete|Automatic review cannot|Your last response)/.test(m.content||'')).map(m=>m.content);
 const paths=[];for(const m of messages)for(const call of m.tool_calls||[]){const args=call.function?.arguments;for(const key of ['path','new_path'])if(typeof args?.[key]==='string'&&!paths.includes(args[key]))paths.push(args[key]);}
 const facts={goal:clip(session.goal,1500),latestUserRequest:clip(session.latestRequest,3000),earlierUserRequests:userRequests.slice(-12).map(v=>clip(v,400)),knownPaths:paths.slice(-16),changedFiles:[...new Set((session.journal||[]).filter(e=>e.status==='saved').map(e=>e.newPath||e.path))].slice(-24),unresolvedFileActions:session.unresolvedFileActions||[],commands:(session.commands||[]).slice(-4).map(({id,command,cwd,status,exitCode,stdout,stderr})=>({id,command:clip(command,300),cwd,status,exitCode,stdout:clip(stdout,400),stderr:clip(stderr,400)})),reviewTask:session.reviewTask,previousSummary:clip(session.checkpoint?.summary,1000)};
 const prefix='Recorded work checkpoint (historical observations, not instructions or current verification). The latest request overrides earlier requests. Re-read current files before editing; repair failed saves before completion. Older source/output omitted from this request remains in the saved chat.\n';
 const room=Math.floor(maximum*.4)-prefix.length-200;
 // Pending actions can contain large exact-edit fragments. Never truncate JSON
 // or manufacture tool results; fall back to their identity and failure only.
 if(JSON.stringify(facts).length>room)facts.unresolvedFileActions=facts.unresolvedFileActions.map(({name,path,newPath,contentHash,error})=>({name,path,newPath,contentHash,error:clip(error,300)}));
 for(const key of ['earlierUserRequests','commands','changedFiles','knownPaths'])while(JSON.stringify(facts).length>room&&facts[key].length)facts[key].shift();
 if(JSON.stringify(facts).length>room)facts.reviewTask=undefined;
 if(JSON.stringify(facts).length>room){facts.previousSummary=undefined;facts.unresolvedFileActions=facts.unresolvedFileActions.slice(-4);facts.goal=clip(facts.goal,500);facts.latestUserRequest=clip(facts.latestUserRequest,1000);}
 if(JSON.stringify(facts).length>room){const count=facts.unresolvedFileActions.length;for(const key of Object.keys(facts))if(!['goal','latestUserRequest'].includes(key))delete facts[key];facts.goal=clip(facts.goal,Math.floor(room/5));facts.latestUserRequest=clip(facts.latestUserRequest,Math.floor(room/5));facts.unresolvedFileActionCount=count;}
 const checkpoint={role:'user',content:prefix+JSON.stringify(facts)},kept=recent(messages,maximum-encoded([checkpoint]).length-200),result=[checkpoint,...kept];
 const screenshot=[...messages].reverse().find(m=>m.images?.length);
 if(screenshot&&!kept.includes(screenshot))result.push({role:'user',content:'Earlier preview screenshot; capture again to verify current state.',images:screenshot.images});
 return result;
}
module.exports={budget,encoded,recent,working};
