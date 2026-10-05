'use strict';
// One visible program, driven by the original editors' unsaved buffers.
window.ltLive=(()=>{
 const delayMs=350,sessionMs=15*60*1000,bindings=new WeakSet();
 let enabled=window.ltProof.info.autoLiveView!==false,paused=false,pane,slot,label,runButton,timer=null,busy=false,observed=null,lastAttempt=null,root=null,entry=null,expiresAt=0,pending=Promise.resolve(),generation=0,sourceRevision=0,reason='',seenProject=null;
 const kw=value=>cljs.core.keyword(value),info=obj=>obj&&cljs.core.deref(obj)?cljs.core.clj__GT_js(cljs.core.get(cljs.core.deref(obj),kw('info')))||{}:{};
 const pathKey=value=>String(value||'').replace(/\//g,'\\').toLowerCase();
 const within=(file,directory)=>pathKey(file).startsWith(pathKey(directory).replace(/\\+$/,'')+'\\');
 const objects=()=>cljs.core.to_array(lt.object.by_tag(kw('editor'))).filter(obj=>cljs.core.deref(obj));
 const cm=obj=>lt.objs.editor.__GT_cm_ed(obj);
 const active=()=>{const selected=lt.objs.tabs.active_tab();return selected&&cm(selected)?selected:lt.objs.editor.pool.last_active();};
 const exists=file=>{try{return ltProof.exists(file)&&ltProof.stat(file).file;}catch(_){return false;}};
 const eligible=file=>/\.(?:html?|css|[cm]?js|jsx|[cm]?ts|tsx|svg)$/i.test(file||'');
 function choose(){
  const project=window.ltProjects.info().current?.path,obj=active(),file=info(obj).path;
  if(!project||!file||!within(file,project)||!eligible(file))return null;
  if(/\.html?$/i.test(file))return {root:project,entry:file};
  if(root===project&&entry&&exists(entry))return {root:project,entry};
  let directory=file.slice(0,Math.max(file.lastIndexOf('\\'),file.lastIndexOf('/')));
  while(pathKey(directory)===pathKey(project)||within(directory,project)){
   for(const name of ['index.html','index.htm']){const candidate=directory+'\\'+name;if(exists(candidate))return {root:project,entry:candidate};}
   const parent=directory.slice(0,Math.max(directory.lastIndexOf('\\'),directory.lastIndexOf('/')));if(parent===directory)break;directory=parent;
  }
  return null;
 }
 function signature(program){
  const snapshot=ltPreview.state()?.project,paths=snapshot?.entry&&pathKey(snapshot.entry)===pathKey(program.entry)?new Set(snapshot.files.filter(item=>item.path).map(item=>pathKey(item.path))):null;
  return JSON.stringify([sourceRevision,pathKey(program.root),pathKey(program.entry),ltPreview.buffers().filter(item=>within(item.path,program.root)&&(!paths||paths.has(pathKey(item.path)))).map(item=>[pathKey(item.path),item.source,item.loader])]);
 }
 function refreshMenu(){window.lt?.objs?.menu?.main_menu?.();}
 function render(){
  if(!pane)return;const visible=enabled&&!!entry;pane.hidden=!visible;document.body.classList.toggle('live-preview-split',visible);
  label.textContent=reason|| (paused?'Paused':busy?'Updating…':'Live');pane.dataset.status=paused?'paused':busy?'updating':'live';
  document.getElementById('live-preview-name').textContent=entry?.split(/[\\/]/).pop()||'';
  runButton.disabled=busy;runButton.textContent=busy?'Running…':'▶ Run';
  if(paused)slot.textContent='Live view paused. Click Run above to resume.';
  window.dispatchEvent(new Event('resize'));
 }
 function schedule(){if(!enabled||paused)return;clearTimeout(timer);timer=setTimeout(update,delayMs);}
 async function update(program=choose(),restart=false){
  timer=null;if(!enabled||paused||busy||!program)return;
  const value=signature(program);if(value===lastAttempt)return;
  if(expiresAt&&Date.now()>=expiresAt){await pause('Live session finished. Click Run above to resume.');return;}
  if(root!==program.root){expiresAt=0;lastAttempt=null;}root=program.root;entry=program.entry;if(!expiresAt)expiresAt=Date.now()+sessionMs;
  const expected=++generation;lastAttempt=value;busy=true;reason='';render();
  pending=ltPreview.openLive(entry,Math.max(100,expiresAt-Date.now()),restart).then(result=>{
   if(expected!==generation)return result;reason=result?.accepted===false?'Fix the error below to update the live view.':result?.liveUpdate?.kind==='hot'?'Live: state preserved':result?.liveUpdate?.reason?'Live: program restarted':'';return result;
  }).catch(error=>{if(expected===generation)reason=error.message;return {accepted:false,error:error.message};}).finally(()=>{
   if(expected===generation){busy=false;render();if(enabled&&!paused){const next=choose();if(next&&signature(next)!==lastAttempt)schedule();}}
  });return pending;
 }
 function changed(){observed=null;if(!busy)schedule();}
 function diskChanged(){sourceRevision++;changed();}
 function scan(){
  if(!window.lt?.objs.editor?.pool||!pane)return;
  for(const obj of objects()){const editor=cm(obj);if(editor&&!bindings.has(editor)){bindings.add(editor);editor.on('change',changed);editor.on('swapDoc',changed);}}
  if(!enabled||paused)return;
  const project=window.ltProjects.info().current?.path;
  if(project&&pathKey(project)!==seenProject){seenProject=pathKey(project);const first=project+'\\index.html';if(exists(first)&&!within(info(active()).path,project)){lt.objs.command.exec_BANG_(kw('open-path'),first);ltProofUI.connect()?.focus();}}
  const program=choose();
  if(!program){if(entry&&!busy){entry=null;root=null;observed=null;lastAttempt=null;expiresAt=0;ltPreview.stop(false);render();}return;}
  const value=signature(program);if(value!==observed){observed=value;schedule();}
 }
 function pause(message=''){
  paused=true;reason=message;generation++;busy=false;clearTimeout(timer);timer=null;render();refreshMenu();pending=ltPreview.stop(false);return pending;
 }
 function resume(){enabled=true;paused=false;reason='';expiresAt=0;observed=null;lastAttempt=null;refreshMenu();scan();render();}
 function run(){if(busy)return pending;const program=entry?{root,entry}:choose();if(!program)return Promise.resolve();clearTimeout(timer);enabled=true;paused=false;reason='';expiresAt=Date.now()+sessionMs;observed=null;lastAttempt=null;refreshMenu();return update(program,true);}
 function toggle(){if(!enabled){resume();return;}enabled=false;pause();entry=null;root=null;render();refreshMenu();}
 function manual(){paused=true;generation++;clearTimeout(timer);busy=false;entry=null;root=null;render();refreshMenu();}
 function stopped(message){if(!entry||paused)return;paused=true;reason=message||'Stopped. Click Run above to resume.';generation++;busy=false;clearTimeout(timer);render();refreshMenu();}
 function initialize(){
  pane=document.createElement('aside');pane.id='live-preview-pane';pane.setAttribute('aria-label','Live program beside code');pane.hidden=true;
  const header=document.createElement('header'),name=document.createElement('span');name.id='live-preview-name';label=document.createElement('span');label.id='live-preview-status';label.setAttribute('role','status');runButton=document.createElement('button');runButton.id='live-preview-run';runButton.className='revival-preview-run';runButton.type='button';runButton.title='Run the current preview with unsaved edits. Restarts program state and resumes live updates.';runButton.setAttribute('aria-label','Run live preview');runButton.onclick=()=>run();header.append(name,label,runButton);slot=document.createElement('div');slot.id='live-preview-slot';slot.className='revival-preview-slot';pane.append(header,slot);document.body.append(pane);
  const style=document.createElement('style');style.textContent=`
   body{--live-preview-width:clamp(300px,calc((100vw - 180px)/2),900px)}
   #live-preview-pane[hidden]{display:none} #live-preview-pane{position:fixed;right:0;top:40px;bottom:28vh;width:var(--live-preview-width);background:#17201c;border-left:1px solid #4a5550;z-index:24;box-sizing:border-box}
   #live-preview-pane header{height:32px;display:flex;align-items:center;gap:10px;padding:0 12px;color:#d9ede2;font:12px Consolas,monospace;background:#202526;border-bottom:1px solid #4a5550}
   #live-preview-name{max-width:35%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap} #live-preview-status{color:#9cb9ae;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap} #live-preview-pane .revival-preview-slot{top:33px}
   .revival-preview-run{flex-shrink:0;border:1px solid #52675b;border-radius:3px;padding:3px 8px;background:#33443a;color:#d9ede2;font:12px Arial,sans-serif;cursor:pointer} .revival-preview-run:hover{background:#405749} .revival-preview-run:focus-visible{outline:2px solid #98c9ab;outline-offset:2px} .revival-preview-run:disabled{opacity:.65;cursor:default}
   body.live-preview-split #canvas,body.live-preview-split #multi{right:var(--live-preview-width)!important}
   body.live-preview-split .CodeMirror{max-width:100%!important}
   body.live-preview-split #proof-calculation{right:0!important;top:72vh!important;bottom:20px!important;width:var(--live-preview-width)!important;padding:12px!important;border-top:1px solid #4a5550}
   body.live-preview-split #proof-calculation h3{margin-bottom:8px}
   body.live-preview-split #proof-versions[data-status="idle"],body.live-preview-split #proof-output[data-status="idle"]{display:none}
  `;document.head.append(style);setInterval(scan,150);scan();render();
 }
 return {initialize,slot:()=>slot,changed,diskChanged,pause,resume,run,toggle,manual,stopped,enabled:()=>enabled,paused:()=>paused,state:()=>({enabled,paused,busy,entry,root,expiresAt,reason,generation,delayMs,sessionMs}),pending:()=>pending};
})();
