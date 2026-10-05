'use strict';
window.ltPreview=(()=>{
 let tab=null,tabSlot=null,slot=null,entry=null,mode='file',current=null,loading=false,autoReloading=null,pending=Promise.resolve(),revision=0,section,lastBounds='',checking=false,watchGroup=null,requestId=null,watchUpdating=false,watchUpdateId=0,watchFailure=null,watchPaths=new Set(),sourceInputs=new Map();
 const kw=value=>cljs.core.keyword(value),command=(name,...args)=>lt.objs.command.exec_BANG_(kw(name),...args);
 const info=obj=>obj?cljs.core.clj__GT_js(cljs.core.get(cljs.core.deref(obj),kw('info')))||{}:{};
 const editor=()=>{const selected=lt.objs.tabs.active_tab();return selected&&lt.objs.editor.__GT_cm_ed(selected)?selected:lt.objs.editor.pool.last_active();};
 const editors=()=>cljs.core.to_array(lt.object.by_tag(kw('editor')));
 const normalize=value=>value.replace(/\r\n?|\n/g,'\n');
 const javascriptFile=/\.(?:[cm]?js|jsx|[cm]?ts|tsx)$/i;
 function refreshMenus(){window.lt?.objs?.menu?.main_menu?.();}
 function retainDiagnostics(value,previous=current){const errors=value.errors||[],local=previous?.id===value.id?(previous?.errors||[]).filter(item=>item.frontend):[];return {...value,errors:[...errors,...local.filter(item=>!errors.some(other=>other.message===item.message&&JSON.stringify(other.location)===JSON.stringify(item.location)))].slice(-32)};}
 function render(){
  if(!section)return;section.hidden=!loading&&!current;section.style.display=section.hidden?'none':'';section.replaceChildren();section.dataset.status=current?.stale?'stale':current?.status||'idle';
  const heading=document.createElement('h4');heading.textContent='BROWSER PREVIEW';section.append(heading);
  const label=document.createElement('p');label.id='preview-status';label.textContent=loading?(autoReloading?'Reloading preview…':'Loading preview…'):current?(current.stale?'STALE — project sources changed':current.status==='running'?(current.project?.live?'LIVE — '+current.project.server.script+'\n'+current.project.server.url:'CURRENT — '+entry?.split(/[\\/]/).pop()):current.reason||'Preview stopped'):'Open an HTML or JavaScript file, then use Run → Preview file.';section.append(label);
  if(current?.liveUpdate?.kind==='restart'&&current.liveUpdate.reason){const notice=document.createElement('p');notice.id='preview-restart-reason';notice.textContent='Program restarted: '+current.liveUpdate.reason;section.append(notice);}
  if(current?.result!==null&&current?.result!==undefined){const result=document.createElement('pre');result.id='preview-result';result.textContent=String(current.result);section.append(result);}
  if(current?.logs?.length){const console=document.createElement('pre');console.id='preview-console';console.textContent=current.logs.join('\n');section.append(console);}
  if(current?.watchSnapshot?.bindings?.some(item=>item.status==='unmapped'||item.status==='stale'||item.status==='waiting'&&current.watchSnapshot.revision>0)){const message=document.createElement('p'),unmapped=current.watchSnapshot.bindings.find(item=>item.status==='unmapped');message.id='preview-watch-status';message.textContent=unmapped?'A watch could not be matched to the server code.'+(unmapped.reason?'\n'+unmapped.reason:' Choose a complete expression or refresh after rebuilding.'):'Save watched changes and wait for the server to reload them.';section.append(message);}
  for(const error of [...(current?.errors||[]),...(watchFailure?[watchFailure]:[])]){const block=document.createElement('pre');block.textContent=error.message;section.append(block);if(error.location){if(typeof error.location.sourceLine==='string'){const source=document.createElement('pre');source.className='preview-error-source';source.textContent=error.location.sourceLine;section.append(source);}if(error.location.path){const link=document.createElement('a');link.href='#';link.textContent=error.location.name+':'+error.location.line+':'+error.location.column;link.className='preview-error-link';link.title='Go to the error in the editor';link.onclick=event=>{event.preventDefault();ltProofUI.openError(error.location);};section.append(link);}}}
  if(current?.project){const graph=document.createElement('details'),summary=document.createElement('summary');summary.textContent=(current.project.live?'Served responses':'Browser sources')+' ('+current.project.files.length+')';graph.append(summary);const value=document.createElement('pre');value.textContent=current.project.sha256+'\n'+current.project.files.map(item=>item.name+' · '+(item.origin||'missing')+' · '+(item.sha256||'missing')).join('\n');const originals=[...new Map(current.project.files.flatMap(item=>item.sourceMap?.originals||[]).map(item=>[(item.path||item.url)+'|'+(item.sha256||item.reason),item])).values()];if(originals.length)value.textContent+='\n\nOriginal source snapshots\n'+originals.map(item=>(item.path||item.url||'Unknown source')+' · '+(item.origin||item.status)+' · '+(item.sha256||item.reason)).join('\n');graph.append(value);section.append(graph);}
  if(slot){const visible=current?.status==='running';slot.textContent=visible?'':'Preview stopped. Use Run → Refresh preview to start again.';}refreshMenus();updateBounds();
 }
 function failure(error){loading=false;autoReloading=null;watchGroup?.update('failed');current={...(current||{}),status:'stopped',reason:error.message,errors:[{message:error.message,location:error.location}]};render();return {accepted:false,error:error.message,location:error.location};}
 function bufferSource(obj){let document=cljs.core.get(cljs.core.deref(obj),kw('doc'));while(document&&cljs.core.get(cljs.core.deref(document),kw('root')))document=cljs.core.get(cljs.core.deref(document),kw('root'));return document?lt.objs.document.__GT_val(document):lt.objs.editor.__GT_cm_ed(obj).getValue();}
 function buffers(){const unique=new Map(),selected=editor();for(const obj of [selected,...editors()].filter(Boolean)){if(!lt.objs.editor.__GT_cm_ed(obj))continue;const path=info(obj).path,key=path?.toLowerCase();if(path&&!unique.has(key))unique.set(key,{path,source:bufferSource(obj),...(javascriptFile.test(path)?{loader:ltProofUI.sourceLoader(obj)}:{})});}return [...unique.values()];}
 function open(path,focus=true){
  window.ltLive?.manual();
  const chosen=path||info(editor()).path;if(!chosen||!/\.(?:html?|[cm]?js|jsx|[cm]?ts|tsx)$/i.test(chosen))return Promise.resolve(failure(Error('Select an HTML, JavaScript, JSX or TypeScript file in an opened project.')));
  const sourceEditor=editors().find(obj=>info(obj).path?.toLowerCase()===chosen.toLowerCase());
  mode='file';return start({path:chosen,buffers:buffers(),...(sourceEditor&&javascriptFile.test(chosen)?{loader:ltProofUI.sourceLoader(sourceEditor)}:{})},chosen,focus);
 }
 function openLive(path,liveBudgetMs,restart=false){mode='file';return start({path,buffers:buffers(),liveEdit:true,liveBudgetMs,restart,presentation:'split'},path,false);}
 function openServer(focus=true){window.ltLive?.manual();const server=window.ltNpmUI?.state();if(server?.kind!=='server'||server.status!=='running')return Promise.resolve(failure(Error('Start a development server first.')));mode='server';return start({mode:'server',serverId:server.id},server.root+'\\index.html',focus);}
 function start(options,chosen,focus=true){
  lastBounds='';
  const previous=options.liveEdit?{current,requestId,entry,watchGroup,sourceInputs,watchPaths}:null;
  if(entry!==chosen)watchPaths=new Set();watchPaths.add(chosen.toLowerCase());
  const version=++revision;autoReloading=null;watchFailure=null;watchUpdating=false;watchUpdateId++;options.requestId=requestId=crypto.randomUUID();watchGroup?.update('cancelled');entry=chosen;loading=true;current=null;watchGroup=null;sourceInputs=new Map((options.buffers||[]).map(item=>[item.path.toLowerCase(),{...item}]));
  const capture=captureWatches(version);watchGroup=capture.group;
  for(const file of capture.files)watchPaths.add(file.path.toLowerCase());
  options.watchFiles=mode==='server'?capture.files:capture.files.filter(item=>item.path.toLowerCase()!==chosen.toLowerCase());options.watches=mode==='server'?[]:capture.files.find(item=>item.path.toLowerCase()===chosen.toLowerCase())?.watches||[];
  const sourceEditor=!focus?editor():null;
  if(options.presentation==='split')slot=ltLive.slot();else if(!tab)tab=lt.objs.browser.preview_tab(entry);else{slot=tabSlot;if(focus)lt.objs.tabs.active_BANG_(tab);}
  if(sourceEditor)lt.objs.tabs.active_BANG_(sourceEditor);
  render();if(options.liveEdit&&slot){const rect=slot.getBoundingClientRect();options.bounds={x:Math.max(0,Math.round(rect.left)),y:Math.max(0,Math.round(rect.top)),width:Math.max(1,Math.floor(Math.min(rect.width,innerWidth-rect.left))),height:Math.max(1,Math.floor(Math.min(rect.height,innerHeight-rect.top))),visible:true};}
  pending=window.ltBrowserPreview.start(options).then(value=>{if(version!==revision)return {accepted:false,reason:'replaced'};if(value?.failed){const error=Error(value.error.message);error.location=value.error.location;throw error;}loading=false;current={...value,stale:watchGroup?.stale||false};syncWatches();render();return current;}).catch(async error=>{
   if(version!==revision)return {accepted:false,reason:'replaced'};
   if(previous?.current?.status==='running'){
    const retained=await window.ltBrowserPreview.status().catch(()=>null);if(version!==revision)return {accepted:false,reason:'replaced'};
    if(retained?.id===previous.current.id){requestId=previous.requestId;entry=previous.entry;watchGroup=previous.watchGroup;sourceInputs=previous.sourceInputs;watchPaths=previous.watchPaths;loading=false;current={...previous.current,stale:true,errors:[{message:error.message,location:error.location,frontend:true}]};watchGroup?.update('failed');render();return {accepted:false,error:error.message,location:error.location,retained:true};}
   }
   return failure(error);
  });return pending;
 }
 function captureWatches(version){return ltProofUI.browserWatches(entry,()=>{if(version!==revision)return;watchGroup.stale=true;if(current){current.stale=true;render();}if(mode==='server'&&current?.status==='running')updateServerWatches();});}
 function updateServerWatches(prospective){
  if(mode!=='server'||current?.status!=='running'||loading||autoReloading)return Promise.resolve();const expectedRevision=revision,id=++watchUpdateId;watchFailure=null;watchUpdating=true;const capture=prospective||captureWatches(expectedRevision);watchGroup=capture.group;current.stale=true;watchGroup.update('stale');render();
  pending=window.ltBrowserPreview.updateWatches(capture.files,requestId).then(value=>{if(expectedRevision!==revision||id!==watchUpdateId)return {accepted:false,reason:'replaced'};if(value?.failed){const error=Error(value.error.message);error.location=value.error.location;throw error;}watchUpdating=false;current=retainDiagnostics(value);syncWatches();render();return current;}).catch(error=>{if(expectedRevision!==revision||id!==watchUpdateId)return {accepted:false,reason:'replaced'};watchUpdating=false;watchFailure={message:error.message,location:error.location};watchGroup.stale=true;watchGroup.update('failed');current.stale=true;render();return {accepted:false,error:error.message,location:error.location};});return pending;
 }
 function prepareSave(obj,path,content,resume){
  if(mode!=='server'||current?.status!=='running'||info(obj).path!==path||!handlesWatch(obj)||!lt.objs.clients.javascript.watch_specs(obj).length)return resume(null);
  const expectedRevision=revision;let capture;
  try{
   capture=captureWatches(expectedRevision);const file=capture.files.find(item=>item.path.toLowerCase()===path.toLowerCase());if(!file)throw Error('No watched save input');
   const cm=lt.objs.editor.__GT_cm_ed(obj),shadow=cm.getDoc().copy(false),marks=file.watches.map(spec=>({spec,mark:shadow.markText(shadow.posFromIndex(spec.from),shadow.posFromIndex(spec.to),{inclusiveLeft:true,inclusiveRight:true})}));
   // Use the exact save edits on a detached document. Its marks move while the
   // authored editor stays untouched until the confirmed disk write succeeds.
   lt.objs.editor.file.save_content_BANG_({getValue:()=>shadow.getValue(),posFromIndex:index=>shadow.posFromIndex(index),replaceRange:(...args)=>shadow.replaceRange(...args),operation:action=>action()},content);
   file.source=shadow.getValue();file.watches=marks.flatMap(({spec,mark})=>{const range=mark.find();return range?[{...spec,from:shadow.indexFromPos(range.from),to:shadow.indexFromPos(range.to)}]:[];});
  }catch(_){if(capture){watchGroup=capture.group;watchGroup.stale=true;if(current)current.stale=true;syncWatches();render();}return resume(null);}
  const finish=()=>{if(expectedRevision!==revision||mode!=='server'||current?.status!=='running')return;try{updateServerWatches();}catch(_){}};
  // Preparation is a preview concern; invalid project syntax cannot prevent a
  // file save. The caller still checks source and disk again before writing.
  return updateServerWatches(capture).then(()=>resume(finish),()=>resume(finish));
 }
 function missingBufferChanged(item,obj){
  const input=sourceInputs.get(item.path.toLowerCase());
  if(!input)return !!obj;
  return !obj||input.loader!==undefined&&ltProofUI.sourceLoader(obj)!==input.loader||normalize(lt.objs.editor.__GT_cm_ed(obj).getValue())!==normalize(input.source);
 }
 function sourceEditorsChanged(project){
  if(!project||project.live)return false;
  for(const item of project.files||[]){if(!item.path||item.kind==='resolution-source')continue;const obj=editors().find(candidate=>info(candidate).path?.toLowerCase()===item.path.toLowerCase());if(item.exists===false){if(missingBufferChanged(item,obj))return true;continue;}if(!obj)continue;if(item.loader!==undefined&&ltProofUI.sourceLoader(obj)!==item.loader)return true;const source=typeof item.source==='string'?item.source:sourceInputs.get(item.path.toLowerCase())?.source;if(item.source!==null&&typeof source==='string'&&normalize(lt.objs.editor.__GT_cm_ed(obj).getValue())!==normalize(source))return true;}
  return false;
 }
 function syncWatches(){
  if(!current)return;if(sourceEditorsChanged(current.project))current.stale=true;if(!watchGroup)return;if(watchGroup.changed())watchGroup.stale=true;for(const file of current.project?.files||[]){if(file.path)watchPaths.add(file.path.toLowerCase());for(const original of file.sourceMap?.originals||[])if(original.path&&original.status==='captured')watchPaths.add(original.path.toLowerCase());}
  const bindings=current.watchSnapshot?.bindings||[],unmapped=bindings.some(item=>item.status==='unmapped'),sourceStale=bindings.some(item=>item.status==='stale'||item.status==='waiting'&&current.watchSnapshot.revision>0),errors=current.errors?.some(item=>!current.project?.live||item.watchRevision===current.watchSnapshot?.revision);
  current.stale=current.project?.live?!!autoReloading||watchUpdating||watchGroup.stale||sourceStale:current.stale||watchGroup.stale;
  watchGroup.update(errors||unmapped||watchFailure?'failed':current.status==='stopped'?'cancelled':current.stale?'stale':current.status==='running'?'current':'running',current.watches||[]);
 }
 function handlesWatch(obj){const file=info(obj).path;return (loading||current?.status==='running')&&watchPaths.has(file?.toLowerCase());}
 function watchChanged(){return window.ltLive?.state().entry===entry&&!ltLive.paused()?openLive(entry,Math.max(100,ltLive.state().expiresAt-Date.now())):mode==='server'?openServer(false):open(entry,false);}
 function evaluateSelection(){
  try{
   const expectedRevision=revision,expectedRun=current?.id;
   const obj=editor(),cm=obj&&lt.objs.editor.__GT_cm_ed(obj);if(!cm)throw Error('Select JavaScript, JSX or TypeScript in an editor first.');
   const selected=cm.somethingSelected(),from=selected?cm.getCursor('from'):{line:cm.getCursor().line,ch:0},source=selected?cm.getSelection():cm.getLine(from.line),bufferSource=cm.getValue(),loader=ltProofUI.sourceLoader(obj);
   const metadataBuffers=[],projectRoot=current?.project?.root;
   if(typeof projectRoot==='string')for(const item of current.project.files||[]){
    if(item.snapshotRole!=='metadata'||item.kind==='resolution-source'||typeof item.path!=='string'||!item.path.replace(/\//g,'\\').toLowerCase().startsWith(projectRoot.replace(/\//g,'\\').replace(/\\+$/,'').toLowerCase()+'\\'))continue;
    const candidate=editors().find(object=>info(object).path?.toLowerCase()===item.path.toLowerCase());if(!candidate)continue;
    const text=lt.objs.editor.__GT_cm_ed(candidate).getValue();let saved;try{saved=ltProof.read(item.path);}catch(_){}
    if(typeof saved!=='string'||text.replace(/\r\n?|\n/g,'\n')!==saved.replace(/\r\n?|\n/g,'\n'))metadataBuffers.push({path:item.path,source:text});
   }
   pending=window.ltBrowserPreview.evaluate(source,{path:info(obj).path,loader,bufferSource,lineOffset:from.line,columnOffset:from.ch,...(metadataBuffers.length?{buffers:metadataBuffers}:{})}).then(value=>{if(expectedRevision!==revision||expectedRun!==current?.id||autoReloading)return {accepted:false,reason:'replaced'};if(value?.failed){const error=Error(value.error.message);error.location=value.error.location;throw error;}const errors=value.errors||[],local=value.id===current?.id?(current?.errors||[]).filter(item=>item.frontend):[];current={...value,errors:[...errors,...local.filter(item=>!errors.some(other=>other.message===item.message&&JSON.stringify(other.location)===JSON.stringify(item.location)))].slice(-32),stale:current?.stale||bufferSource!==cm.getValue()||loader!==ltProofUI.sourceLoader(obj)};syncWatches();render();return current;}).catch(error=>{if(expectedRevision!==revision||expectedRun!==current?.id||autoReloading)return {accepted:false,reason:'replaced'};if(current?.status==='running'){current.stale=current.stale||bufferSource!==cm.getValue()||loader!==ltProofUI.sourceLoader(obj);if(!(current.errors||[]).some(item=>item.message===error.message&&JSON.stringify(item.location)===JSON.stringify(error.location)))current.errors=[...(current.errors||[]),{message:error.message,location:error.location,frontend:true}].slice(-32);syncWatches();render();return {accepted:false,error:error.message,location:error.location};}return failure(error);});return pending;
  }catch(error){return Promise.resolve(failure(error));}
 }
 function updateBounds(){
  if(!slot||!current)return;const rect=slot.getBoundingClientRect(),style=getComputedStyle(slot),visible=current.status==='running'&&style.visibility==='visible'&&style.display!=='none'&&rect.width>0&&rect.height>0&&!document.querySelector('dialog[open],.popup')&&!(slot.id==='live-preview-slot'&&document.querySelector('#right-bar > .content > .active'));
  const value={x:Math.max(0,Math.round(rect.left)),y:Math.max(0,Math.round(rect.top)),width:Math.max(0,Math.floor(Math.min(rect.width,innerWidth-rect.left))),height:Math.max(0,Math.floor(Math.min(rect.height,innerHeight-rect.top))),visible};
  const encoded=JSON.stringify(value);if(encoded!==lastBounds){lastBounds=encoded;window.ltBrowserPreview.bounds(value);}
 }
 async function checkSources(){
  if(checking||!current?.project||current.project.live||current.status!=='running'||current.stale)return;syncWatches();if(current.stale){render();return;}checking=true;
  const observed=current;
  try{
   const sources=observed.project.files,disk=ltSnapshots.fingerprints(sources.map(item=>item.path));
   for(let index=0;index<sources.length;index++){
    const item=sources[index],obj=item.kind==='resolution-source'?null:editors().find(candidate=>info(candidate).path?.toLowerCase()===item.path.toLowerCase());let changed;
    if(item.resolutionSha256!==undefined&&disk[index]!==item.resolutionSha256)changed=true;
    else if(item.exists===false)changed=missingBufferChanged(item,obj)||disk[index]!==item.sha256;
    else if(obj&&item.loader!==undefined&&ltProofUI.sourceLoader(obj)!==item.loader)changed=true;
    else if(obj&&item.source!==null){const text=lt.objs.editor.__GT_cm_ed(obj).getValue();if(typeof item.source==='string')changed=normalize(text)!==normalize(item.source);else{const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));changed=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('')!==item.sha256;}}
    else changed=disk[index]!==item.sha256;
    if(changed&&current===observed){current.stale=true;syncWatches();render();if(slot?.id==='live-preview-slot')ltLive.diskChanged();break;}
   }
  }catch(_){if(current===observed){current.stale=true;syncWatches();render();}}finally{checking=false;}
 }
 function stop(user=true){if(user)window.ltLive?.stopped('Stopped. Click Run above to resume.');const expectedRevision=++revision;autoReloading=null;watchUpdateId++;watchUpdating=false;watchFailure=null;loading=false;watchGroup?.update('cancelled');if(current)current.status='stopped';render();pending=window.ltBrowserPreview.stop().then(value=>{if(expectedRevision!==revision)return {accepted:false,reason:'replaced'};if(value){current=retainDiagnostics(value);syncWatches();render();}return value;}).catch(error=>expectedRevision===revision?failure(error):{accepted:false,reason:'replaced'});return pending;}
 window.ltBrowserPreview.onEvent(message=>{
  if(requestId&&message.requestId!==requestId)return;
  if(current&&message.id!==current.id&&!(autoReloading===current.id&&message.reloadFrom===autoReloading))return;
  if(message.kind==='reloading'){
   if(current?.status!=='running')return;autoReloading=current.id;loading=true;watchUpdateId++;watchUpdating=false;watchFailure=null;
  }
  if(loading&&message.kind==='stopped'&&(!autoReloading||message.id===autoReloading))return;
  if(message.kind==='stopped'&&slot?.id==='live-preview-slot')ltLive.stopped(message.reason);
  const previous=current;current={...retainDiagnostics(message),stale:previous?.stale||false};
  if(autoReloading&&(message.kind==='ready'||message.kind==='stopped'||message.kind==='reload-failed')){
   autoReloading=null;loading=false;lastBounds='';if(watchGroup)watchGroup.stale=watchGroup.changed();
  }
  if(previous?.project){const identity=(item,project)=>project.live?item.name:item.path||item.name,known=new Map(previous.project.files.map(item=>[identity(item,previous.project),item]));current.project.files=current.project.files.map(item=>{const old=known.get(identity(item,current.project));return old?.sha256===item.sha256&&old?.loader===item.loader&&old?.kind===item.kind&&old?.snapshotRole===item.snapshotRole&&old?.resolutionSha256===item.resolutionSha256?{...old,...item}:item;});}
  syncWatches();render();if(message.kind==='ready'&&watchGroup?.changed()&&mode==='server')updateServerWatches();
 });
 return {initialize(){section=document.createElement('section');section.id='preview-activity';section.style.cssText='border-top:1px solid #4a5550;margin-top:20px;white-space:pre-wrap;overflow-wrap:anywhere';document.getElementById('proof-calculation').append(section);const style=document.createElement('style');style.textContent='#preview-activity pre{font:12px/1.5 Consolas,monospace;white-space:pre-wrap;max-height:180px;overflow:auto} #preview-activity[data-status=stale]{color:#efd398} .preview-error-link{color:#b9cfbf;text-decoration:underline} .revival-preview-slot{position:absolute;inset:0;background:#17201c;color:#d9ede2;display:flex;align-items:center;justify-content:center}';document.head.append(style);setInterval(updateBounds,100);setInterval(checkSources,500);render();},placeholder(id,path){const node=document.createElement('div');node.className='revival-preview-slot';node.dataset.previewId=id;node.textContent='Preparing '+path.split(/[\\/]/).pop()+'…';slot=tabSlot=node;lastBounds='';return node;},closed(id){if(tabSlot?.dataset.previewId===String(id)){const previousSlot=tabSlot;tab=null;tabSlot=null;if(slot===previousSlot){stop();slot=null;}}},open,openLive,buffers,openServer,handlesWatch,watchChanged,prepareSave,hasServer:()=>window.ltNpmUI?.state()?.kind==='server'&&window.ltNpmUI.state().status==='running',refresh:()=>mode==='server'?openServer():entry?open(entry):open(),evaluateSelection,stop,hasFile:()=>/\.(?:html?|[cm]?js|jsx|[cm]?ts|tsx)$/i.test(info(editor()).path||''),hasEntry:()=>!!entry&&(mode!=='server'||window.ltNpmUI?.state()?.status==='running'),isRunning:()=>loading||current?.status==='running',state:()=>current,pending:()=>pending,checkSources};
})();
