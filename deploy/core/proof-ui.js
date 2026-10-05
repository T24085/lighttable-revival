'use strict';
window.ltProofUI=(()=>{
let cm=null,runId=0,running=null,pending=Promise.resolve(),menuSignature='',menuTimer;
const states=new WeakMap(),documents=new Map();
const javascriptFile=/\.(?:[cm]?js|jsx|[cm]?ts|tsx)$/i,javascriptMimes=new Set(['text/javascript','text/jsx','text/typescript','text/typescript-jsx']);
const panel=document.createElement('aside');panel.id='proof-calculation';panel.style.cssText='position:fixed;right:0;top:40px;bottom:20px;width:340px;padding:18px;box-sizing:border-box;background:#202526;color:#e5ece8;border-left:1px solid #4a5550;z-index:25;font:13px/1.5 Consolas,monospace;overflow:auto';
panel.setAttribute('aria-label','JavaScript activity and results');
const title=document.createElement('h3');title.textContent='ACTIVITY';title.style.cssText='font:12px Arial;letter-spacing:2px;color:#9cb9ae;margin:0 0 18px';panel.append(title);
const versions=document.createElement('div');versions.id='proof-versions';versions.setAttribute('role','status');versions.style.cssText='padding:8px;background:#2a3530;border-left:3px solid #87b19a;margin:12px 0';panel.append(versions);
const notice=document.createElement('p');notice.id='proof-notice';notice.style.cssText='color:#b9cfbf;font:12px Arial';panel.append(notice);
const output=document.createElement('div');output.id='proof-output';output.setAttribute('aria-live','polite');output.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;margin-top:12px';output.textContent='Results and errors appear here when you run a file.';panel.append(output);
function visibleEditor(candidate){const wrapper=candidate?.getWrapperElement(),rect=wrapper?.getBoundingClientRect(),style=wrapper&&getComputedStyle(wrapper);return !!rect&&rect.width>0&&rect.height>0&&style.visibility==='visible'&&style.display!=='none';}
function originalEditor(){
 if(!window.lt?.objs.editor?.pool)return null;
 // Inactive tabs use visibility:hidden and keep their layout dimensions.
 // The selected tab is authoritative even before Chromium delivers focus.
 const selected=lt.objs.tabs.active_tab(),previous=lt.objs.editor.pool.last_active();
 for(const candidate of [selected,previous])if(candidate&&visibleEditor(lt.objs.editor.__GT_cm_ed(candidate)))return candidate;
 return cljs.core.to_array(lt.object.by_tag(cljs.core.keyword('editor'))).find(candidate=>visibleEditor(lt.objs.editor.__GT_cm_ed(candidate)))||null;
}
function editor(){const active=originalEditor();return active?lt.objs.editor.__GT_cm_ed(active):null;}
function documentInfo(obj=originalEditor()){return (obj?cljs.core.clj__GT_js(cljs.core.get(cljs.core.deref(obj),cljs.core.keyword('info'))):null)||{};}
function pathKey(path){return typeof path==='string'?path.replace(/\//g,'\\').toLowerCase():null;}
function documentStates(){return new Set([...documents.values()].flatMap(items=>[...items]));}
function indexDocument(s,previous){const oldKey=pathKey(previous),key=pathKey(s.path);if(oldKey){const items=documents.get(oldKey);items?.delete(s);if(!items?.size)documents.delete(oldKey);}if(key){if(!documents.has(key))documents.set(key,new Set());documents.get(key).add(s);}}
function identitySnapshot(s){return {identity:s.identity,path:s.path,name:s.name};}
function syncIdentity(s,obj=s.editorObject){
 const info=documentInfo(obj),backingDocument=obj?cljs.core.get(cljs.core.deref(obj),cljs.core.keyword('doc')):undefined;
 if(s.editorObject===obj&&s.path===info.path&&s.name===(info.name||'Untitled')&&s.backingDocument===backingDocument)return false;
 const previous=s.path;s.editorObject=obj;s.path=info.path;s.name=info.name||'Untitled';s.backingDocument=backingDocument;s.identity++;indexDocument(s,previous);s.error=null;s.last=null;
 if(!s.displayed)s.status='idle';markStale(s);if(s.watchOwner&&s.watchOwner!==s)markStale(s.watchOwner);
 for(const other of documentStates())if(other!==s&&other.displayed&&graphFiles(other.displayed).some(item=>item.kind!=='resolution-source'&&[pathKey(previous),pathKey(s.path)].includes(pathKey(item.path))))markStale(other);
 if(running&&(running.watchRoot===s||running.watchRoot?.watchEditors?.some(item=>item.state===s))){const job=running;job.invalidated='editor identity changed';runId++;running=null;if(!job.watchRoot.displayed)job.watchRoot.status='cancelled';watchState(job.watchRoot,'stale');try{Promise.resolve(window.ltProof.cancelJavascript()).catch(()=>{});}catch(_){}}
 return true;
}
function identityChanged(obj){const editor=lt.objs.editor.__GT_cm_ed(obj);if(!editor)return false;const previous=states.get(editor)?.identity,s=observe(editor,obj),changed=previous!==undefined&&previous!==s.identity;if(changed){notice.textContent='Saved as '+s.name+'. Run to update the result.';render();refreshMenus(true);}return changed;}
function capturedIdentityChanged(item){syncIdentity(item.state);return item.identity!==undefined&&item.identity!==item.state.identity;}
function captureGraphEditors(){return cljs.core.to_array(lt.object.by_tag(cljs.core.keyword('editor'))).filter(obj=>documentInfo(obj)?.path&&lt.objs.editor.__GT_cm_ed(obj)).map(obj=>{const s=observe(lt.objs.editor.__GT_cm_ed(obj),obj);return {state:s,...identitySnapshot(s)};});}
function graphEditorsChanged(result,editors=[]){const paths=new Set(graphFiles(result).filter(item=>item.kind!=='resolution-source').map(item=>pathKey(item.path)));return editors.some(item=>paths.has(pathKey(item.path))&&capturedIdentityChanged(item));}
function hasJavaScriptEditor(obj=originalEditor()){const info=documentInfo(obj);return javascriptFile.test(info?.path||'')||javascriptMimes.has(info?.mime);}
function hasExecutionEditor(obj=originalEditor()){return hasJavaScriptEditor(obj)||/\.(?:pyw?|cljc?|cljs)$/i.test(documentInfo(obj)?.path||'');}
function sourceLoader(obj=originalEditor()){const info=documentInfo(obj),mime=info?.mime;return mime==='text/javascript'?'js':mime==='text/jsx'?'jsx':mime==='text/typescript-jsx'?'tsx':mime==='text/typescript'?'ts':/\.tsx$/i.test(info?.path||'')?'tsx':/\.[cm]?ts$/i.test(info?.path||'')?'ts':/\.jsx$/i.test(info?.path||'')?'jsx':'js';}
function name(){return documentInfo()?.name||'Untitled';}
const normalize=source=>source.replace(/\r\n?|\n/g,'\n');
function projectChanged(result){
 if(!result.project)return false;
 const modules=result.project.modules,metadata=result.project.metadata||[],items=[...modules,...metadata];let fingerprints;
 try{fingerprints=ltSnapshots.fingerprints(items.map(item=>item.path));}catch(_){return true;}
 for(let i=0;i<items.length;i++){
  const item=items[i],ed=item.kind==='resolution-source'?null:cljs.core.first(lt.objs.editor.pool.by_path(item.path));
  if(ed&&item.loader!==undefined&&sourceLoader(ed)!==item.loader)return true;
  if(ed&&item.source!==null&&normalize(lt.objs.editor.__GT_cm_ed(ed).getValue())!==normalize(item.source||''))return true;
  if((!ed||i>=modules.length||item.source===null)&&fingerprints[i]!==item.sha256)return true;
 }
 return false;
}
function graphFiles(result){return [...(result.project?.modules||[]),...(result.project?.metadata||[])];}
function watchInputsChanged(s){return (s.watchEditors||[]).some(item=>capturedIdentityChanged(item)||item.state.version!==item.version||item.editor.getValue()!==item.source||item.loader!==undefined&&sourceLoader(item.state.editorObject)!==item.loader||JSON.stringify(lt.objs.clients.javascript.watch_specs(item.state.editorObject))!==item.specs);}
function projectView(project){
 const graph=document.createElement('details'),summary=document.createElement('summary'),identity=document.createElement('pre');
 graph.id='proof-project-snapshot';summary.textContent=(project.snapshotKind==='inputs'?'Saved project inputs: ':'Project snapshot: ')+project.modules.length+' files';
 identity.textContent='Project SHA-256\n'+project.sha256+'\nCompiler: '+project.compiler;identity.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere';graph.append(summary,identity);
 if(project.packages?.length){const versions=document.createElement('p');versions.id='proof-package-versions';versions.textContent='Packages\n'+project.packages.map(item=>item.name+' @ '+item.version).join('\n');versions.title=project.packages.map(item=>item.name+' @ '+item.version+'\n'+item.path).join('\n');graph.append(versions);}
 const paths=new Set(project.modules.map(item=>item.path.toLowerCase()));
 for(const item of [...project.modules,...(project.metadata||[]).filter(item=>item.exists&&!paths.has(item.path.toLowerCase()))]){
  const detail=document.createElement('details'),label=document.createElement('summary');label.textContent=item.name+' ('+(item.origin||'metadata')+')';detail.append(label);
  detail.ontoggle=()=>{if(!detail.open||detail.childNodes.length>1)return;const source=document.createElement('pre');source.textContent=item.sha256+'\n'+(item.source===null?'Binary input: '+item.byteLength+' bytes':item.source);source.style.cssText='white-space:pre-wrap;max-height:260px;overflow:auto';detail.append(source);};graph.append(detail);
 }
 graph.style.cssText='font-size:11px;white-space:pre-wrap;overflow-wrap:anywhere';output.append(graph);
}
function watchState(s,status,values=[]){for(const item of s?.watchEditors||[{state:s,version:s?.version}]){const target=item.state,targetEditor=target?.editorObject&&lt.objs.editor.__GT_cm_ed(target.editorObject);if(targetEditor&&(target.watchOwner===s||target===s&&!target.watchOwner)){window.lt?.objs?.clients?.javascript?.watch_status_BANG_(target.editorObject,status,values,item.version);for(const node of targetEditor.getWrapperElement().querySelectorAll('.watch-result')){node.title+=' | Run '+s.name+' | '+(s.watchRuntime||'JavaScript');node.dataset.watchCaller=s.name;}}}}
function markStale(s){watchState(s,'stale');s?.onStale?.();if(!s.displayed)return;s.status='stale';if(s.inlineNode){s.inlineNode.dataset.status='stale';s.inlineNode.textContent='STALE v'+(s.displayed.editorVersion+1)+' → '+String(s.displayed.result).slice(0,220);}}
function state(){return cm&&states.get(cm);}
function refreshMenus(force=false){
 const project=window.ltProjects?.info();
 const signature=JSON.stringify([!!editor(),documentInfo()?.path,documentInfo()?.mime,!!running,window.lt?.objs?.clients?.javascript?.connected_QMARK_?.(),project?.current?.path,project?.recents,nodeScripts()]);
 if(!force&&signature===menuSignature)return;
 menuSignature=signature;clearTimeout(menuTimer);
 menuTimer=setTimeout(()=>window.lt?.objs?.menu?.main_menu?.(),20);
}
function refresh(){const s=state();versions.textContent=s?s.name+'\nCode v'+(s.version+1)+(running?' | Running '+running.name+' v'+(running.version+1):'')+(s.displayed?' | Result v'+(s.displayed.editorVersion+1):' | No result'):'No active file';versions.dataset.status=output.dataset.status||'idle';refreshMenus();}
function resultView(result,status,message){output.replaceChildren();output.dataset.status=status;const label=document.createElement('strong');label.textContent=message;output.append(label);const hash=document.createElement('p');hash.style.cssText='font-size:11px;color:#b1c6ba';hash.textContent='Source SHA-256\n'+result.sha256;const value=document.createElement('pre');let text=String(result.result);try{text=JSON.stringify(JSON.parse(text),null,2);}catch(_){}value.textContent=text;value.style.cssText='font:13px/1.45 Consolas,monospace;background:#17201c;padding:10px;white-space:pre-wrap;overflow-wrap:anywhere;max-height:230px;overflow:auto';output.append(value);if(result.logs?.length){const logs=document.createElement('pre');logs.id='proof-logs';logs.textContent='Console\n'+result.logs.join('\n');logs.style.cssText='font-size:12px;white-space:pre-wrap;max-height:160px;overflow:auto';output.append(logs);}const details=document.createElement('details'),summary=document.createElement('summary'),source=document.createElement('pre');summary.textContent=(result.scope||'file')+' snapshot v'+(result.editorVersion+1);source.textContent=result.source;source.style.cssText='font-size:11px;white-space:pre-wrap;max-height:160px;overflow:auto';details.append(summary,hash,source);output.append(details);if(result.project)projectView(result.project);refresh();}
function openError(location){
 try{
  const key=path=>typeof path==='string'?path.replace(/\//g,'\\').toLowerCase():null;
  if(location.path){const existing=cljs.core.first(lt.objs.editor.pool.by_path(location.path))||cljs.core.to_array(lt.object.by_tag(cljs.core.keyword('editor'))).find(obj=>key(documentInfo(obj).path)===key(location.path));if(existing)lt.objs.tabs.active_BANG_(existing);else command('open-path',location.path);}
  const target=connect();if(!target||location.path&&key(documentInfo(originalEditor()).path)!==key(location.path))throw Error('The error source could not be opened.');
  const line=Math.max(0,Math.min(target.lastLine(),location.line-1)),ch=Math.max(0,Math.min(target.getLine(line).length,location.column-1));
  target.setCursor({line,ch});target.focus();target.scrollIntoView({line,ch},80);
  const captured=location.bufferSource??location.source;
  notice.textContent=typeof captured==='string'&&normalize(target.getValue())===normalize(captured)?'Error at '+location.name+':'+location.line+':'+location.column:'This file changed since the failed run. The error refers to its captured source.';
 }catch(error){notice.textContent=error.message;}
}
function render(){const s=state();if(!s){output.dataset.status='idle';output.textContent='Results and errors appear here when you run a file.';}else if(running?.editor===cm){output.dataset.status='running';output.textContent=(running.nodeId?'Running '+running.runtimeLabel:'Running code')+' v'+(running.version+1)+'...'+(running.liveOutput?'\n\n'+running.liveOutput:'');}else if(s.error){
 output.dataset.status='rejected';output.textContent='Run failed for code v'+(s.errorVersion+1)+'\n\n'+friendly(s.error)+'\n\nEdit the code, then Run again.';
 if(s.error.location){const location=s.error.location,source=document.createElement('pre'),jump=document.createElement('a');source.textContent=location.sourceLine;source.style.cssText='font:12px/1.5 Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere;background:#342624;padding:8px';jump.id='proof-error-open';jump.href='#';jump.textContent=location.name+':'+location.line+':'+location.column;jump.title='Go to the error in the editor';jump.style.cssText='color:#b9cfbf;text-decoration:underline;cursor:pointer';jump.onclick=event=>{event.preventDefault();openError(location);};output.append(source,jump);}
 if(s.error.logs?.length){const logs=document.createElement('pre');logs.id='proof-logs';logs.textContent='Console\n'+s.error.logs.join('\n');logs.style.cssText='font-size:12px;white-space:pre-wrap;max-height:160px;overflow:auto';output.append(logs);}
 }else if(s.displayed)resultView(s.displayed,s.status,s.status==='stale'?'STALE - code changed':'CURRENT - code v'+(s.displayed.editorVersion+1)+' result');else{output.dataset.status=s.status;output.textContent=s.status==='cancelled'?'Stopped. Edit the code or Run again.':'No result for this file yet.';}refresh();}
function inline(runEditor,s,result,line,stale){s.widget?.clear();const node=document.createElement('div');node.className='revival-inline-result';node.dataset.status=stale?'stale':'current';node.textContent=(stale?'STALE ':'')+'v'+(result.editorVersion+1)+' → '+String(result.result).slice(0,220);node.title=result.sha256;s.inlineNode=node;s.widget=runEditor.addLineWidget(Math.min(line,runEditor.lastLine()),node,{coverGutter:false,noHScroll:true});}
function observe(observed,obj=originalEditor()){if(!states.has(observed)){const info=documentInfo(obj),s={version:0,identity:0,name:info.name||'Untitled',path:info.path,backingDocument:obj?cljs.core.get(cljs.core.deref(obj),cljs.core.keyword('doc')):undefined,editorObject:obj,last:null,displayed:null,status:'idle',error:null};states.set(observed,s);indexDocument(s);observed.on('change',()=>{syncIdentity(s);s.version++;s.error=null;markStale(s);if(s.watchOwner&&s.watchOwner!==s)markStale(s.watchOwner);for(const other of documentStates())if(other!==s&&other.displayed&&graphFiles(other.displayed).some(m=>m.kind!=='resolution-source'&&pathKey(m.path)===pathKey(s.path)))markStale(other);if(observed===cm){notice.textContent=window.ltLive?.state().entry&&!ltLive.paused()?'Edits update the live program automatically.':'Edited. Run to update the result.';render();}else if(state()?.status==='stale'){render();}});}const s=states.get(observed);syncIdentity(s,obj);return s;}
function connect(){const selected=originalEditor(),next=selected?lt.objs.editor.__GT_cm_ed(selected):null;if(selected&&selected!==lt.objs.editor.pool.last_active())lt.object.raise(selected,cljs.core.keyword('active'));const previous=next&&states.get(next)?.identity,s=next&&observe(next,selected);if(next!==cm||s&&previous!==s.identity){cm=next;render();}return cm;}
function command(commandName,...args){lt.objs.command.exec_BANG_(cljs.core.keyword(commandName),...args);}
function friendly(error){const text=String(error.message||error).replace(/^Error invoking remote method '[^']+': (?:Error: )?/,'');if(text.includes('Execution exceeded'))return 'Stopped after 1.5 seconds. Finish sooner or reduce the work.';if(text.includes('startup exceeded'))return 'The evaluation context did not start in time. Try Run again.';if(text.includes('Array buffer allocation failed')||text.includes('observed working set'))return 'The memory limit prevented this allocation. Reduce the data size.';return text;}
function errorView(error){const s=state();if(s){s.error=error;s.errorVersion=s.version;s.status='rejected';render();}else{output.dataset.status='rejected';output.textContent=friendly(error);refresh();}}
function openSample(sample){if(!['order-report.js','calculation.js'].includes(sample))throw Error('Unknown example.');command('open-path',window.ltProof.info.docs+'\\'+sample);connect();if(cm){cm.focus();notice.textContent='';}}
function perform(action){try{return Promise.resolve(action==='arithmetic'?evaluate():runJavaScript(action)).catch(errorView);}catch(error){errorView(error);}}
function evaluate(transport=source=>window.ltProof.calculate(source),scope='file',options={}){
connect();const target=options.editorObject||originalEditor(),runEditor=target?lt.objs.editor.__GT_cm_ed(target):cm;if(!runEditor)return Promise.reject(Error('Open a JavaScript file first.'));
const s=observe(runEditor,target),buffer=runEditor.getValue(),loader=hasJavaScriptEditor(target)?sourceLoader(target):undefined,source=scope==='selection'?(runEditor.somethingSelected()?runEditor.getSelection():runEditor.getLine(runEditor.getCursor().line)):buffer,version=s.version,line=scope==='selection'?runEditor.getCursor('to').line:runEditor.lastLine();
const origin=scope==='selection'?(runEditor.somethingSelected()?runEditor.getCursor('from'):{line:runEditor.getCursor().line,ch:0}):{line:0,ch:0},identity=identitySnapshot(s),sourcePath=identity.path,sourceName=identity.name,graphEditors=captureGraphEditors(),id=++runId;
if(running?.watchRoot)watchState(running.watchRoot,'cancelled');s.watchRuntime=options.runtimeLabel||'JavaScript';s.watchEditors=options.watchEditors||[{state:s,...identity,version:s.version,editor:runEditor,source:buffer,loader,specs:JSON.stringify(target?lt.objs.clients.javascript.watch_specs(target):[])}];for(const item of s.watchEditors)item.state.watchOwner=s;
const job={editor:runEditor,version,name:sourceName,...options,watchRoot:s};running=job;watchState(s,'running');s.error=null;notice.textContent='';render();
pending=(async()=>{try{
 const result={...await transport(source),...(loader!==undefined?{loader}:{}),editorVersion:version,fileName:sourceName,filePath:sourcePath||null,scope};syncIdentity(s,target);const changedInputs=watchInputsChanged(s),changedGraph=graphEditorsChanged(result,graphEditors);
 if(id!==runId)return {accepted:false,reason:job.invalidated||'superseded',result};running=null;const stale=identity.identity!==s.identity||version!==s.version||buffer!==runEditor.getValue()||loader!==undefined&&sourceLoader(target)!==loader||projectChanged(result)||changedInputs||changedGraph;s.displayed=result;s.displayedEditors=graphEditors;s.status=stale?'stale':'current';watchState(s,s.status,result.watches||[]);if(!stale)s.last=result;inline(runEditor,s,result,line,stale);connect();render();return {accepted:!stale,...(stale?{reason:'source changed'}:{}),result};
 }catch(error){
 const original=error.location,samePath=sourcePath?pathKey(original?.path)===pathKey(sourcePath):!original?.path&&original?.name==='Untitled';if(original&&scope==='selection'&&original.kind!=='compiler-configuration'&&original.source===source&&samePath){const at=original.line+origin.line;error.location={...original,path:sourcePath||null,name:sourceName,line:at,column:original.column+(original.line===1?origin.ch:0),bufferSource:buffer,sourceLine:buffer.split(/\r\n|\r|\n/)[at-1]||''};const prefix=original.name+':'+original.line+':'+original.column+' - ';if(error.message.startsWith(prefix))error.message=sourceName+':'+error.location.line+':'+error.location.column+' - '+error.message.slice(prefix.length);}syncIdentity(s,target);watchInputsChanged(s);if(id===runId){running=null;s.error=error;s.errorVersion=version;s.status='rejected';watchState(s,'failed');connect();render();}return {accepted:false,reason:job.invalidated||'error',error:error.message,location:error.location};
 }})();return pending;
}
function projectBuffers(project){
 const buffers=[];
 if(project)for(const ed of cljs.core.to_array(lt.object.by_tag(cljs.core.keyword('editor')))){
  const info=documentInfo(ed);if(info?.path?.toLowerCase().startsWith(project.path.toLowerCase()+'\\')){
   const source=lt.objs.editor.__GT_cm_ed(ed).getValue();let modified=true;try{modified=normalize(source)!==normalize(ltProof.read(info.path));}catch(_){}
   const loader=javascriptFile.test(info.path)?sourceLoader(ed):undefined;
   if(modified||loader!==undefined)buffers.push({path:info.path,source,...(loader!==undefined?{loader}:{})});
  }
 }return buffers;
}
function runJavaScript(scope='file',target=originalEditor()){
 const languagePath=documentInfo(target)?.path,language=/\.pyw?$/i.test(languagePath||'')?'python':/\.cljs$/i.test(languagePath||'')?'clojurescript':/\.cljc?$/i.test(languagePath||'')?'clojure':null;
 if(language)return evaluate(source=>ltLanguages.run(source,{language,path:languagePath,bufferSource:lt.objs.editor.__GT_cm_ed(target).getValue()}),scope,{editorObject:target,runtimeLabel:language==='python'?'Python':language==='clojurescript'?'ClojureScript':'Clojure'});
 connect();const path=documentInfo(target)?.path,loader=sourceLoader(target),editorId=target?lt.object.__GT_id(target):undefined,watches=scope==='file'&&target?lt.objs.clients.javascript.watch_specs(target):[];
 const transport=options=>source=>lt.objs.clients.javascript.evaluate(source,options);
 if(!path)return evaluate(transport(scope==='file'?{watches,loader,editorId}:{inline:true,path,loader,editorId}),scope,{editorObject:target});
 const project=window.ltProjectFiles.info().recents.filter(p=>path.toLowerCase().startsWith(p.path.toLowerCase()+'\\')).sort((a,b)=>b.path.length-a.path.length)[0];
 const buffers=projectBuffers(project);
 if(scope!=='file')return evaluate(transport({inline:true,path,loader,buffers:buffers.filter(item=>item.path.toLowerCase()!==path.toLowerCase()),editorId}),scope,{editorObject:target});
 const capture=watchInputs(target,project);return evaluate(transport({path,loader,buffers,watches,watchFiles:capture.files,editorId}),scope,{editorObject:target,watchEditors:capture.editors});
}
function watchInputs(target,project,html=false){
 const participants=target?[target]:[];if(project)for(const other of cljs.core.to_array(lt.object.by_tag(cljs.core.keyword('editor')))){const file=documentInfo(other)?.path;if(other!==target&&file?.toLowerCase().startsWith(project.path.toLowerCase()+'\\')&&(javascriptFile.test(file)||html&&/\.html?$/i.test(file))&&lt.objs.clients.javascript.watch_specs(other).length)participants.push(other);}
 const editors=participants.map(obj=>{const editor=lt.objs.editor.__GT_cm_ed(obj),file=documentInfo(obj)?.path,loader=javascriptFile.test(file||'')?sourceLoader(obj):undefined,s=observe(editor,obj);return {state:s,...identitySnapshot(s),editor,version:s.version,source:editor.getValue(),loader,specs:JSON.stringify(lt.objs.clients.javascript.watch_specs(obj))};});
 return {editors,files:editors.filter(item=>item.state.editorObject!==target).map(item=>({path:item.state.path,source:item.source,...(item.loader!==undefined?{loader:item.loader}:{}),watches:JSON.parse(item.specs)}))};
}
function browserWatches(entry,onStale){
 const project=ltProjectFiles.info().recents.filter(project=>entry.toLowerCase().startsWith(project.path.toLowerCase()+'\\')).sort((a,b)=>b.path.length-a.path.length)[0],capture=watchInputs(null,project,true);
 capture.editors=capture.editors.filter(item=>javascriptFile.test(item.state.path)||/\.html?$/i.test(item.state.path));capture.files=capture.files.filter(item=>javascriptFile.test(item.path)||/\.html?$/i.test(item.path));
 const group={name:entry.split(/[\\/]/).pop(),watchRuntime:'Browser preview',watchEditors:capture.editors,onStale,stale:false};
 for(const item of capture.editors)item.state.watchOwner=group;
 group.changed=()=>watchInputsChanged(group);
 group.update=(status,values=[])=>{const changed=group.changed();if(changed)group.stale=true;watchState(group,status==='cancelled'||status==='failed'&&!changed?status:group.stale?'stale':status,values);};
 group.update('running');return {group,files:capture.files};
}
function nodeScripts(){return window.ltLocalNode?.info().scripts||[];}
function hasWatchEditor(){return hasJavaScriptEditor()||/\.html?$/i.test(documentInfo()?.path||'');}
function hasNodeFile(){const path=documentInfo()?.path;return !!path&&javascriptFile.test(path)&&ltProjectFiles.info().recents.some(project=>path.toLowerCase().startsWith(project.path.toLowerCase()+'\\'));}
function runNode(script){
 try{
  if(script!==undefined){const root=ltProjects.info().current?.path;if(!root)throw Error('Open a project first.');command('open-path',root+'\\package.json');}
  connect();const path=documentInfo()?.path;if(!path)throw Error('Save this JavaScript file in a project before running Node.');
  const info=ltProjectFiles.info(),project=info.recents.filter(project=>path.toLowerCase().startsWith(project.path.toLowerCase()+'\\')).sort((a,b)=>b.path.length-a.path.length)[0];
  const nodeId=window.crypto.randomUUID(),buffers=projectBuffers(project),runtimeLabel=script!==undefined?'npm run '+script:'Node';
  const target=originalEditor(),loader=script===undefined?sourceLoader(target):undefined,capture=watchInputs(target,script===undefined?project:null);return evaluate(source=>lt.objs.clients.javascript.evaluate(source,{runtime:'node',path,buffers,watches:script===undefined?lt.objs.clients.javascript.watch_specs(target):[],watchFiles:script===undefined?capture.files:[],...(loader!==undefined?{loader}:{}),...(script!==undefined?{script}:{}),runId:nodeId}),script!==undefined?'npm script':'Node file',{nodeId,runtimeLabel,liveOutput:'',editorObject:target,watchEditors:capture.editors});
 }catch(error){errorView(error);return Promise.resolve({accepted:false,reason:'error',error:error.message});}
}
let outputTimer;
window.ltLocalNode?.onOutput(message=>{if(!running?.nodeId||message.runId!==running.nodeId)return;running.liveOutput=((running.liveOutput||'')+message.text).slice(-65536);if(!outputTimer)outputTimer=setTimeout(()=>{outputTimer=null;if(running)render();},50);});
function stop(){runId++;const stopped=running?.editor;running=null;window.ltLanguages?.noteStop();window.ltProof.cancelJavascript();if(stopped){const s=states.get(stopped);s.widget?.clear();s.displayed=null;s.inlineNode=null;s.error=null;s.status='cancelled';watchState(s,'cancelled');}render();clearTimeout(menuTimer);window.lt?.objs?.menu?.main_menu?.();}
function clearResults(){connect();const s=state();if(s){s.widget?.clear();s.inlineNode=null;s.displayed=null;s.last=null;s.error=null;s.status='idle';}render();}
function checkSources(){refreshMenus();let changed=false;const observed=documentStates();if(state())observed.add(state());for(const s of observed)changed=syncIdentity(s)||changed;if(running)return;if(state())observed.add(state());for(const s of observed)if(s.status==='current'&&s.displayed&&(s.displayed.loader!==undefined&&sourceLoader(s.editorObject)!==s.displayed.loader||projectChanged(s.displayed)||watchInputsChanged(s)||graphEditorsChanged(s.displayed,s.displayedEditors))){markStale(s);changed=true;}if(changed)render();}
refresh();
return {initialize(){document.body.append(panel);const style=document.createElement('style');style.textContent='#canvas,#multi{right:340px !important} body:has(#right-bar > .content > .active) #proof-calculation{visibility:hidden} #right-bar:has(> .content > .active){width:340px !important;top:40px;bottom:20px;height:auto;background:#202526} .CodeMirror{max-width:calc(100vw - 340px)} #proof-output[data-status="rejected"]{color:#f0b5ab} #proof-output[data-status="stale"]{color:#efd398} #proof-error-open:focus{outline:2px solid #98c9ab;outline-offset:3px} .revival-inline-result{font:12px/1.6 Consolas,monospace;padding:5px 10px;border-left:3px solid #87b19a;background:#26392e;color:#d3f2dc;white-space:pre-wrap;overflow-wrap:anywhere} .revival-inline-result[data-status="stale"]{border-color:#efd398;color:#efd398} .watch-result[data-status="stale"],.watch-result[data-status="failed"],.watch-result[data-status="cancelled"]{color:#efd398}';document.head.append(style);refreshMenus(true);setInterval(connect,100);setInterval(checkSources,1000);},connect,identityChanged,openError,sourceLoader,runJavaScript,runEditor:(target,scope)=>runJavaScript(scope,target),browserWatches,runNode,nodeScripts,hasNodeFile,hasJavaScriptEditor,hasExecutionEditor,hasWatchEditor,stop,clearResults,perform,openSample,refreshMenus,hasEditor:()=>!!editor(),isRunning:()=>!!running,getLast:()=>state()?.last,evaluate,pending:()=>pending};
})();
