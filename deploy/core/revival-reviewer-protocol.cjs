'use strict';
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const probability=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=1;
function validateRequest(body){
 if(!object(body)||typeof body.model!=='string'||!body.model.trim()||!body.state||!object(body.questions))throw Error('Invalid reviewer request');
 if(Object.keys(body).some(key=>!['model','state','questions','images','keep_alive'].includes(key)))throw Error('Unsupported reviewer request field');
 const questions=Object.values(body.questions);if(!questions.length||questions.length>64)throw Error('Reviewer requires 1–64 questions');
 for(const q of questions){if(!object(q)||!['choice','noul','score'].includes(q.type)||typeof q.instructions!=='string'||!q.instructions.trim())throw Error('Invalid reviewer question');if(q.type==='choice'&&(!object(q.criteria)||Object.keys(q.criteria).length<2||Object.keys(q.criteria).length>24)||q.type==='score'&&(!Array.isArray(q.criteria)||q.criteria.length<2||q.criteria.length>24))throw Error('Invalid reviewer criteria');}
 if(body.images!==undefined&&(!Array.isArray(body.images)||!body.images.length||body.images.length>8||body.images.some(value=>typeof value!=='string'||!value.length||! /^[A-Za-z0-9+/]+={0,2}$/.test(value))))throw Error('Reviewer images must be raw base64');
 if(Buffer.byteLength(JSON.stringify(body))>(body.images?.length?32*1024*1024:64*1024))throw Error('Reviewer request exceeds transport budget');
}
function validateResponse(body,result){
 if(!object(result)||result.error||result.model!==body.model||!object(result.answers)||Object.keys(result.answers).length!==Object.keys(body.questions).length)throw Error('Invalid reviewer response');
 if(result.usage!==undefined&&(!object(result.usage)||['input_tokens','output_tokens'].some(key=>!Number.isInteger(result.usage[key])||result.usage[key]<0)))throw Error('Invalid reviewer token usage');
 for(const [name,q]of Object.entries(body.questions)){
  const a=result.answers[name];if(!object(a)||a.type!==q.type)throw Error('Missing or invalid reviewer answer: '+name);
  if(q.type==='noul'){if(!probability(a.noul))throw Error('Invalid reviewer probability');continue;}
  const keys=q.type==='choice'?Object.keys(q.criteria):q.criteria.map((_,index)=>String(index));
  if(!object(a.probabilities)||Object.keys(a.probabilities).length!==keys.length||keys.some(key=>!probability(a.probabilities[key]))||Math.abs(Object.values(a.probabilities).reduce((sum,value)=>sum+value,0)-1)>.015||!probability(a.confidence))throw Error('Invalid reviewer probability distribution');
  if(q.type==='choice'&&!keys.includes(a.choice)||q.type==='score'&&(!Number.isFinite(a.score)||a.score<0||a.score>keys.length-1))throw Error('Invalid reviewer decision');
 }
}
module.exports={validateRequest,validateResponse};
