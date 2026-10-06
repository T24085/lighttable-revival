'use strict';
window.ltNpmUI=(()=>{
 let current=null,loading=false,revision=0,runId=null,pending=Promise.resolve(),section,statusLabel,deadlineLabel,consoleOutput,graphText,graphKey='',menuSignature='';
 const kw=value=>cljs.core.keyword(value),info=obj=>cljs.core.clj__GT_js(cljs.core.get(cljs.core.deref(obj),kw('info')))||{};
 const project=()=>window.ltProjects?.info().current||null;
 const editors=()=>cljs.core.to_array(lt.object.by_tag(kw('editor')));
 function scripts(){return project()?window.ltLocalNode.info().scripts:[];}
 function refreshMenus(){const signature=JSON.stringify([loading,current?.status,project()?.path,scripts()]);if(signature!==menuSignature){menuSignature=signature;window.lt?.objs?.menu?.main_menu?.();}}
 function render(){
  if(!section)return;section.hidden=!loading&&!current;section.style.display=section.hidden?'none':'';const state=loading?'starting':current?.status||'idle';section.dataset.status=state;
  statusLabel.textContent=loading?'Starting npm operation…':current?current.command+' · '+state.toUpperCase()+(current.reason?'\n'+current.reason:''):'Use Run → Install dependencies or Development server.';
  const memoryLimit=current?.memory?.hardPrivateCommit&&Number.isInteger(current.memory.limitBytes)?' · '+current.memory.limitBytes/(1024*1024)+' MiB process family limit':'';
  deadlineLabel.textContent=current?.status==='running'?'Expires in '+Math.ceil(Math.max(0,current.expiresAt-Date.now())/1000)+' seconds'+memoryLimit:'';
  consoleOutput.textContent=[current?.output?.stdout,current?.output?.stderr].filter(Boolean).join('\n');
  if(current?.project&&graphKey!==current.id){graphKey=current.id;graphText.textContent='Saved inputs at launch\n'+current.project.sha256+'\n'+current.project.files.map(item=>item.name+' · '+item.sha256).join('\n');}
  refreshMenus();
 }
 function failed(error){loading=false;current={...(current||{}),status:'failed',reason:error.message,command:current?.command||'npm',output:current?.output||{stdout:'',stderr:''}};render();return {accepted:false,error:error.message};}
 function start(kind,script,{automatic=false,claim}={}){
  const expectedRevision=++revision;try{
   const chosen=project();if(!chosen)throw Error('Open a project first.');const path=chosen.path+'\\package.json',all=editors().map(obj=>({path:info(obj).path,source:lt.objs.editor.__GT_cm_ed(obj).getValue()})).filter(item=>item.path);
   const source=all.find(item=>item.path.toLowerCase()===path.toLowerCase())?.source??ltProof.read(path);
   runId=crypto.randomUUID();claim?.(runId);loading=true;current=null;graphKey='';render();
   pending=ltProjectNpm.start({kind,script,path,source,buffers:all,runId,automatic}).then(async value=>{if(expectedRevision!==revision)return {accepted:false,reason:'replaced'};loading=false;current=value;render();if(kind==='install'){
    const result=await ltProjectNpm.wait(value.id);if(expectedRevision!==revision)return {accepted:false,reason:'replaced'};if(result){current=result;render();if(result.status==='exited')window.ltProjects.refresh();}return result;
   }return value;}).catch(error=>expectedRevision===revision?failed(error):{accepted:false,reason:'replaced'});return pending;
  }catch(error){return Promise.resolve(failed(error));}
 }
 function stop(){const expectedRevision=++revision;loading=false;if(current){current.status='stopped';current.reason='Stopping npm process family…';}render();pending=ltProjectNpm.stop().then(value=>{if(expectedRevision!==revision)return {accepted:false,reason:'replaced'};if(value?.runId===runId){current=value;render();}return value;}).catch(error=>expectedRevision===revision?failed(error):{accepted:false,reason:'replaced'});return pending;}
 async function automaticServer(program,{valid,progress,claim}){
  const ensure=()=>{if(!valid()||project()?.path.toLowerCase()!==program.root.toLowerCase())throw Error('Automatic preview was cancelled.');};
  ensure();const existing=await ltProjectNpm.status();ensure();
  if(existing?.status==='running'&&existing.kind==='server'&&existing.root.toLowerCase()===program.root.toLowerCase()&&existing.script===program.script){current=existing;runId=existing.runId;loading=false;if(existing.automatic)claim(runId);render();return existing;}
  if(loading||existing?.status==='running')throw Error('Another npm operation is running. Stop it or wait, then click Run to start the preview.');
  if(program.install){progress('Installing dependencies…');const installed=await start('install',undefined,{automatic:true,claim});ensure();if(installed?.status!=='exited'||installed.exitCode!==0)throw Error(installed?.error||installed?.reason||'Dependency installation did not finish.');}
  progress('Starting Vite…');ensure();const server=await start('server',program.script,{automatic:true,claim});ensure();if(server?.status!=='running')throw Error(server?.error||server?.reason||'The development server did not start.');return server;
 }
 function stopAutomatic(id){return id&&runId===id?stop():Promise.resolve();}
 window.ltProjectNpm.onEvent(message=>{if(message.runId!==runId)return;current={...current,...message,project:message.project||current?.project};if(message.event==='started')loading=false;render();});
 return {initialize(){section=document.createElement('section');section.id='npm-activity';section.style.cssText='border-top:1px solid #4a5550;margin-top:20px;white-space:pre-wrap;overflow-wrap:anywhere';const heading=document.createElement('h4');heading.textContent='PROJECT NPM';statusLabel=document.createElement('p');statusLabel.id='npm-status';statusLabel.setAttribute('role','status');deadlineLabel=document.createElement('p');deadlineLabel.id='npm-deadline';consoleOutput=document.createElement('pre');consoleOutput.id='npm-output';consoleOutput.style.cssText='font:12px/1.5 Consolas,monospace;white-space:pre-wrap;max-height:220px;overflow:auto';const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Saved inputs';graphText=document.createElement('pre');graphText.style.cssText='font:11px/1.5 Consolas,monospace;white-space:pre-wrap;max-height:220px;overflow:auto';details.append(summary,graphText);section.append(heading,statusLabel,deadlineLabel,consoleOutput,details);document.getElementById('proof-calculation').append(section);const style=document.createElement('style');style.textContent='#npm-activity[data-status=failed]{color:#f0b5ab}#npm-deadline{color:#b9cfbf;font-size:11px}';document.head.append(style);setInterval(render,1000);render();},install:()=>start('install'),startServer:script=>start('server',script),automaticServer,stopAutomatic,stop,scripts,hasProject:()=>!!project(),isRunning:()=>loading||current?.status==='running',pending:()=>pending,state:()=>current};
})();
