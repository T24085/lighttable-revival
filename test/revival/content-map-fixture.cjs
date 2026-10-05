'use strict';
// Real compiler output; immutable original HTTP versions belong to each map.
// The npm fixture uses normal launch flags and releases each compiler service.
const http=require('http'),fs=require('fs'),zlib=require('zlib'),compiler=require('../../deploy/core/node_modules/esbuild'),html=require('../../deploy/core/revival-html-watches.cjs'),trace=require('../../deploy/core/node_modules/@jridgewell/trace-mapping'),codec=require('../../deploy/core/node_modules/@jridgewell/sourcemap-codec');
const maps=new Map(),originals=new Map(),compiled=new Map(),initial=fs.readFileSync('original/helper.mjs','utf8');let next=0,builds=Promise.resolve(),redirectHits=0;
function compile(source,file){const key=file+'\0'+source;if(compiled.has(key))return Promise.resolve(compiled.get(key));const pending=builds.then(async()=>{if(compiled.has(key))return compiled.get(key);try{const result=await compiler.transform(source,{loader:'js',sourcefile:file,format:'esm',sourcemap:'external',banner:'// recovered-original compiler header'});compiled.set(key,result);return result;}finally{await compiler.stop();}});builds=pending.catch(()=>{});return pending;}
function send(response,value,type='application/javascript'){response.writeHead(200,{'content-type':type,'content-encoding':'gzip'});response.end(zlib.gzipSync(Buffer.from(value)));}
async function generated(mode,index){
 const isHTML=mode.kind==='html',authored=fs.readFileSync(isHTML?'inline.html':'original/helper.mjs','utf8'),blocks=isHTML?html.blocks(authored):null,sources=isHTML?(mode.bundle?blocks: [blocks[index]]).map(block=>block.source):[mode.content==='stale'?initial:authored],results=[];
 for(const source of sources)results.push(await compile(source,isHTML?'inline.html':'helper.mjs'));
 const token=String(++next),sourceURL=(isHTML?'inline.html':'original/helper.mjs')+'?token='+token,raws=results.map((result,ordinal)=>{const raw=JSON.parse(result.map);raw.sourceRoot=mode.content==='outside'?'':'../';raw.sources=[mode.content==='outside'?mode.outside:mode.content==='unknown'?null:sourceURL];delete raw.sourcesContent;if(mode.nullContents)raw.sourcesContent=[null];if(mode.fullDocument){const block=blocks[mode.bundle?ordinal:index],point=html.originalLocation(authored,block.from),decoded=trace.decodedMappings(new trace.TraceMap(raw));for(const line of decoded)for(const segment of line)if(segment.length>1){if(segment[2]===0)segment[3]+=point.column;segment[2]+=point.line-1;}raw.mappings=codec.encode(decoded);}return raw;});
 let code=results.map(item=>item.code).join(''),raw=raws[0];
 if(mode.bundle){const decoded=[],names=[];let lineOffset=0;for(const [index,result] of results.entries()){const nameOffset=names.length;names.push(...raws[index].names);for(const [line,segments] of trace.decodedMappings(new trace.TraceMap(raws[index])).entries()){decoded[lineOffset+line]||=[];for(const segment of segments){const copy=segment.slice();if(copy.length>1)copy[1]=index;if(copy.length===5)copy[4]+=nameOffset;decoded[lineOffset+line].push(copy);}}lineOffset+=result.code.split('\n').length-1;}for(let index=0;index<decoded.length;index++)decoded[index]||=[];raw={version:3,sourceRoot:'../',sources:raws.map(item=>item.sources[0]),names,mappings:codec.encode(decoded)};if(mode.nullContents)raw.sourcesContent=raw.sources.map(()=>null);}
 maps.set(token,raw);originals.set(token,{source:authored,mode});
 return code+'\n//# sourceMappingURL='+(mode.inline?'data:application/json;base64,'+Buffer.from(JSON.stringify(raw)).toString('base64'):'/maps/source.map?token='+token);
}
http.createServer(async(request,response)=>{try{
 const url=new URL(request.url,'http://fixture'),mode=JSON.parse(fs.readFileSync('mode.json','utf8'));
 if(url.pathname==='/'){
  if(mode.kind==='html'){let source=fs.readFileSync('inline.html','utf8');const blocks=html.blocks(source);for(let index=blocks.length-1;index>=0;index--){const block=blocks[index];source=source.slice(0,block.from)+(mode.bundle?(index===0?'import "/compiled.mjs?index=0";':''):'import "/compiled.mjs?index='+index+'";')+source.slice(block.to);}send(response,source,'text/html');}
  else send(response,'<!doctype html><title>Recovered compiler sources</title><output id="value">Ready</output><script type="module">import "/compiled.mjs";document.querySelector("#value").textContent=String(calcResult);</script>','text/html');
 }else if(url.pathname==='/compiled.mjs')send(response,await generated(mode,Number(url.searchParams.get('index')||0)));
 else if(url.pathname==='/maps/source.map')send(response,JSON.stringify(maps.get(url.searchParams.get('token'))),'application/json');
 else if(['/original/helper.mjs','/inline.html'].includes(url.pathname)){
  const original=originals.get(url.searchParams.get('token'));if(!original){response.writeHead(404);response.end();return;}
  if(original.mode.content==='fallback'){response.writeHead(404);response.end();}
  else if(original.mode.content==='linked')send(response,'globalThis.generatedOnly=true;\n//# sourceMappingURL=/maps/unused.map');
  else if(original.mode.content==='redirect'){response.writeHead(302,{location:'/redirect-target'});response.end();}
  else if(original.mode.content==='delay'){console.log('ORIGINAL_DELAY '+url.searchParams.get('token'));setTimeout(()=>{if(!response.destroyed)send(response,original.source);},2500);}
  else send(response,original.source+(original.mode.content==='oversized'?'\n/*'+ 'x'.repeat(2*1024*1024)+'*/':''),url.pathname.endsWith('.html')?'text/html':'application/javascript');
 }else if(url.pathname==='/redirect-target'){redirectHits++;send(response,initial);}
 else if(url.pathname==='/stats')send(response,JSON.stringify({redirectHits}),'application/json');
 else{response.writeHead(404);response.end();}
 }catch(error){console.error(error);if(!response.headersSent)response.writeHead(500);response.end(error.message);}
}).listen(0,'127.0.0.1',function(){console.log('READY http://127.0.0.1:'+this.address().port);});
