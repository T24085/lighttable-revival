'use strict';
const acorn=require('acorn'),mapping=require('@jridgewell/trace-mapping');
const limits=Object.freeze({bytes:6*1024*1024,sources:1024,sections:128,depth:8,positions:250000,lines:100000,requestMs:1000});
function reference(source,headers={}){
 const header=headers.sourcemap??headers['x-sourcemap'];
 if(header!==undefined){if(typeof header!=='string'||!header.trim())throw Error('Invalid SourceMap header');return header.trim();}
 // Only trailing single-line comments are annotations. Strings, regexes,
 // template bodies and annotations followed by executable code are not links.
 let result=null;
 try{const tokens=acorn.tokenizer(source,{ecmaVersion:'latest',sourceType:'module',onComment:(block,text)=>{result=block?null:text.match(/^[#@]\s*sourceMappingURL\s*=\s*([^\s'"`]+)\s*$/)?.[1]||result;}});
  for(;;){const token=tokens.getToken();if(token.type.label==='eof')return result;result=null;}
 }catch(_){return null;}
}
function inline(address){
 const match=address.match(/^data:application\/json(?:;charset=[^;,]+)?(;base64)?,(.*)$/is);if(!match)throw Error('Unsupported inline source map');
 if(match[2].length>limits.bytes*4/3+4)throw Error('Source map exceeds 6 MiB');
 if(match[1]&&!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(match[2]))throw Error('Invalid source map base64');
 return match[1]?Buffer.from(match[2],'base64').toString('utf8'):decodeURIComponent(match[2]);
}
function parse(text,base){
 if(Buffer.byteLength(text)>limits.bytes)throw Error('Source map exceeds 6 MiB');
 // Some HTTP servers protect JSON with the conventional anti-XSSI first line.
 const value=JSON.parse(text.replace(/^\uFEFF/,'').replace(/^\)\]\}'[^\r\n]*(?:\r\n|\r|\n)/,''));
 const pending=[{map:value,depth:0}];let sources=0,sections=0,positions=0;
 while(pending.length){const {map,depth}=pending.pop();if(!map||typeof map!=='object'||Array.isArray(map)||map.version!==3)throw Error('Invalid version 3 source map');
  if(depth>limits.depth)throw Error('Source map exceeds 8 nested sections');
  if(map.sections!==undefined){if(!Array.isArray(map.sections))throw Error('Invalid source map sections');let previous;
   for(const section of map.sections){const offset=section?.offset;if(!offset||!Number.isSafeInteger(offset.line)||offset.line<0||!Number.isSafeInteger(offset.column)||offset.column<0||offset.line>=limits.lines||offset.column>8*1024*1024)throw Error('Invalid source map section offset');
    if(previous&&(offset.line<previous.line||offset.line===previous.line&&offset.column<=previous.column))throw Error('Source map sections must be ordered');previous=offset;
    if(++sections>limits.sections)throw Error('Source map exceeds 128 sections');pending.push({map:section.map,depth:depth+1});
   }
  }else{
   if(!Array.isArray(map.sources)||map.sources.some(item=>item!==null&&typeof item!=='string')||typeof map.mappings!=='string'||map.names!==undefined&&(!Array.isArray(map.names)||map.names.some(item=>typeof item!=='string'))||map.sourceRoot!==undefined&&typeof map.sourceRoot!=='string')throw Error('Invalid source map fields');
   if(map.sourcesContent!==undefined&&(!Array.isArray(map.sourcesContent)||map.sourcesContent.some(item=>item!==null&&typeof item!=='string')))throw Error('Invalid original source contents');
   if(!/^[A-Za-z0-9+/;,]*$/.test(map.mappings))throw Error('Invalid encoded source map mappings');
   positions+=map.mappings.split(/[;,]/).length;if(positions>limits.positions)throw Error('Source map exceeds 250000 mapping positions');
   if(map.mappings.split(';').length>limits.lines)throw Error('Source map exceeds 100000 generated lines');
   sources+=map.sources.length;if(sources>limits.sources)throw Error('Source map exceeds 1024 sources');
  }
 }
 const result=new mapping.AnyMap(value,base),decoded=mapping.decodedMappings(result);if(decoded.length>limits.lines)throw Error('Source map exceeds 100000 generated lines');
 // The tracer resolves null like an empty URL. Preserve unknown originals,
 // including their flattened ordinal in indexed maps, instead of the base URL.
 const leaves=[value];let originalIndex=0;while(leaves.length){const leaf=leaves.pop();if(leaf.sections){for(let index=leaf.sections.length-1;index>=0;index--)leaves.push(leaf.sections[index].map);}else for(const source of leaf.sources){if(source===null){result.sources[originalIndex]=null;result.resolvedSources[originalIndex]=null;}originalIndex++;}}
 for(const line of decoded)for(const segment of line){if(![1,4,5].includes(segment.length)||segment.some(item=>!Number.isSafeInteger(item)||item<0)||segment.length>1&&(segment[1]>=result.sources.length||segment.length===5&&segment[4]>=result.names.length))throw Error('Invalid decoded source map position');}
 return result;
}
module.exports={reference,inline,parse,limits};
