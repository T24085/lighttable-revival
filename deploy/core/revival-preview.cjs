'use strict';
const {app,BrowserWindow,WebContentsView,protocol}=require('electron');
const crypto=require('crypto'),path=require('path');
const memory=require('./proof-memory.cjs'),files=require('./revival-preview-files.cjs'),browserWatches=require('./revival-browser-watches.cjs'),syntax=require('./revival-syntax.cjs'),modules=require('./proof-modules.cjs'),esbuild=require('esbuild'),mapping=require('@jridgewell/trace-mapping');
// Registration precedes app.ready; each preview gets its own ephemeral session.
protocol.registerSchemesAsPrivileged([{scheme:'lt-preview',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);
const active=new Map(),versions=new Map(),completed=new Map(),recent=[];
const hotView=require('./revival-hot-view.cjs'),hotCode=require('./revival-hot-code.cjs');
const network=require('./revival-preview-network.cjs'),csp=network.csp;
function status(owner){const run=active.get(owner);return run?run.snapshot():null;}
function stop(owner,reason='Preview stopped'){versions.set(owner,(versions.get(owner)||0)+1);return active.get(owner)?.finish(reason)||Promise.resolve(completed.get(owner)||null);}
function validateLiveSources(prepared,previous){
 const snapshot=prepared.snapshot(),known=(previous?.project?.entry===prepared.entry?previous.project.files:[]).filter(item=>item.path&&item.kind!=='resolution-source'&&item.snapshotRole!=='metadata'&&/\.(?:[cm]?js|jsx|[cm]?ts|tsx)$/i.test(item.path));
 const candidates=new Map(known.map(item=>[item.path.toLowerCase(),item.path]));if(/\.(?:[cm]?js|jsx|[cm]?ts|tsx)$/i.test(prepared.entry))candidates.set(prepared.entry.toLowerCase(),prepared.entry);
 function parse(item,source,options,offset=index=>index){
  try{syntax.parse(source,options);}catch(error){const index=offset(Number.isInteger(error.pos)?error.pos:0),position=require('./revival-html-watches.cjs').originalLocation(item.source,index);error.location={path:item.path,name:item.name,line:position.line,column:position.column+1,source:item.source,sourceLine:item.source.split(/\r\n?|\n/)[position.line-1]||'',sha256:item.sha256,...(item.loader?{loader:item.loader}:{})};throw error;}
 }
 for(const file of candidates.values()){const relative=path.relative(snapshot.root,file);if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))continue;const item=prepared.read(file);if(item.exists&&typeof item.source==='string')parse(item,item.source,{filename:file,loader:item.loader});}
 const html=prepared.read(prepared.entry);if(/\.html?$/i.test(prepared.entry)&&html.exists)for(const block of require('./revival-html-regions.cjs').blocks(html.source))parse(html,block.source,{sourceType:block.module?'module':'script'},index=>block.toRaw(index));
}
async function start(owner,options,host,notify=()=>{},continuation={}){
 const suppliedRequestId=options?.requestId??null;if(suppliedRequestId!==null&&(typeof suppliedRequestId!=='string'||!/^[a-f0-9-]{36}$/.test(suppliedRequestId)))throw Error('Invalid preview request identity');
 if(options?.liveEdit!==undefined&&typeof options.liveEdit!=='boolean')throw Error('Invalid live editing option');
 if(options?.restart!==undefined&&typeof options.restart!=='boolean')throw Error('Invalid preview restart option');
 if(options?.liveEdit&&(options.mode==='server'||!Number.isInteger(options.liveBudgetMs)||options.liveBudgetMs<100||options.liveBudgetMs>900000))throw Error('Live editing has a finite session of at most 15 minutes');
 if(options?.bounds){const size=host?.getContentSize();if(!size||['x','y','width','height'].some(key=>!Number.isInteger(options.bounds[key])||options.bounds[key]<0||options.bounds[key]>16384)||options.bounds.x+options.bounds.width>size[0]+1||options.bounds.y+options.bounds.height>size[1]+1)throw Error('Invalid initial preview bounds');}
 const revision=(versions.get(owner)||0)+1;versions.set(owner,revision);
 const id=crypto.randomBytes(16).toString('hex');let livePrepared,restartReason=options?.restart?'Run requested':null;
 const previous=active.get(owner);
 if(options?.liveEdit&&!options.restart&&previous?.live&&previous.snapshot().project.entry===options.path){
  const candidate=files.prepare(options,'lt-preview://'+previous.snapshot().id);
  try{validateLiveSources(candidate,previous.snapshot());await candidate.compile?.();if(versions.get(owner)!==revision)throw Error('Preview replaced before live update');const updated=await previous.update(candidate,options,()=>versions.get(owner)===revision);if(updated)return updated;restartReason=previous.restartReason;}
  catch(error){await candidate.close?.();throw error;}
  await candidate.close?.();
 }
 if(options?.liveEdit){
  // Compile a captured candidate before replacing the last working program.
  // Syntax errors during typing must not blank the visible running view.
  livePrepared=files.prepare(options,'lt-preview://'+id);
  try{validateLiveSources(livePrepared,active.get(owner)?.snapshot());await livePrepared.compile?.();if(versions.get(owner)!==revision)throw Error('Preview replaced before startup.');}
  catch(error){await livePrepared.close?.();throw error;}
 }
 await (active.get(owner)?.finish('Preview replaced')||Promise.resolve());
 if(versions.get(owner)!==revision)throw Error('Preview replaced before startup.');
 completed.delete(owner);
 if(!host||host.isDestroyed())throw Error('Preview needs an editor window.');
 let requestId=suppliedRequestId;
 const serverMode=options?.mode==='server';let prepared=livePrepared||(serverMode?await require('./revival-server.cjs').create(owner,options):files.prepare(options,'lt-preview://'+id));const origin=prepared.origin||'lt-preview://'+id;
 // Initialize Node's lazy Response/stream machinery before the bounded browser
 // startup. Only this inert document is available until quota attachment.
 const bootstrapResponse=serverMode?null:new Response('<!doctype html><meta charset="utf-8"><title>Preparing preview</title><style>body{margin:0;padding:24px;background:#17201c;color:#d9ede2;font:14px system-ui}</style><body>Preparing live program…</body>',{headers:{'Content-Type':'text/html','Content-Security-Policy':csp,'Cache-Control':'no-store'}});
 if(versions.get(owner)!==revision){await prepared.close?.();throw Error('Preview replaced before startup.');}
 let view;try{view=new WebContentsView({webPreferences:{partition:'preview-'+id,sandbox:true,contextIsolation:true,nodeIntegration:false,nodeIntegrationInWorker:false,webSecurity:true,backgroundThrottling:!!(options.liveEdit||options.bounds)}});}catch(error){await prepared.close?.();throw error;}const wc=view.webContents;
 let done=false,ready=false,bootstrap=true,bootstrapPainted=false,reloadQueued=false,pid=0,attachment,cleanup,deadline,executionTimer,quota,accounting,loadResolve,loadReject,pending=false,result=null,logs=[],errors=[],logBytes=0,watchValues=[],watchBytes=0;
 const watch=prepared.watch,binding='__lt_capture_'+crypto.randomBytes(16).toString('hex');
 const hotKey='__lt_hot_'+id,styleSheets=new Map();let hotController=options.liveEdit?hotView.create(prepared,hotKey):null,updateCount=0,hotHistoryBytes=0,liveUpdate={kind:'restart',reason:restartReason};
 const selections=new Map(),selectionBuffers=new Map(),watchTimers=new Set();let selectionBytes=0,watchUpdates=Promise.resolve(),selectionController,selectionCompilation;const run={view,finish,snapshot,live:!!options.liveEdit,update:updateLive,bounds:continuation.bounds||options.bounds,evaluate:evaluateSource,updateWatches:files=>{
  if(done||!ready||!prepared.updateWatches)throw Error('Open a running development-server preview first.');prepared.updateWatches(files);watchValues=watchValues.filter(value=>watch.specs.some(spec=>spec.id===value.id&&spec.captureToken===value.captureToken));
  watchUpdates=watchUpdates.catch(()=>{}).then(()=>updateWatchFiles());return watchUpdates;
 }};active.set(owner,run);
 prepared.onWatches?.(()=>{if(!done)emit('watch-sources');});
 prepared.onFailure?.(message=>{if(done)return;if(message.startsWith('Development server stopped:')){finish(message).catch(()=>{});return;}if(errors.length<32){errors.push({message,location:null});emit('error');}});
 function snapshot(details=true){const project=prepared.snapshot();if(!details)project.files=project.files.map(({source,...item})=>item);return {id,requestId,liveUpdate,bootstrapPainted,reloadFrom:continuation.reloadFrom||null,reloadCount:continuation.reloadCount||0,status:done?'stopped':ready?'running':'loading',reason:run.reason||null,url:prepared.url,rendererPid:pid,project,logs:[...logs],errors:[...errors],result,watches:watchValues,watchSnapshot:watch?{sha256:watch.sha256,specs:watch.specs,revision:watch.revision||0,...(prepared.watchBindings?{bindings:prepared.watchBindings()}:{})}:null,memory:quota?{...quota.metadata,...accounting}:null};}
 function emit(kind){try{notify({kind,...snapshot(false)});}catch(_){} }
 async function updateLive(candidate,nextOptions,current){
  const fallback=reason=>{run.restartReason=reason;return null;};
  if(done||!ready||pending)return fallback('The program is busy or stopped');
  if(!hotController||watch||candidate.watch)return fallback('Expression watches require a restart');
  if(updateCount>=128)return fallback('Live update history reached 128 changes');
  const plan=hotController.plan(candidate);if(plan.reason)return fallback(plan.reason);
  const historyBytes=plan.patches.reduce((total,patch)=>total+Buffer.byteLength(patch.patch)+Buffer.byteLength(JSON.stringify(patch.patchMap)),0)+candidate.snapshot().files.reduce((total,item)=>total+(item.byteLength||0),0);
  if(hotHistoryBytes+historyBytes>32*1024*1024)return fallback('Live source history reached 32 MiB');
  const styles=[];for(const style of plan.styles){const ids=[...styleSheets].filter(([,address])=>address===style.address).map(([id])=>id);if(!ids.length)return fallback('A stylesheet needs a restart');for(const styleSheetId of ids)styles.push({...style,styleSheetId});}
  if(!current())throw Error('Preview replaced before live update');
  pending=true;let executed=false;
  const timer=setTimeout(()=>finish('Live update exceeded 1500 ms').catch(()=>{}),1500);
  async function evaluate(expression){const reply=await wc.debugger.sendCommand('Runtime.evaluate',{expression,returnByValue:true,timeout:1500});if(done)throw Error(run.reason);if(!current())throw Error('Preview replaced during live update');if(reply.exceptionDetails)throw Error(String(reply.exceptionDetails.exception?.description||reply.exceptionDetails.text));return reply.result.value;}
  try{
   if(plan.markup){const reason=await evaluate(hotView.documentPatch(plan.html,true));if(reason)return fallback(reason);}
   if(wc.getOSProcessId()!==pid)throw Error('Live renderer changed after quota attachment');
   // Functions and literal cells change atomically within each captured script.
   // No project initialization is evaluated on this route.
   executed=true;
   for(const patch of plan.patches){const address=plan.next.patchAddress(patch,updateCount+1);await evaluate(patch.patch+'\n//# sourceURL='+address);}
   for(const style of styles){await wc.debugger.sendCommand('CSS.setStyleSheetText',{styleSheetId:style.styleSheetId,text:style.text});if(done||!current())throw Error('Live update interrupted');}
   if(plan.markup)await evaluate(hotView.documentPatch(plan.html));
   const old=prepared;for(const [address,map] of hotController.maps)if(!plan.next.maps.has(address)||!address.includes('?lt-live-update='))plan.next.maps.set(address,map);
   prepared=candidate;hotController=plan.next;requestId=nextOptions.requestId??null;updateCount++;hotHistoryBytes+=historyBytes;liveUpdate={kind:'hot',revision:updateCount,functions:plan.patches.length,styles:plan.styles.length,markup:plan.markup,reason:null};
   await old.close?.();if(done||!current())throw Error('Live update interrupted');emit('ready');return snapshot();
  }catch(error){if(executed||done){await finish('Live update interrupted: '+error.message);throw Error(run.reason);}throw error;}finally{pending=false;clearTimeout(timer);}
 }
 function requestReload(url){
  if(!serverMode||done||!ready||reloadQueued)return;
  let address;try{address=new URL(url);address.hash='';}catch(_){return;}if(address.href!==prepared.url)return;
  // Never navigate directly to project HTML. A new document must receive its
  // verified quota and private collector before any project script can run.
  reloadQueued=true;ready=false;watchValues=[];result=null;emit('reloading');
  setImmediate(async()=>{
   if(done||active.get(owner)!==run||versions.get(owner)!==revision)return;
   const server=prepared.snapshot().server,watchFiles=watch.files.map(file=>({path:file.path,source:file.originalSource,watches:file.specs,...(file.loader?{loader:file.loader}:{})}));
   try{await start(owner,{mode:'server',serverId:server.id,url:server.url,requestId,watchFiles},host,notify,{reloadFrom:id,reloadCount:(continuation.reloadCount||0)+1,bounds:run.bounds});}
   catch(error){
    // An explicit Stop or a newer preview always wins over an automatic reload.
    if(versions.get(owner)!==revision+1)return;
    try{notify({kind:'reload-failed',...snapshot(false),status:'stopped',reason:error.message});}catch(_){}
   }
  });
 }
 function location(details){
  function captured(file,line,column){
   if(!file?.startsWith(origin))return null;
   try{const selection=selections.get(file);if(!selection&&prepared.mapLocation){const mapped=hotController?.mapped(file,line+1,column+1);return mapped?mapped:prepared.mapLocation(file,line+1,column+1);}const source=selection||prepared.read(prepared.fromURL(file));if(selection?.transform){const point=mapping.originalPositionFor(selection.transform,{line:line+1,column});if(point.line===null)return null;const error=modules.runtimeError(selection.prepared,{error:'Browser selection',stack:'at light-table-project.js:'+point.line+':'+(point.column+1)});if(!error.location)return null;if(error.location.path!==selection.path)return error.location;line=error.location.line-1;column=error.location.column-1;}line+=selection?.lineOffset||0;column+=line===(selection?.lineOffset||0)?selection?.columnOffset||0:0;return {path:source.path,name:source.name,line:line+1,column:column+1,source:source.source,sourceLine:source.source?.split(/\r?\n/)[line]||'',sha256:source.sha256};}catch(_){return null;}
  }
  // A dependency dispatcher has generated frames before its authored caller.
  // Choose the first frame that actually maps to captured project source.
  for(const frame of details.stackTrace?.callFrames||[]){const found=captured(frame.url,frame.lineNumber,frame.columnNumber);if(found)return found;}
  // Awaited evaluations can expose only a Promise wrapper in CDP's callFrames.
  const addresses=String(details.exception?.description||'').matchAll(new RegExp('('+origin+'/[^\\s)]+):(\\d+):(\\d+)','g'));
  for(const address of addresses){const found=captured(address[1],Number(address[2])-1,Number(address[3])-1);if(found)return found;}
  return captured(details.url,details.lineNumber||0,details.columnNumber||0);
 }
 function exception(details){const item={message:String(details.exception?.description||details.text||'Browser script failed').slice(0,4096),location:location(details),watchRevision:watch?.revision||0};if(errors.length>=32){finish('Preview exceeded 32 script errors').catch(()=>{});return item;}errors.push(item);emit('error');return item;}
 async function evaluateSource(source,options={}){
  if(done||!ready)throw Error('Browser preview is not running.');if(pending)throw Error('A browser evaluation is already running.');
  if(typeof source!=='string'||Buffer.byteLength(source)>16384)throw Error('Browser selection exceeds 16 KiB.');
  if(!options||typeof options!=='object'||Array.isArray(options))throw Error('Invalid browser evaluation options.');
  if(options.loader!==undefined&&!['js','jsx','ts','tsx'].includes(options.loader))throw Error('Invalid browser selection grammar.');
  if(selections.size>=128)throw Error('Preview exceeds 128 evaluations. Refresh the preview.');
  const sourceURL=origin+'/__lt_selection_'+selections.size+'.js';
  if(options.path){const file=prepared.fromURL(prepared.urlFor(options.path)),item=prepared.read(file);
   const lineOffset=options.lineOffset||0,columnOffset=options.columnOffset||0;
   if(!Number.isInteger(lineOffset)||lineOffset<0||lineOffset>100000||!Number.isInteger(columnOffset)||columnOffset<0||columnOffset>100000)throw Error('Invalid selection source offset.');
   let captured=item;
   if(options.bufferSource!==undefined){
    if(typeof options.bufferSource!=='string'||Buffer.byteLength(options.bufferSource)>2*1024*1024)throw Error('Selection buffer exceeds 2 MiB.');
    const sha256=crypto.createHash('sha256').update(options.bufferSource).digest('hex'),key=file+'|'+sha256;
    if(!selectionBuffers.has(key)){selectionBytes+=Buffer.byteLength(options.bufferSource);if(selectionBytes>8*1024*1024)throw Error('Selection snapshots exceed 8 MiB. Refresh the preview.');selectionBuffers.set(key,{...item,source:options.bufferSource,sha256,origin:'editor'});}
    captured=selectionBuffers.get(key);
   }
   selections.set(sourceURL,{...captured,lineOffset,columnOffset});
  }else selections.set(sourceURL,{path:null,name:'Browser selection',source,sha256:crypto.createHash('sha256').update(source).digest('hex')});
  pending=true;let protocolReturned=false,executionStarted=false,planningTimer;
  try{
   let working=source;const loader=options.loader||syntax.loader(options.path);
   if(loader!=='js'){
    const started=Date.now();selectionController=new AbortController();planningTimer=setTimeout(()=>selectionController?.abort(),5000);const snapshot=prepared.snapshot(),buffers=snapshot.files.filter(item=>item.snapshotRole!=='metadata'&&item.kind!=='resolution-source'&&typeof item.source==='string'&&item.exists&&item.path!==options.path).map(item=>({path:item.path,source:item.source,...(item.loader?{loader:item.loader}:{})}));
    if(options.buffers!==undefined){if(!Array.isArray(options.buffers)||options.buffers.length>256)throw Error('Browser selection exceeds 256 metadata buffers.');for(const buffer of options.buffers){if(!buffer||typeof buffer.path!=='string'||typeof buffer.source!=='string'||Buffer.byteLength(buffer.source)>65536||buffer.loader!==undefined)throw Error('Invalid browser selection metadata buffer.');const file=prepared.fromURL(prepared.urlFor(buffer.path)),loaded=snapshot.files.find(item=>item.path?.toLowerCase()===file.toLowerCase());if(loaded?.snapshotRole!=='metadata'||loaded.kind==='resolution-source')throw Error('Browser selection buffers must contain captured compiler or package metadata.');buffers.push({path:file,source:buffer.source});}}
    selectionCompilation=modules.prepare(source,{...(options.path?{path:options.path}:{}),loader,buffers,inline:true},selectionController.signal);const converted=await selectionCompilation;if(done)throw Error(run.reason);
    for(const item of converted.project?.metadata||[]){
     const loaded=snapshot.files.find(file=>file.path?.toLowerCase()===item.path.toLowerCase());if(!loaded)continue;
     const separate=loaded.resolutionSha256!==undefined,savedHash=separate?loaded.resolutionSha256:loaded.sha256,savedExists=separate?savedHash!==null:loaded.exists;
     // A captured executable source remains pinned during a selection. Newly
     // discovered disk bytes cannot replace it; previously captured resolution
     // identities still have to match, including an explicitly absent file.
     const pinned=item.kind==='resolution-source'&&!separate&&loaded.kind!=='resolution-source'&&loaded.snapshotRole!=='metadata'&&converted.project.modules.some(file=>file.path.toLowerCase()===item.path.toLowerCase()&&file.sha256===loaded.sha256&&file.loader===loaded.loader);
     if(savedExists!==item.exists||!pinned&&savedHash!==item.sha256)throw Error('Compiler configuration or package metadata changed. Refresh the preview before evaluating.');
    }
    const name='__lt_selection_'+crypto.randomBytes(16).toString('hex');selectionCompilation=esbuild.transform(converted.code,{format:'iife',globalName:name,target:'es2022',sourcemap:'external',sourcefile:'light-table-project.js',sourcesContent:false,legalComments:'none',logLevel:'silent'});const built=await selectionCompilation;if(done)throw Error(run.reason);if(selectionController.signal.aborted||Date.now()-started>=5000)throw Error('Browser selection compilation exceeded 5000 ms');clearTimeout(planningTimer);if(Buffer.byteLength(built.code)>4*1024*1024||Buffer.byteLength(built.map)>8*1024*1024)throw Error('Browser selection transformation exceeds 4 MiB code / 8 MiB maps');
    const selection=selections.get(sourceURL);selection.prepared=converted;selection.transform=new mapping.TraceMap(JSON.parse(built.map));working=built.code+'\n(()=>{const value='+name+(converted.resultExport==='namespace'?'':'.default')+';delete globalThis['+JSON.stringify(name)+'];return value;})()';
   }
   executionStarted=true;executionTimer=setTimeout(()=>finish('Browser evaluation exceeded 1500 ms').catch(()=>{}),1500);const code=working+'\n//# sourceURL='+sourceURL;
   const expression='Promise.resolve((0,eval)('+JSON.stringify(code)+')).then(value=>{const text=JSON.stringify(value);if(text&&new TextEncoder().encode(text).byteLength>16384)throw Error("Browser result exceeds 16 KiB");return text===undefined?String(value):text;})';
   const response=await wc.debugger.sendCommand('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,timeout:1500});
   protocolReturned=true;
   if(done)throw Error(run.reason);if(response.exceptionDetails){const item=exception(response.exceptionDetails),error=Error(item.message);error.location=item.location;throw error;}
   if(watch)await flushWatches();if(done)throw Error(run.reason);
   result=response.result.value;emit('result');return {...snapshot(),source,sha256:crypto.createHash('sha256').update(source).digest('hex')};
  }catch(error){if(done){await cleanup;throw Error(run.reason);}if(executionStarted&&!protocolReturned){await finish('Browser evaluation interrupted ('+error.message+'); execution budget is 1500 ms');throw Error(run.reason);}if(error.location?.kind!=='compiler-configuration'&&error.location?.path===options.path&&!executionStarted){const point=error.location,selection=selections.get(sourceURL),line=point.line+(selection?.lineOffset||0),column=point.column+(point.line===1?selection?.columnOffset||0:0);error.location={...point,line,column,source:selection.source,sha256:selection.sha256,sourceLine:selection.source.split(/\r?\n/)[line-1]||''};}if(/timed out|execution was terminated/i.test(error.message))await finish('Browser evaluation exceeded 1500 ms');throw error;}finally{pending=false;clearTimeout(executionTimer);clearTimeout(planningTimer);selectionController?.abort();selectionController=null;selectionCompilation=null;}
 }
 async function flushWatches(){const response=await wc.debugger.sendCommand('Runtime.evaluate',{expression:watch.key+'.flush()',timeout:1500});if(response.exceptionDetails)throw Error('Browser watch collector failed');}
 async function updateWatchFiles(){
  if(done||!ready||!prepared.updateWatches)throw Error('Open a running development-server preview first.');
  const timer=setTimeout(()=>finish('Browser watch update exceeded 1500 ms').catch(()=>{}),1500);watchTimers.add(timer);
  try{const response=await wc.debugger.sendCommand('Runtime.evaluate',{expression:browserWatches.updateSource(watch),timeout:1500});if(done)throw Error(run.reason);if(response.exceptionDetails)throw Error('Browser watch collector update failed');emit('watch-sources');return snapshot();}catch(error){await finish(error.message);throw error;}finally{clearTimeout(timer);watchTimers.delete(timer);}
 }
 function finish(reason){
  if(done)return cleanup;done=true;run.reason=reason;clearTimeout(deadline);clearTimeout(executionTimer);selectionController?.abort();for(const timer of watchTimers)clearTimeout(timer);watchTimers.clear();loadReject?.(Error(reason));
  cleanup=(async()=>{
   try{quota=await attachment;}catch(_){}
   try{await selectionCompilation;}catch(_){}
   await prepared.close?.();try{if(!host.isDestroyed())host.contentView.removeChildView(view);}catch(_){}
   if(!wc.isDestroyed())wc.close({waitForBeforeUnload:false});
   try{if(quota)accounting=await quota.release();}catch(error){run.reason=error.message;throw error;}finally{if(active.get(owner)===run)active.delete(owner);completed.delete(owner);completed.set(owner,snapshot(false));if(completed.size>16)completed.delete(completed.keys().next().value);recent.push({rendererPid:pid,reason:run.reason,memory:quota?{...quota.metadata,...accounting}:null});if(recent.length>16)recent.shift();emit('stopped');}
   return snapshot();
  })();return cleanup;
 }
 try{
  if(!livePrepared)await prepared.compile?.();if(done)throw Error(run.reason);
  // All previews need a painted native surface before their authored deadline.
  // Warm the inert document even for ordinary previews and expression watches;
  // authored code remains gated on the verified renderer quota below.
  host.contentView.addChildView(view);if(run.bounds)bounds(owner,run.bounds);else{view.setBounds({x:0,y:0,width:1,height:1});view.setVisible(true);}
  await memory.start();if(done)throw Error(run.reason);
  deadline=setTimeout(()=>finish('Preview startup exceeded 5000 ms').catch(()=>{}),5000);
  wc.session.setPermissionRequestHandler((_wc,_permission,cb)=>cb(false));wc.session.setPermissionCheckHandler(()=>false);
  wc.setWindowOpenHandler(()=>({action:'deny'}));
  wc.on('will-navigate',event=>{event.preventDefault();requestReload(event.url);});wc.on('will-frame-navigate',event=>{event.preventDefault();if(event.isMainFrame)requestReload(event.url);});
  wc.on('will-attach-webview',event=>event.preventDefault());
  wc.on('render-process-gone',(_event,detail)=>finish('Preview process terminated ('+detail.reason+'); memory limit is '+memory.defaultLimitBytes/(1024*1024)+' MiB private commit').catch(()=>{}));
  wc.session.webRequest.onBeforeRequest((request,cb)=>{
   if(request.resourceType==='mainFrame'&&!bootstrap){cb({cancel:true});if(request.method==='GET')requestReload(request.url);return;}
   cb({cancel:!network.allowed(request,origin,serverMode)});
  });
  if(serverMode)wc.session.webRequest.onHeadersReceived((details,callback)=>callback({responseHeaders:{...details.responseHeaders,'Content-Security-Policy':[csp.replace("connect-src 'self'","connect-src 'self' "+origin.replace(/^http:/,'ws:'))]}}));
  else wc.session.protocol.handle('lt-preview',request=>{
   try{
    if(request.method!=='GET'&&request.method!=='HEAD')return new Response('Preview provides read-only project files.',{status:405});
    const file=prepared.fromURL(request.url);
    if(bootstrap&&file.toLowerCase()===prepared.entry.toLowerCase())return bootstrapResponse.clone();
    const source=prepared.read(file);if(!source.exists)return new Response('Project file not found.',{status:404});
    const responseType=prepared.typeFor?.(file)||source.type,contentType=/^(text\/|application\/json|image\/svg)/.test(responseType)?responseType+'; charset=utf-8':responseType;
    const body=prepared.response(file);return new Response(request.method==='HEAD'?null:hotController?hotController.decorate(file,body):body,{headers:{'Content-Type':contentType,'Content-Security-Policy':csp,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
   }catch(error){if(errors.length<32)errors.push({message:error.message,location:null});emit('error');return new Response('Preview resource unavailable: '+error.message,{status:403});}
  });
  await wc.loadURL(prepared.url);if(done)throw Error(run.reason);
  clearTimeout(deadline);deadline=setTimeout(()=>finish('Preview inert initialization exceeded 5000 ms').catch(()=>{}),5000);
  // Schedule the inert document before asking for its first compositor frame.
  // Authored code still waits for the verified quota below.
  {
   wc.setBackgroundThrottling(false);
   wc.invalidate();let bootstrapFrame;
   for(let attempt=0;attempt<45;attempt++){try{bootstrapFrame=await wc.capturePage({x:0,y:0,width:1,height:1});if(!bootstrapFrame.isEmpty())break;}catch(error){if(!['Current display surface not available for capture','UnknownVizError'].some(message=>error.message.includes(message)))throw error;}await new Promise(resolve=>setTimeout(resolve,100));if(done)throw Error(run.reason);wc.invalidate();}
   if(!bootstrapFrame||bootstrapFrame.isEmpty())throw Error('Preview bootstrap did not paint');
   if(done)throw Error(run.reason);
   bootstrapPainted=true;
  }
  wc.debugger.attach('1.3');wc.debugger.on('message',(_event,method,params)=>{
   if(done||reloadQueued)return;
   if(method==='CSS.styleSheetAdded'){styleSheets.set(params.header.styleSheetId,params.header.sourceURL);return;}if(method==='CSS.styleSheetRemoved'){styleSheets.delete(params.styleSheetId);return;}
   if(method==='Runtime.bindingCalled'&&params.name===binding&&watch){
    try{watchBytes+=Buffer.byteLength(params.payload);if(watchBytes>128*1024*1024)throw Error('Browser watches exceeded 128 MiB transfer');const decoded=browserWatches.decode(params.payload,watch);if(decoded!==null){watchValues=decoded;emit('watches');}}catch(error){errors.push({message:error.message,location:null,watchRevision:watch.revision||0});finish(error.message).catch(()=>{});}return;
   }
   if(method==='Runtime.exceptionThrown'&&!bootstrap)exception(params.exceptionDetails);
   if(method==='Runtime.consoleAPICalled'){
    if(bootstrap||params.stackTrace?.callFrames?.some(frame=>frame.url.startsWith('node:electron/')))return;
    const text=params.args.map(arg=>arg.value!==undefined?String(typeof arg.value==='object'?JSON.stringify(arg.value):arg.value):arg.description||arg.type).join(' ').slice(0,4096);
    logBytes+=Buffer.byteLength(text);if(logs.length>=128||logBytes>32768){finish('Preview console exceeded 32 KiB / 128 messages').catch(()=>{});return;}logs.push(text);emit('console');
   }
   if(method==='Page.loadEventFired'&&!bootstrap)loadResolve?.();
  });
  await wc.debugger.sendCommand('Runtime.enable');await wc.debugger.sendCommand('Page.enable');if(hotController){await wc.debugger.sendCommand('DOM.enable');await wc.debugger.sendCommand('CSS.enable');}
  clearTimeout(deadline);deadline=setTimeout(()=>finish('Preview quota initialization exceeded 5000 ms').catch(()=>{}),5000);
  pid=wc.getOSProcessId();const excluded=BrowserWindow.getAllWindows().map(window=>window.webContents.getOSProcessId());
  attachment=memory.attach(pid,excluded);quota=await attachment;if(done)throw Error(run.reason);
  if(hotController){const installed=await wc.debugger.sendCommand('Runtime.evaluate',{expression:hotCode.runtime(hotKey),timeout:1500});if(installed.exceptionDetails)throw Error('Live function runtime could not start');}
  if(watch){await wc.debugger.sendCommand('Runtime.addBinding',{name:binding});const installed=await wc.debugger.sendCommand('Runtime.evaluate',{expression:browserWatches.source(watch,binding),timeout:1500});if(installed.exceptionDetails)throw Error('Browser watch collector could not start');}
  // Keep the bootstrap document/process. Navigating to the source before attachment
  // would allow inline scripts to run before the Windows quota is verified.
  bootstrap=false;prepared.enable?.();clearTimeout(deadline);const lifetimeMs=options.liveEdit?options.liveBudgetMs:prepared.lifetimeMs||30000;deadline=setTimeout(()=>finish('Preview lifetime exceeded '+lifetimeMs+' ms').catch(()=>{}),lifetimeMs);
  const loadingMs=network.hasAssets(prepared.html)?15000:serverMode?5000:1500;executionTimer=setTimeout(()=>finish('Preview page loading exceeded '+loadingMs+' ms').catch(()=>{}),loadingMs);
  if(prepared.bootstrap){const setup=prepared.bootstrap,installed=await wc.debugger.sendCommand('Runtime.evaluate',{expression:'import('+JSON.stringify(setup.url)+').then(()=>'+setup.key+'.configure('+JSON.stringify(setup.aliases)+','+JSON.stringify(setup.memoize)+'))',awaitPromise:true,returnByValue:true,timeout:1500});if(installed.exceptionDetails){const item=exception(installed.exceptionDetails),error=Error(item.message);error.location=item.location;throw error;}if(done)throw Error(run.reason);}
  const loaded=new Promise((resolve,reject)=>{loadResolve=resolve;loadReject=reject;});
  const writing=wc.debugger.sendCommand('Runtime.evaluate',{expression:'document.open();document.write('+JSON.stringify(prepared.html)+');document.close();',timeout:1500});
  await Promise.all([loaded,writing]);loadResolve=null;loadReject=null;clearTimeout(executionTimer);
  if(watch&&!done)await flushWatches();if(done)throw Error(run.reason);if(wc.getOSProcessId()!==pid)throw Error('Preview renderer changed after quota attachment.');
  ready=true;if(run.bounds)bounds(owner,run.bounds);emit('ready');return snapshot();
 }catch(error){await finish(error.message);throw error;}
}
function bounds(owner,value){const run=active.get(owner);if(!run||!value||typeof value!=='object')return;
 const keys=['x','y','width','height'];if(keys.some(key=>!Number.isInteger(value[key])||value[key]<0||value[key]>16384))throw Error('Invalid preview bounds.');
 run.bounds={...Object.fromEntries(keys.map(key=>[key,value[key]])),visible:!!value.visible};
 run.view.setBounds(Object.fromEntries(keys.map(key=>[key,value[key]])));run.view.setVisible(!!value.visible&&value.width>0&&value.height>0);
}
async function evaluate(owner,source,options){
 const run=active.get(owner);if(!run)throw Error('Open a browser preview first.');return run.evaluate(source,options);
}
async function shutdown(){await Promise.all([...active.values()].map(run=>run.finish('Application closing')));}
module.exports={start,stop,status,bounds,evaluate,updateWatches:(owner,files,requestId)=>{const run=active.get(owner);if(!run)throw Error('Open a development-server preview first.');if(requestId!==undefined&&requestId!==run.snapshot(false).requestId)throw Error('Preview was replaced before its watch update');return run.updateWatches(files);},shutdown,activeCount:()=>active.size,diagnostics:()=>({recent:[...recent],...memory.status()}),view:owner=>active.get(owner)?.view};
