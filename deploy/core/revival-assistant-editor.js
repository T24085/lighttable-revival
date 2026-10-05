'use strict';
window.ltAssistantEditor=(()=>{
 const kw=name=>cljs.core.keyword(name),key=p=>p?.replace(/\//g,'\\').toLowerCase(),value=(obj,name)=>obj&&cljs.core.get(cljs.core.deref(obj),kw(name)),objects=()=>cljs.core.to_array(lt.object.by_tag(kw('editor'))),cm=doc=>lt.objs.document.__GT_cm_doc(doc);
 const roots=()=>objects().map(editor=>{let doc=value(editor,'doc');while(value(doc,'root'))doc=value(doc,'root');const info=value(editor,'info');return {editor,doc,path:info&&cljs.core.get(info,kw('path'))};}).filter(item=>item.doc&&item.path);
 const find=file=>roots().find(item=>key(item.path)===key(file)),related=root=>roots().filter(item=>item.doc===root);
 const identities=new WeakMap(),tickets=new Map();
 function identity(root){if(!identities.has(root))identities.set(root,crypto.randomUUID());return identities.get(root);}
 function snapshot(file){const item=find(file);if(!item)return null;const view=cm(item.doc);return {source:view.getValue(),identity:identity(item.doc),generation:view.changeGeneration(),lineEnding:value(item.doc,'line-ending')||'\n',savedContent:value(item.doc,'saved-content'),path:item.path};}
 function expected(file,previous){const current=snapshot(file);if(!current||current.identity!==previous.identity||current.generation!==previous.generation||current.source!==previous.source)throw Error('Editor changed. Read the latest file before editing.');return find(file);}
 function patch(doc,source){const view=cm(doc),before=view.getValue(),after=source.replace(/\r\n?|\n/g,'\n'),old=before.split('\n'),next=after.split('\n');function replace(a,b,position){let from=0,suffix=0;while(from<a.length&&from<b.length&&a[from]===b[from])from++;while(suffix<a.length-from&&suffix<b.length-from&&a[a.length-suffix-1]===b[b.length-suffix-1])suffix++;if(a!==b)view.replaceRange(b.slice(from,b.length-suffix),position(from),position(a.length-suffix),'+assistant');}const update=()=>{if(old.length===next.length){for(let line=old.length-1;line>=0;line--)replace(old[line],next[line],ch=>({line,ch}));}else replace(before,after,n=>view.posFromIndex(n));};const attached=related(doc).map(({editor})=>lt.objs.editor.__GT_cm_ed(editor)).find(Boolean);if(attached)attached.operation(update);else update();}
 function lock(file,previous,complete){const item=expected(file,previous),ticket=crypto.randomUUID(),frozen=related(item.doc).map(({editor})=>{const view=lt.objs.editor.__GT_cm_ed(editor),readOnly=view.getOption('readOnly');view.setOption('readOnly',true);return {view,readOnly};});tickets.set(ticket,{root:item.doc,path:file,frozen,complete,after:previous});return ticket;}
 async function prepare(file,previous,source){
  const item=expected(file,previous),ending=previous.lineEnding,final=lt.object.raise_reduce(item.editor,kw('save+'),source.replace(/\r\n?|\n/g,ending));if(typeof final!=='string')throw Error('Save behavior did not return text');patch(item.doc,final);const after=snapshot(file);
  let complete;await new Promise((resolve,reject)=>{try{if(window.ltPreview?.prepareSave)ltPreview.prepareSave(item.editor,file,final,finish=>{complete=finish;resolve();});else resolve();}catch(error){reject(error);}});
  try{return {...after,ticket:lock(file,after,complete),savedSource:final};}catch(error){complete?.();throw error;}
 }
 function release(ticket){const entry=tickets.get(ticket);if(!entry)return null;tickets.delete(ticket);for(const {view,readOnly}of entry.frozen)view.setOption('readOnly',readOnly);entry.complete?.();return entry;}
 async function operation(op,args){
  switch(op){
   case 'snapshot':return snapshot(args.path);
   case 'context':{const selected=lt.objs.editor.pool.last_active(),view=selected&&lt.objs.editor.__GT_cm_ed(selected),info=selected&&value(selected,'info'),path=info&&cljs.core.get(info,kw('path'));return {activePath:path,activeSource:path?snapshot(path)?.source:view?.getValue(),selection:view?.getSelection()||'',drafts:objects().filter(editor=>!cljs.core.get(value(editor,'info'),kw('path'))&&lt.objs.editor.__GT_cm_ed(editor)).map(editor=>({name:cljs.core.get(value(editor,'info'),kw('name')),source:lt.objs.editor.__GT_cm_ed(editor).getValue()})),buffers:[...new Map(roots().map(item=>[key(item.path),{path:item.path,...snapshot(item.path),...(/\.(?:[cm]?js|jsx|[cm]?ts|tsx)$/i.test(item.path)?{loader:ltProofUI.sourceLoader(item.editor)}:{})}])).values()]};}
   case 'prepare':return prepare(args.path,args.previous,args.source);
   case 'lock':return {ticket:lock(args.path,args.previous)};
   case 'saved':{const entry=tickets.get(args.ticket);if(!entry)throw Error('Save transaction expired');try{lt.objs.document.update_saved_content(entry.path,args.source);for(const {editor}of related(entry.root)){lt.object.merge_BANG_(editor,cljs.core.hash_map(kw('dirty'),false,kw('editor.generation'),lt.objs.editor.__GT_generation(editor)));lt.object.raise(editor,kw('saved'));lt.object.raise(editor,kw('clean'));}return snapshot(entry.path);}finally{release(args.ticket);}}
   case 'release':release(args.ticket);return true;
   case 'restore':{const item=expected(args.path,args.previous);patch(item.doc,args.source);lt.objs.document.update_saved_content(args.path,args.savedContent??'');for(const {editor}of related(item.doc)){lt.object.merge_BANG_(editor,cljs.core.hash_map(kw('dirty'),!!args.dirty,kw('editor.generation'),lt.objs.editor.__GT_generation(editor)));lt.object.raise(editor,kw(args.dirty?'dirty':'clean'));}return snapshot(args.path);}
   case 'deleted':{const item=expected(args.path,args.previous);for(const {editor}of related(item.doc)){lt.object.merge_BANG_(editor,cljs.core.hash_map(kw('dirty'),true));lt.object.raise(editor,kw('dirty'));}return snapshot(args.path);}
   case 'rename':{const item=expected(args.path,args.previous);lt.objs.document.move_doc(args.path,args.newPath);for(const {editor}of related(item.doc)){lt.objs.editor.pool.set_syntax_by_path(editor,args.newPath);lt.object.update_BANG_(editor,cljs.core.PersistentVector.fromArray([kw('info')],true),cljs.core.merge,lt.objs.opener.path__GT_info(args.newPath));ltProofUI.identityChanged(editor);}return snapshot(args.newPath);}
   case 'open':lt.objs.command.exec_BANG_(kw('open-path'),args.path);return true;
   case 'project':ltAssistantUI.projectChanged(args.project);ltProjects.openedFolder(args.project);return true;
   case 'preview-slot':return ltAssistantUI.previewSlot();
   case 'preview-close':return ltAssistantUI.previewClose();
   case 'preview-status':return {preview:ltPreview.state(),automatic:!!args.path&&/\.html?$/i.test(args.path)&&key(value(lt.objs.editor.pool.last_active(),'info')&&cljs.core.get(value(lt.objs.editor.pool.last_active(),'info'),kw('path')))===key(args.path)&&ltLive.enabled()&&!ltLive.paused()};
   case 'preview-wait':await new Promise(resolve=>setTimeout(resolve,400));await ltLive.pending();return ltPreview.state();
   case 'project-refresh':ltProjects.refresh();return true;
   default:throw Error('Unknown editor action');
  }
 }
 return {operation,snapshot,releaseAll:()=>{for(const ticket of [...tickets.keys()])release(ticket);}};
})();
