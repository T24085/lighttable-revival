'use strict';
const acorn=require('acorn'),mapping=require('@jridgewell/trace-mapping'),html=require('./revival-html-watches.cjs'),javascript=require('./revival-js-locations.cjs');
const declarations=new Set(['var','let','const']),strong=new Set(['name','num','string','regexp','template']);
const tokenValue=token=>typeof token.value==='bigint'?'bigint:'+token.value:JSON.stringify(token.value);
function lineStarts(source){const starts=[0];for(const match of source.matchAll(/\r\n|\r|\n/g))starts.push(match.index+match[0].length);return starts;}
function point(source,starts,line,column){
 if(!Number.isSafeInteger(line)||line<1||line>starts.length||!Number.isSafeInteger(column)||column<0)return -1;
 let end=starts[line]??source.length;while(end>starts[line-1]&&/[\r\n]/.test(source[end-1]))end--;
 const index=starts[line-1]+column;return index<=end?index:-1;
}
function tokens(source,regions=[{from:0,to:source.length}],deadline=Date.now()+1000){
 const found=new Map();let count=0;for(const region of regions)for(const token of acorn.tokenizer(region.source??source.slice(region.from,region.to),{ecmaVersion:'latest',sourceType:'module',locations:true})){if(count++%256===0&&Date.now()>deadline)throw Error('Original source recovery exceeded 1000 ms');found.set(region.toRaw?region.toRaw(token.start):region.from+token.start,token);}return found;
}
function prepare(generated,map,deadline=Date.now()+1000){
 const starts=javascript.lineStarts(generated),generatedTokens=tokens(generated,undefined,deadline),positions=Array.from({length:map.sources.length},()=>[]);let count=0;
 for(const [line,segments] of mapping.decodedMappings(map).entries())for(const segment of segments){if(count++%256===0&&Date.now()>deadline)throw Error('Original source recovery exceeded 1000 ms');if(segment.length>1)positions[segment[1]].push({line:segment[2]+1,column:segment[3],name:segment.length===5?map.names[segment[4]]:null,generated:generatedTokens.get(javascript.point(generated,starts,line+1,segment[0]))});}
 return positions;
}
function recover(original,isHTML,positions,deadline=Date.now()+1000){
 if(typeof original!=='string'||Buffer.byteLength(original)>2*1024*1024)throw Error('Original mapped source exceeds 2 MiB');
 if(!positions?.length)throw Error('The source map has no positions for this original source');
 const scripts=isHTML?html.regions(original):[];if(scripts.length>256)throw Error('Original mapped HTML exceeds 256 inline scripts');
 const candidates=[{from:0,to:original.length,source:original,regions:scripts.length?scripts:undefined},...scripts.map(block=>({...block,body:true}))],matches=[];
 for(const candidate of candidates){
  if(Date.now()>deadline)throw Error('Original source recovery exceeded 1000 ms');
  let originals;try{originals=tokens(candidate.source,candidate.regions,deadline);}catch(error){if(Date.now()>deadline)throw error;continue;}
  const locations=isHTML&&!candidate.body?{lineStarts,point}:javascript,starts=locations.lineStarts(candidate.source),regions=candidate.regions||[{from:0,to:candidate.source.length}];let anchors=0,valid=true;
  for(const [index,position] of positions.entries()){
   if(index%64===0&&Date.now()>deadline)throw Error('Original source recovery exceeded 1000 ms');
   const offset=locations.point(candidate.source,starts,position.line,position.column);if(offset<0||!regions.some(region=>offset>=region.from&&offset<=region.to)){valid=false;break;}
   const originalToken=originals.get(offset),generatedToken=position.generated;if(!originalToken||!generatedToken)continue;
   if(position.name!==null){if(String(originalToken.value??originalToken.type.keyword??originalToken.type.label)!==position.name){valid=false;break;}anchors++;continue;}
   const left=originalToken.type.label,right=generatedToken.type.label;
   if(declarations.has(left)&&declarations.has(right))continue;
   if(left===right&&strong.has(left)){if(tokenValue(originalToken)!==tokenValue(generatedToken)){valid=false;break;}anchors++;}
  }
  if(valid&&anchors)matches.push(candidate);
 }
 if(matches.length!==1)throw Error(matches.length?'The source map does not identify one original source region':'Recovered source does not match the compiler map');
 const selected=matches[0];return {from:selected.from,to:selected.to,body:!!selected.body};
}
module.exports={prepare,recover};
