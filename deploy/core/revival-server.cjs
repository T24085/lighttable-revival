'use strict';
const http=require('http'),path=require('path'),fs=require('fs'),crypto=require('crypto');
const npm=require('./revival-npm.cjs'),policy=require('./proof-policy.cjs'),watchSupport=require('./proof-watches.cjs'),sourceMaps=require('./revival-source-maps.cjs'),sourceViews=require('./revival-map-sources.cjs'),sourceRecovery=require('./revival-map-recovery.cjs');
const limits=Object.freeze({resourceBytes:8*1024*1024,captureBytes:32*1024*1024,networkBytes:128*1024*1024,files:256,concurrent:32,connections:64,requestMs:5000,uploadBytes:8*1024*1024,originalBytes:8*1024*1024,originalFiles:256,originalRequestMs:1000});
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const inside=(file,root)=>{const relative=path.relative(root,file);return relative===''||!path.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith('..'+path.sep);};
async function create(owner,options={}){
 const live=require('./revival-assistant-servers.cjs').server(owner,options.serverId)||npm.server(owner,options.serverId),state=live.state,root=state.root;
 const watcher=require('./revival-server-watches.cjs').create(root,options.watchFiles||[],file=>policy.checked(file));
 const candidates=options.url?[options.url]:[...new Set(state.output.stdout.match(/http:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):\d+(?:\/[^\s<>"']*)?/g)||[])];
 if(!candidates.length)throw Error('Wait for the development server to print its HTTP loopback URL.');
 const sockets=new Set(),recoveries=new Set(),captures=new Map(),maps=new WeakMap(),mapOriginals=new WeakMap(),originals=new Map(),instruments=new WeakMap(),inlineSources=new Map(),listeners=new Set(),watchListeners=new Set();let target,origin,server,closed=false,enabled=false,bytes=0,captureBytes=0,originalBytes=0,pending=0,unsubscribe,lastFailure,closing,lastBindings='';
 function changedWatches(){const encoded=JSON.stringify(watcher.bindings());if(encoded!==lastBindings){lastBindings=encoded;for(const listener of watchListeners)listener();}}
 const own=socket=>{if(sockets.size>=limits.connections){socket.destroy();throw Error('Server preview exceeds 64 TCP connections');}sockets.add(socket);socket.once('close',()=>sockets.delete(socket));return socket;};
 const count=chunk=>{bytes+=chunk.length;if(bytes>limits.networkBytes)throw Error('Server preview exceeded 128 MiB network traffic.');};
 const headers=(input={})=>{const result={...input,host:target.host,'accept-encoding':'identity'};delete result['content-length'];if(input['content-length'])result['content-length']=input['content-length'];if(result.origin===origin)result.origin=target.origin;if(result.referer?.startsWith(origin+'/'))result.referer=target.origin+result.referer.slice(origin.length);return result;};
 async function request(url,{method='GET',inputHeaders={},input=null,signal}={}){
  if(closed)throw Error('Development server preview stopped.');signal?.throwIfAborted();const parsed=new URL(url);if(parsed.origin!==target.origin)throw Error('Server request leaves the selected origin.');
  const socket=own(await live.connect(parsed.href));if(closed||signal?.aborted){socket.destroy();if(signal?.aborted)signal.throwIfAborted();throw Error('Development server preview stopped.');}
  // The HTTP request uses the very TCP connection whose receiving process was
  // checked against the held npm Job. No URL/PID hint authorizes a new socket.
  const agent=new http.Agent({keepAlive:false});agent.createConnection=()=>socket;
  return new Promise((resolve,reject)=>{
   const outbound=http.request(parsed,{method,headers:headers(inputHeaders),agent,signal},response=>resolve({response,outbound,agent}));
   outbound.setTimeout(limits.requestMs,()=>outbound.destroy(Error('Server response exceeded 5000 ms')));outbound.once('error',error=>{agent.destroy();reject(error);});
   if(input){let uploaded=0;input.on('data',chunk=>{uploaded+=chunk.length;try{count(chunk);if(uploaded>limits.uploadBytes)throw Error('Server request body exceeds 8 MiB');}catch(error){input.unpipe(outbound);outbound.destroy(error);}});input.once('error',error=>outbound.destroy(error));input.pipe(outbound);}else outbound.end();
  });
 }
 function stream(result){const response=result.response,encoding=String(response.headers['content-encoding']||'identity').toLowerCase(),zlib=require('zlib');response.on('data',chunk=>{try{count(chunk);}catch(error){response.destroy(error);}});
  const decoder=encoding==='gzip'?zlib.createGunzip():encoding==='br'?zlib.createBrotliDecompress():encoding==='deflate'?zlib.createInflate():null;if(!decoder&&encoding!=='identity')throw Error('Unsupported server content encoding: '+encoding);
  if(decoder){response.once('error',error=>decoder.destroy(error));return response.pipe(decoder);}return response;
 }
 async function body(result,maximum=limits.resourceBytes,reason='Server resource exceeds 8 MiB'){let size=0;const chunks=[];try{for await(const chunk of stream(result)){size+=chunk.length;if(size>maximum)throw Error(reason);chunks.push(chunk);}return Buffer.concat(chunks,size);}finally{result.agent.destroy();}}
 try{
  for(const candidate of candidates){try{
   target=new URL(candidate);if(target.hash)target.hash='';const result=await request(target.href),value=await body(result),type=String(result.response.headers['content-type']||'');
   if(result.response.statusCode!==200||!/^text\/html\b/i.test(type))throw Error('The development URL did not return HTML.');target.html=value.toString('utf8');break;
  }catch(error){lastFailure=error;target=null;}}
  if(!target)throw lastFailure;
  function fileFor(resource){try{const pathname=decodeURIComponent(new URL(resource,origin).pathname);if(/[\\:\x00]/.test(pathname))return null;const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));if(!inside(file,root))return null;return fs.statSync(policy.checked(file)).isFile()?file:null;}catch(_){return null;}}
  function sourceFile(address){try{if(address.startsWith('file:')){const file=policy.checked(require('url').fileURLToPath(address));return inside(file,root)?file:null;}const url=new URL(address,origin);return [origin,target.origin].includes(url.origin)&&!url.username&&!url.password?fileFor(origin+url.pathname+url.search):null;}catch(_){return null;}}
  function sourceHash(resource){try{const file=fileFor(resource);if(!file||fs.statSync(file).size>limits.originalBytes)return null;return hash(fs.readFileSync(file));}catch(_){return null;}}
  function record(resource,value,type,requestedHash=sourceHash(resource)){
   if(value.length>limits.resourceBytes)throw Error('Server resource exceeds 8 MiB');const key=new URL(resource,origin).pathname+new URL(resource,origin).search,old=captures.get(key);
   captureBytes-=old?.byteLength||0;captures.delete(key);
   while(captures.size>=limits.files||captureBytes+value.length>limits.captureBytes){const first=captures.keys().next().value;if(first===undefined)throw Error('Server snapshots exceed 32 MiB');captureBytes-=captures.get(first).byteLength;captures.delete(first);}
   const text=/^(text\/|application\/(?:json|javascript)|image\/svg)/i.test(type),file=fileFor(resource),item={path:file,name:key,exists:true,origin:'http',source:text?value.toString('utf8'):null,sha256:hash(value),sourceSha256:requestedHash===sourceHash(resource)?requestedHash:null,byteLength:value.length,type};captures.set(key,item);captureBytes+=value.length;
   return item;
  }
  function retainOriginal(file,address,source){
   if(closed)throw Error('Development server preview stopped.');
   const sha256=hash(source),key=(file?file.toLowerCase():address)+':'+sha256,size=Buffer.byteLength(source);
   if(!originals.has(key)){while(originals.size>=limits.originalFiles||originalBytes+size>limits.originalBytes){const oldest=originals.keys().next().value;if(oldest===undefined)throw Error('Original source snapshots exceed 8 MiB');originalBytes-=originals.get(oldest).byteLength;originals.delete(oldest);}originals.set(key,{path:file,source,sha256,byteLength:size});originalBytes+=size;}
   return {key,sha256,byteLength:size};
  }
  async function installMap(item,map,details){
   const contexts=new Map(),descriptions=[],missing=map.sources.some((_value,index)=>typeof map.sourcesContent?.[index]!=='string'),controller=missing?new AbortController():null,deadline=Date.now()+limits.originalRequestMs;
   const recoveryTimer=missing?setTimeout(()=>controller.abort(Error('Original source recovery exceeded 1000 ms')),limits.originalRequestMs):null;let positions,prepareError;
   if(controller)recoveries.add(controller);if(missing)try{positions=sourceRecovery.prepare(item.source,map,deadline);}catch(error){prepareError=error.message;}
   try{
   for(let index=0;index<map.sources.length;index++){
    const address=map.resolvedSources[index],embedded=map.sourcesContent?.[index],file=sourceFile(address);
    if(typeof embedded!=='string'){
     let upstream;try{
      if(closed)throw Error('Development server preview stopped.');if(prepareError)throw Error(prepareError);if(typeof address!=='string')throw Error('Original source URL is unknown');
      if(Date.now()>deadline)throw Error('Original source recovery exceeded 1000 ms');
      const disk=()=>{if(!file)throw Error('Original source is not an available project file');return require('./proof-packages.cjs').readText(policy.checked(file),2*1024*1024,'Original mapped source exceeds 2 MiB');};
      let source,sourceOrigin='project';
      const url=new URL(address,origin);
      if(url.protocol==='file:'){if(!file)throw Error('Original source leaves the selected project');source=disk();}
      else{
       if(![origin,target.origin].includes(url.origin)||url.username||url.password)throw Error('Original source leaves the selected server origin');
       url.hash='';url.protocol=target.protocol;url.host=target.host;
       upstream=await request(url.href,{signal:controller.signal});
       if(upstream.response.statusCode===404&&file){upstream.agent.destroy();source=disk();}
       else{
        if(upstream.response.statusCode!==200)throw Error('Original source returned HTTP '+upstream.response.statusCode);
        const value=await body(upstream,2*1024*1024,'Original mapped source exceeds 2 MiB'),type=String(upstream.response.headers['content-type']||'');
        if(!/^(?:text\/|application\/(?:javascript|ecmascript|typescript))/i.test(type))throw Error('Original source is not a text response');
        source=value.toString('utf8');if(!Buffer.from(source,'utf8').equals(value))throw Error('Original source is not valid UTF-8');sourceOrigin='http';
        // A dev server may transform the original URL as well. Its map-linked
        // response is generated code, so use the checked authored file instead.
        if(sourceMaps.reference(source,upstream.response.headers)){source=disk();sourceOrigin='project';}
       }
      }
      const isHTML=/\.html?$/i.test(file||new URL(address,origin).pathname);let region;
      try{region=sourceRecovery.recover(source,isHTML,positions[index],deadline);}catch(error){
       if(!isHTML||sourceOrigin!=='http'||!file)throw error;
       const authored=disk();region=sourceRecovery.recover(authored,true,positions[index],deadline);source=authored;sourceOrigin='project';
      }
      // A source endpoint can expose only an HTML script body. Preserve the
      // full authored document for editor coordinates, just as embedded bodies.
      if(isHTML&&sourceViews.scriptBody(source)&&file){const authored=disk(),view=sourceViews.view(authored,source,true);if(view.status!=='matched'||!view.body)throw Error(view.reason||'Recovered HTML body is not unique');source=authored;region={from:view.from,to:view.to,body:true};sourceOrigin='http+project';}
      const retained=retainOriginal(file,address,source);contexts.set(index,{...retained,...region,recovered:true});descriptions.push({path:file,url:address,sha256:retained.sha256,byteLength:retained.byteLength,status:'captured',kind:region.body?'recovered-body':'recovered',origin:sourceOrigin});
     }catch(error){upstream?.agent.destroy();const reason=error.cause?.message||error.message;contexts.set(index,{reason});descriptions.push({path:file,url:address,status:'unavailable',kind:'recovered',reason});}
     continue;
    }
    if(!file||! /\.html?$/i.test(file)||!sourceViews.scriptBody(embedded)){if(file)descriptions.push({path:file,url:address,sha256:hash(embedded),byteLength:Buffer.byteLength(embedded),status:'captured',kind:'embedded',origin:'source-map'});continue;}
    try{
     const source=require('./proof-packages.cjs').readText(policy.checked(file),2*1024*1024,'Original HTML source exceeds 2 MiB'),view=sourceViews.view(source,embedded,true);
     if(view.status!=='matched'||!view.body)throw Error(view.reason||'The map does not identify an original inline script');
     const retained=retainOriginal(file,address,source);contexts.set(index,retained);descriptions.push({path:file,sha256:retained.sha256,byteLength:retained.byteLength,status:'captured',kind:'script-body'});
    }catch(error){contexts.set(index,{reason:error.message});descriptions.push({path:file,status:'unavailable',kind:'script-body',reason:error.message});}
   }
   maps.set(item,map);mapOriginals.set(map,contexts);item.sourceMap={...details,...(descriptions.length?{originals:descriptions}:{})};
   }finally{clearTimeout(recoveryTimer);if(controller)recoveries.delete(controller);}
  }
  const originalFor=(map,address,index=map?.resolvedSources.indexOf(address))=>{const context=mapOriginals.get(map)?.get(index),saved=originals.get(context?.key);if(!saved)return context&&{reason:context.reason||'Original source snapshot expired'};const region=context.recovered&&context.body&&/\.html?$/i.test(saved.path||'')?require('./revival-html-watches.cjs').regions(saved.source).find(item=>item.from===context.from&&item.to===context.to):null;return {...saved,...(context.recovered?{mappedSource:region?.source??saved.source.slice(context.from,context.to)}:{})};};
  async function loadMap(item,responseHeaders){
   let address,result,timer;
   try{
    address=sourceMaps.reference(item.source,responseHeaders);if(!address)return;
    if(/^data:/i.test(address)){await installMap(item,sourceMaps.parse(sourceMaps.inline(address),origin+item.name),{status:'ready',kind:'inline'});return;}
    if(address.length>8192)throw Error('Source map URL exceeds 8192 characters');
    const url=new URL(address,origin+item.name);if(![origin,target.origin].includes(url.origin)||url.username||url.password)throw Error('Source map leaves the selected server origin');
    url.hash='';url.protocol=target.protocol;url.host=target.host;
    const controller=new AbortController();timer=setTimeout(()=>controller.abort(Error('Source map retrieval exceeded 1000 ms')),sourceMaps.limits.requestMs);
    result=await request(url.href,{signal:controller.signal});if(result.response.statusCode!==200)throw Error('Source map returned HTTP '+result.response.statusCode);
    const value=await body(result),mapItem=record(url.pathname+url.search,value,'application/json'),mapURL=origin+url.pathname+url.search;
    clearTimeout(timer);await installMap(item,sourceMaps.parse(value.toString('utf8'),mapURL),{status:'ready',kind:'external',url:mapURL,sha256:mapItem.sha256});
   }catch(error){result?.agent.destroy();item.sourceMap={status:'unavailable',reason:error.cause?.message||error.message,...(address&&!/^data:/i.test(address)?{reference:address.slice(0,8192)}:{})};}finally{clearTimeout(timer);}
  }
  const entryURL=target.pathname+target.search;
  function htmlResponse(item){const transformed=watcher.transformHTML(item.source,item.path),annotated=require('./revival-html-watches.cjs').annotate(transformed.instrument||{source:item.source,edits:[]},origin);if(inlineSources.size+annotated.scripts.length>256)throw Error('Preview exceeds 256 inline script sources');instruments.set(item,annotated.instrument);for(const script of annotated.scripts)inlineSources.set(script.url,{...script,item,instrument:annotated.instrument});return annotated.instrument.source;}
  server=http.createServer(async(incoming,outgoing)=>{let counted=false,upstream;
   try{
    if(closed)throw Error('Development server preview stopped.');if(incoming.headers.host!==new URL(origin).host||!incoming.url.startsWith('/')||incoming.url.startsWith('//')||incoming.url.length>8192)throw Error('Invalid server preview request.');
    if(!enabled){if(incoming.url!==entryURL||incoming.method!=='GET'){outgoing.writeHead(403);outgoing.end();return;}outgoing.setHeader('content-type','text/html');outgoing.end('<!doctype html><meta charset="utf-8"><title>Preparing development preview</title><style>body{margin:0;padding:24px;background:#17201c;color:#d9ede2;font:14px system-ui}</style><body>Preparing development preview.</body>');return;}
    counted=true;if(++pending>limits.concurrent)throw Error('Server preview exceeds 32 concurrent requests');
    const requestedHash=sourceHash(incoming.url),url=new URL(incoming.url,target.origin),result=upstream=await request(url.href,{method:incoming.method,inputHeaders:incoming.headers,input:['GET','HEAD'].includes(incoming.method)?null:incoming}),response=result.response,type=String(response.headers['content-type']||'application/octet-stream'),outputHeaders={...response.headers};
    delete outputHeaders['content-length'];delete outputHeaders['content-encoding'];delete outputHeaders['transfer-encoding'];delete outputHeaders.connection;delete outputHeaders['content-security-policy'];
    if(outputHeaders.location){const location=new URL(outputHeaders.location,target.origin);if(location.origin===target.origin)outputHeaders.location=origin+location.pathname+location.search+location.hash;}
    if(/^text\/event-stream/i.test(type)){
     result.outbound.setTimeout(0);const events=stream(result);outgoing.writeHead(response.statusCode,outputHeaders);events.once('error',error=>outgoing.destroy(error));outgoing.once('close',()=>result.agent.destroy());events.pipe(outgoing);return;
    }
    const value=await body(result);let delivered=value;
    if(incoming.method!=='HEAD'&&![204,304].includes(response.statusCode)){
     const item=record(incoming.url,value,type,requestedHash);
     if(response.statusCode===200&&/^(?:text|application)\/(?:javascript|ecmascript)\b/i.test(type))await loadMap(item,response.headers);
     if(response.statusCode===200&&(/^text\/html\b/i.test(type)||/^(?:text|application)\/(?:javascript|ecmascript)\b/i.test(type)&&watcher.watch.specs.length)){
      const isHTML=/^text\/html\b/i.test(type),map=maps.get(item),transformed=isHTML?null:watcher.transform(item.source,map,item.path,sourceFile,item.sourceMap?.status==='unavailable'?item.sourceMap.reason:null,(address,index)=>originalFor(map,address,index));let code=isHTML?htmlResponse(item):transformed.source;
      if(transformed?.instrument){const instrument=watchSupport.configure(transformed.instrument,require('./revival-browser-watches.cjs').updateSource(watcher.watch));code=instrument.source;instruments.set(item,instrument);}
      delivered=Buffer.from(code);changedWatches();delete outputHeaders.etag;delete outputHeaders['last-modified'];outputHeaders['cache-control']='no-store';
     }
    }
    outgoing.writeHead(response.statusCode,{...outputHeaders,'content-length':incoming.method==='HEAD'?response.headers['content-length']||0:delivered.length});outgoing.end(delivered);
   }catch(error){upstream?.agent.destroy();lastFailure=error;for(const listener of listeners)listener(error.message);if(!outgoing.headersSent)outgoing.writeHead(502,{'content-type':'text/plain'});outgoing.end('Server preview: '+error.message);}
   finally{if(counted)pending=Math.max(0,pending-1);}
  });
  server.on('connection',socket=>{try{own(socket);}catch(error){for(const listener of listeners)listener(error.message);}});server.on('clientError',(_error,socket)=>socket.destroy());
  server.on('upgrade',async(incoming,client,head)=>{
   try{
    if(closed||!enabled||incoming.headers.host!==new URL(origin).host||!incoming.url.startsWith('/')||incoming.url.startsWith('//')||incoming.url.length>8192||head.length>65536)throw Error('Invalid server WebSocket request');
    const socket=own(await live.connect(target.origin+incoming.url));if(closed||client.destroyed){socket.destroy();return;}
    const forwarded=headers(incoming.headers);socket.setTimeout(limits.requestMs,()=>{socket.destroy();client.destroy();});socket.once('data',()=>socket.setTimeout(0));socket.write('GET '+incoming.url+' HTTP/1.1\r\n'+Object.entries(forwarded).map(([name,value])=>name+': '+value).join('\r\n')+'\r\n\r\n');if(head.length)socket.write(head);
    for(const endpoint of [socket,client])endpoint.on('data',chunk=>{try{count(chunk);}catch(error){socket.destroy();client.destroy();for(const listener of listeners)listener(error.message);}});
    socket.once('error',()=>client.destroy());client.once('error',()=>socket.destroy());socket.once('close',()=>client.destroy());client.once('close',()=>socket.destroy());socket.pipe(client);client.pipe(socket);
   }catch(error){lastFailure=error;client.destroy();for(const listener of listeners)listener(error.message);}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});origin='http://127.0.0.1:'+server.address().port;record(entryURL,Buffer.from(target.html),'text/html');
  function close(){if(closed)return closing||Promise.resolve();closed=true;unsubscribe?.();for(const controller of recoveries)controller.abort(Error('Development server preview stopped.'));recoveries.clear();originals.clear();originalBytes=0;for(const socket of sockets)socket.destroy();closing=new Promise(resolve=>server.close(resolve));return closing;}
  unsubscribe=live.onStop(reason=>{for(const listener of listeners)listener('Development server stopped: '+reason);close();});
  const fromURL=input=>{const url=new URL(input);if(url.origin!==origin||url.username||url.password)throw Error('Server resource leaves its preview origin.');return url.pathname+url.search;};
  const read=input=>{const key=input.startsWith('/')?input:input.startsWith(origin)?fromURL(input):null;let item=key&&captures.get(key);if(!item)item=[...captures.values()].find(item=>item.path?.toLowerCase()===input.toLowerCase());
   if(!item){const file=key?fileFor(key):policy.checked(input);if(!file||!inside(file,root)||fs.statSync(file).size>2*1024*1024)throw Error('Selection source leaves its server project or exceeds 2 MiB');const source=fs.readFileSync(file,'utf8');item={path:file,name:path.relative(root,file),exists:true,origin:'disk',source,sha256:hash(source),byteLength:Buffer.byteLength(source),type:'text/javascript'};}return item;
  };
  const urlFor=file=>{file=policy.checked(file);if(!inside(file,root))throw Error('Selection source leaves its server project.');return origin+'/'+path.relative(root,file).split(path.sep).map(encodeURIComponent).join('/');};
  function mapLocation(url,line,column){
   const inline=inlineSources.get(url),key=inline?null:fromURL(url),item=inline?.item||captures.get(key);if(!item)return null;let source=item.source,file=item.path,name=item.name;
   const instrument=inline?.instrument||instruments.get(item);if(inline){const html=require('./revival-html-watches.cjs'),index=html.inlineIndex(inline,line,column-1),position=html.originalLocation(source,watchSupport.offset(instrument,index));line=position.line;column=position.column+1;}else if(instrument){const position=watchSupport.position(instrument,line,column-1,source);line=position.line;column=position.column+1;}
  if(instrument?.htmlLocations){const html=require('./revival-html-watches.cjs'),index=html.indexFromLocation(source,line,column-1),block=instrument.htmlLocations.find(item=>index>=item.from&&index<=item.to);if(block){const relative=html.originalLocation(block.region.source,block.region.fromRaw(index)),original=instrument.originalRecord,at=block.originalRegion.toRaw(html.indexFromLocation(block.originalRegion.source,relative.line,relative.column)),position=html.originalLocation(original.originalSource,at);source=original.originalSource;file=original.path;name=path.relative(root,file);line=position.line;column=position.column+1;return {path:file,name,line,column,source,sourceLine:source.split(/\r?\n/)[line-1]||'',sha256:hash(source)};}}
   const map=maps.get(item);if(map){try{const mapping=require('./node_modules/@jridgewell/trace-mapping'),position=mapping.originalPositionFor(map,{line,column:column-1});if(!position.source||position.line===null||position.column===null)return null;
    const segment=mapping.traceSegment(map,line-1,column-1),sourceIndex=segment?.[1];source=map.sourcesContent?.[sourceIndex];if(typeof source!=='string')source=originalFor(map,position.source,sourceIndex)?.mappedSource;if(typeof source!=='string'||Buffer.byteLength(source)>2*1024*1024)return null;
    file=sourceFile(position.source);if(!file){const address=new URL(position.source,origin);if(![origin,target.origin].includes(address.origin)||address.username||address.password)return null;}
    line=position.line;column=position.column+1;name=file?path.relative(root,file):position.source;
    if(file&&/\.html?$/i.test(file)&&sourceViews.scriptBody(source)){
     const saved=originalFor(map,position.source,sourceIndex);if(typeof saved?.source!=='string')return null;const view=sourceViews.view(saved.source,source,true);if(view.status!=='matched'||!view.body)return null;
     const index=view.fromMap(line,column-1);if(index<view.from||index>view.to)return null;source=saved.source;const point=require('./revival-html-watches.cjs').originalLocation(source,index);line=point.line;column=point.column+1;
    }
   }catch(_){return null;}}else if(file){try{if(fs.readFileSync(file,'utf8')!==source)file=null;}catch(_){file=null;}}
   return {path:file,name,line,column,source,sourceLine:source?.split(/\r?\n/)[line-1]||'',sha256:typeof source==='string'?hash(source):item.sha256};
  }
  const snapshot=()=>{const files=[...captures.values()];return {mode:'server',live:true,root,entry:fileFor(entryURL),files,sha256:hash(JSON.stringify(files.map(({name,sha256,sourceMap})=>({name,sha256,...(sourceMap?.originals?{originals:sourceMap.originals}:{})})))),server:{id:state.id,script:state.script,url:target.href.replace(/#.*$/,''),expiresAt:state.expiresAt},trafficBytes:bytes,originalSources:{files:originals.size,bytes:originalBytes,limitBytes:limits.originalBytes,maxFiles:limits.originalFiles}};};
  const initialHTML=htmlResponse(captures.get(entryURL));
  return {entry:fileFor(entryURL),root,origin,url:origin+entryURL,html:initialHTML,watch:watcher.watch,watchBindings:watcher.bindings,updateWatches:files=>{const watch=watcher.update(files);changedWatches();return watch;},onWatches:listener=>{watchListeners.add(listener);return ()=>watchListeners.delete(listener);},enable:()=>{if(closed)throw Error('Development server preview stopped');enabled=true;},close,onFailure:listener=>{listeners.add(listener);return ()=>listeners.delete(listener);},urlFor,fromURL,read,mapLocation,snapshot,lifetimeMs:Math.max(100,Math.min(900000,state.expiresAt-Date.now())),limits};
 }catch(error){closed=true;for(const socket of sockets)socket.destroy();if(server)await new Promise(resolve=>server.close(resolve));throw error;}
}
module.exports={create,limits};
