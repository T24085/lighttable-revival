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
module.exports={budget,encoded,recent};
