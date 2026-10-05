'use strict';
window.ltProjects=(()=>{
 let info={current:null,recents:[]},initialized=false,root,status;
 const command=(name,...args)=>lt.objs.command.exec_BANG_(cljs.core.keyword(name),...args);
 function message(text,error=false){status.textContent=text;status.dataset.error=String(error);}
 function safely(fn){try{return fn();}catch(error){message(error.message,true);return null;}}
 function showInfo(){
  const current=info.current;
  root.textContent=current?current.name:'No active project';root.title=current?.path||'';
  const path=document.getElementById('project-path');path.textContent=current?.path||'';path.title=current?.path||'';
  ltProofUI.refreshMenus(true);
 }
 function tree(path,refresh=false){
  const ws=lt.objs.workspace.current_ws,folders=cljs.core.clj__GT_js(cljs.core.get(cljs.core.deref(ws),cljs.core.keyword('folders')))||[];
  if(!folders.includes(path))lt.object.raise(ws,cljs.core.keyword('add.folder!'),path);
  command('workspace.show',true);
  const folder=lt.objs.sidebar.workspace.find_by_path(path);
  if(!folder)throw Error('The project could not be added to the workspace tree.');
  lt.object.raise(folder,cljs.core.keyword('open!'));
  if(refresh)lt.object.raise(folder,cljs.core.keyword('refresh!'));
 }
 function openFile(path){command('open-path',path);ltProofUI.connect()?.focus();}
 function activate(project){
  info=window.ltProjectFiles.info();showInfo();tree(project.path,true);
  if(project.entry)openFile(project.entry);
  message(info.warning||'',!!info.warning);
  return project;
 }
 function open(){return safely(()=>{ltProofUI.stop();const project=window.ltProjectFiles.open();return project?activate(project):null;});}
 function reopen(path){return safely(()=>{ltProofUI.stop();return activate(window.ltProjectFiles.reopen(path));});}
 function refresh(){return safely(()=>{if(!info.current)throw Error('Create or open a project first.');tree(info.current.path,true);message('Files refreshed.');});}
 function button(id,text,fn,parent){const el=document.createElement('button');el.type='button';el.id=id;el.textContent=text;el.onclick=()=>safely(fn);parent.append(el);return el;}
 function dialog(id,title,label,defaultValue,submit){
  document.getElementById(id)?.remove();
  const modal=document.createElement('dialog');modal.id=id;modal.className='project-dialog';
  const form=document.createElement('form'),heading=document.createElement('h2'),field=document.createElement('label'),input=document.createElement('input'),extra=document.createElement('div'),error=document.createElement('p'),actions=document.createElement('div');
  heading.textContent=title;input.id=id+'-name';input.value=defaultValue;input.maxLength=80;input.required=true;input.autocomplete='off';field.htmlFor=input.id;field.textContent=label;
  error.className='project-form-error';error.setAttribute('role','alert');actions.className='project-dialog-actions';
  const create=button(id+'-submit',title,()=>form.requestSubmit(),actions);
  button(id+'-cancel','Cancel',()=>modal.close(),actions);
  form.append(heading,field,input,extra,error,actions);modal.append(form);document.body.append(modal);
  form.onsubmit=event=>{
   event.preventDefault();let afterClose;
   try{afterClose=submit(input.value);}catch(e){error.textContent=e.message;return;}
   modal.close();modal.remove();if(typeof afterClose==='function')safely(afterClose);
  };
  modal.addEventListener('close',()=>modal.remove());modal.showModal();input.focus();input.select();
  return {modal,form,input,extra,error,create};
 }
 function newProject(){return safely(()=>{
  let parent=null;
  const ui=dialog('project-create','Create project','Project name','my-project',name=>{
   const project=window.ltProjectFiles.create(parent?.token,name);return ()=>activate(project);
  });
  ui.create.disabled=true;
  const location=document.createElement('p');location.id='project-location';location.textContent='Choose the folder where the new project will be created.';
  button('project-choose-location','Choose location…',()=>{
   try{ltProofUI.stop();const chosen=window.ltProjectFiles.pickParent();
    if(chosen){parent=chosen;location.textContent=chosen.path;ui.create.disabled=false;ui.error.textContent='';}
   }catch(error){ui.error.textContent=error.message;}
  },ui.extra);ui.extra.append(location);
 });}
 const fileTypes=[['js','JavaScript (.js)'],['mjs','JavaScript module (.mjs)'],['cjs','CommonJS (.cjs)'],['jsx','JSX (.jsx)'],['ts','TypeScript (.ts)'],['tsx','TSX (.tsx)'],['html','HTML (.html)'],['css','CSS (.css)'],['json','JSON (.json)'],['md','Markdown (.md)'],['py','Python (.py)'],['clj','Clojure (.clj)'],['cljs','ClojureScript (.cljs)'],['edn','EDN (.edn)'],['txt','Plain text (.txt)'],['','No extension'],['custom','Custom extension…']];
 function validFileName(name){
  if(!name||name.length>80||name!==name.trim()||/^[.]+$|[<>:"/\\|?*\x00-\x1f]|[. ]$/.test(name)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name))throw Error('Use a file name without slashes, reserved characters or trailing spaces.');
  return name;
 }
 function fileDialog(id,defaultName,submit){
  let chosenExtension='';
  const ui=dialog(id,'Create file','File name',defaultName,name=>{
   if(type.value==='custom')extensionValue();
   return submit(validFileName(name));
  });
  const typeLabel=document.createElement('label'),type=document.createElement('select'),customLabel=document.createElement('label'),custom=document.createElement('input'),preview=document.createElement('p');
  type.id=id+'-type';typeLabel.htmlFor=type.id;typeLabel.textContent='File type';
  for(const [value,label] of fileTypes){const option=document.createElement('option');option.value=value;option.textContent=label;type.append(option);}
  custom.id=id+'-extension';customLabel.htmlFor=custom.id;customLabel.textContent='Custom extension';custom.placeholder='e.g. py, .py or d.ts';custom.maxLength=32;custom.autocomplete='off';
  preview.id=id+'-preview';preview.className='project-file-preview';preview.setAttribute('aria-live','polite');
  ui.extra.append(typeLabel,type,customLabel,custom,preview);
  function extensionValue(){
   const value=custom.value.trim().replace(/^\./,'');
   if(!value||value.length>32||!/^[^<>:"/\\|?*\x00-\x20.]+(?:\.[^<>:"/\\|?*\x00-\x20.]+)*$/.test(value))throw Error('Enter an extension such as py, .py or d.ts.');
   return value;
  }
  function customVisibility(){customLabel.hidden=custom.hidden=type.value!=='custom';custom.disabled=custom.hidden;custom.required=!custom.hidden;}
  function updatePreview(){preview.textContent='File: '+ui.input.value;}
  function readName(){
   const name=ui.input.value,dot=name.lastIndexOf('.');chosenExtension=dot>0?name.slice(dot+1):'';
   type.value=fileTypes.some(([value])=>value!=='custom'&&value===chosenExtension.toLowerCase())?chosenExtension.toLowerCase():'custom';
   custom.value=chosenExtension;customVisibility();custom.setCustomValidity('');ui.error.textContent='';updatePreview();
  }
  function applyType(){
   try{
    const extension=type.value==='custom'?extensionValue():type.value,name=ui.input.value;
    const suffix=chosenExtension?'.'+chosenExtension:'',base=suffix&&name.toLowerCase().endsWith(suffix.toLowerCase())?name.slice(0,-suffix.length):name;
    ui.input.value=base+(extension?'.'+extension:'');chosenExtension=extension;custom.setCustomValidity('');ui.error.textContent='';updatePreview();
   }catch(error){custom.setCustomValidity(error.message);ui.error.textContent=error.message;}
  }
  ui.input.addEventListener('input',readName);
  type.addEventListener('change',()=>{if(type.value==='custom')custom.value=chosenExtension;customVisibility();applyType();if(type.value==='custom'){custom.focus();custom.select();}});
  custom.addEventListener('input',applyType);readName();return ui;
 }
 function newFile(){return safely(()=>{
  if(!info.current)throw Error('Create or open a project first.');
  const expectedRoot=info.current.path;
  fileDialog('project-file','script.js',name=>{
   const file=window.ltProjectFiles.newFile(name,expectedRoot);return ()=>{tree(file.project.path,true);openFile(file.path);message(name+' created.');};
  });
 });}
 function newUntitled(dirty=false){return safely(()=>{
  fileDialog('file-create','untitled-'+(cljs.core.deref(lt.objs.opener.untitled_count)+1),name=>()=>{
   lt.object.raise(lt.objs.opener.opener,cljs.core.keyword('new!'),null,!!dirty,name);
   ltProofUI.connect()?.focus();message(name+' created. Save to choose its location.');
  });
 });}
 function initialize(){
  if(initialized)return;initialized=true;
  const section=document.createElement('section');section.id='project-context';
  root=document.createElement('strong');root.id='project-name';
  const path=document.createElement('p');path.id='project-path';
  status=document.createElement('p');status.id='project-status';status.setAttribute('role','status');
  section.append(root,path,status);document.querySelector('#proof-calculation h3').after(section);
  const style=document.createElement('style');style.textContent=`
   #project-context{border-bottom:1px solid #4a5550;padding-bottom:10px;margin-bottom:12px}
   #project-name{font:14px Arial;color:#d3eadb} #project-path{font:11px/1.3 Consolas,monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#a7b4ae;margin:6px 0}
   .project-dialog button{background:#34473e;border:1px solid #729483;color:#edf7f1;border-radius:3px;padding:6px 8px;margin:3px 5px 3px 0;cursor:pointer}
   .project-dialog button:disabled{opacity:.4;cursor:default}
   #project-status{font:12px/1.4 Arial;color:#b9cfbf;margin:8px 0 0} #project-status[data-error="true"],.project-form-error{color:#f0b5ab}
   .project-dialog{width:440px;max-width:calc(100vw - 64px);margin:auto;background:#202526;color:#e5ece8;border:1px solid #729483;border-radius:6px;padding:24px;font:14px/1.5 Arial}
   .project-dialog::backdrop{background:#0009} .project-dialog h2{margin:0 0 18px;font-size:20px} .project-dialog label{display:block;margin-bottom:6px}
   .project-dialog input,.project-dialog select{box-sizing:border-box;width:100%;background:#16231b;color:#e5ece8;border:1px solid #729483;padding:9px;font-size:14px}
   .project-dialog input:focus,.project-dialog select:focus,.project-dialog button:focus{outline:2px solid #98c9ab;outline-offset:2px}
   .project-dialog [hidden]{display:none} .project-dialog select{margin-bottom:12px} .project-dialog form>div>label{margin-top:12px}
   .project-file-preview{font:12px/1.5 Consolas,monospace;overflow-wrap:anywhere;color:#b9cfbf;margin:14px 0 0}
   .project-dialog #project-location{font:12px/1.5 Consolas,monospace;overflow-wrap:anywhere;color:#b9cfbf} .project-dialog-actions{margin-top:16px}
  `;document.head.append(style);
  safely(()=>{info=window.ltProjectFiles.info();showInfo();if(info.current)activate({...info.current,entry:null});else message(info.warning||'',!!info.warning);});
 }
 return {initialize,newProject,open,reopen,newFile,newUntitled,refresh,openedFolder:project=>safely(()=>activate({...project,entry:null})),info:()=>info};
})();
