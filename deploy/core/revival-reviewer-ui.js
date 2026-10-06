'use strict';
window.ltReviewerUI=(()=>{
 let settings={},catalog=[],session=null,state=null,task,taskNote,validateTask,refreshTask;
 let taskRequested=false,loaded=false,pendingChoice=null,discoveryError=null;
 const invoke=(op,args={})=>ltAssistant.invoke(op,args);
 function option(value,text,disabled=false){const node=document.createElement('option');node.value=value;node.textContent=text;node.disabled=disabled;return node;}
 function fill(select,value=settings.reviewerModel,placeholder='Choose a reviewer…'){select.replaceChildren(option('',placeholder));for(const m of catalog.filter(m=>!m.error))select.append(option(m.name,m.name+' · '+m.mode+' · '+m.validation));if(value&&!catalog.some(m=>m.name===value&&!m.error))select.append(option(value,value+' · unavailable',true));select.value=value||'';}
 function status(){
  const model=catalog.find(m=>m.name===settings.reviewerModel&&!m.error),busy=['running','pausing','stopping'].includes(state?.status),changing=!!pendingChoice;
  if(task){
   fill(task,taskRequested?settings.reviewerModel:null,'Off — coding only');task.disabled=busy||changing;
   validateTask.disabled=busy||changing||!taskRequested||!model;refreshTask.disabled=busy||changing;
   taskNote.textContent=discoveryError?'Cannot load decision models. Start Ollama and click Refresh models.':!loaded?'Loading installed decision models…':!catalog.some(m=>!m.error)?'No local decision models found. Install a decision model in Ollama, then refresh.':!taskRequested?'Optional: choose an independent decision model to review and improve this task.':!model?'Selected decision model is unavailable. Refresh models or choose another.':model.validation==='Validated'?model.mode+' · Validated · Reviews and improves after coding.':model.mode+' · Untested · Review and improvement enabled. Validation is optional.';
  }
 }
 async function refresh(){try{if(pendingChoice)await pendingChoice;catalog=await invoke('reviewer-models');settings=(await invoke('info')).settings;if(!settings.reviewerModel)taskRequested=false;loaded=true;discoveryError=null;status();return catalog;}catch(e){discoveryError=e;status();throw e;}}
 async function choose(select){const previous=settings;pendingChoice=invoke('settings',{reviewerModel:select.value||null});status();try{settings=await pendingChoice;}catch(e){settings=previous;throw e;}finally{pendingChoice=null;status();}}
 function selector(id){const select=document.createElement('select');select.id=id;select.setAttribute('aria-label','Reviewer model');select.title='Independent from the coding model';select.onchange=()=>choose(select).catch(showError);fill(select);return select;}
 function showError(e){const node=document.getElementById('assistant-status');if(node){node.textContent=e.message||String(e);node.dataset.error='true';}}
 async function run(mode){if(pendingChoice)await pendingChoice;if(mode==='validate'){const selected=catalog.find(m=>m.name===settings.reviewerModel);if(selected)selected.validation='Untested';status();}if(!session){await ltAssistantUI.action('chat');const current=ltAssistantUI.state();if(!current.session){await ltAssistantUI.action('new');}session=ltAssistantUI.state().session;}ltAssistantUI.show('chat');state=await invoke('review',{mode,sessionId:session.id});ltAssistantUI.reviewerState(state);status();}
 function initialize(value){
  settings=value;
  const group=document.createElement('div'),label=document.createElement('label'),actions=document.createElement('div');group.className='reviewer-task';
  task=document.createElement('select');task.id='assistant-review-task';task.title='Independent from the coding model';task.setAttribute('aria-describedby','assistant-review-task-status');label.htmlFor=task.id;label.textContent='Decision model for this task';
  task.onchange=()=>{const previous=taskRequested;taskRequested=!!task.value;if(!taskRequested){status();return;}choose(task).catch(e=>{taskRequested=previous;status();showError(e);});};
  taskNote=document.createElement('small');taskNote.id='assistant-review-task-status';taskNote.setAttribute('role','status');
  validateTask=document.createElement('button');validateTask.id='assistant-review-task-validate';validateTask.type='button';validateTask.textContent='Validate reviewer';validateTask.onclick=()=>run('validate').catch(showError);
  refreshTask=document.createElement('button');refreshTask.id='assistant-review-task-refresh';refreshTask.type='button';refreshTask.textContent='Refresh models';refreshTask.onclick=()=>refresh().catch(showError);
  actions.append(validateTask,refreshTask);group.append(label,task,taskNote,actions);document.getElementById('assistant-compose').prepend(group);
  const style=document.createElement('style');style.textContent='.reviewer-task button{background:#33443a;color:#d9ede2;border:1px solid #52675b;border-radius:3px;cursor:pointer;font:11px Arial;padding:5px}.reviewer-task{display:grid;gap:6px;min-width:0;font:12px Arial;color:#d9ede2}.reviewer-task small{font:11px/1.4 Arial;color:#adbbb6;overflow-wrap:anywhere}.reviewer-task>div{display:flex;flex-wrap:wrap;gap:6px}';document.head.append(style);status();
 }
 function settingsControls(form){const label=document.createElement('label'),select=selector('assistant-settings-reviewer'),note=document.createElement('p'),validate=document.createElement('button');let changed=false;const availability=()=>{validate.disabled=['running','pausing','stopping'].includes(state?.status)||!catalog.some(m=>m.name===select.value&&!m.error);};select.onchange=()=>{changed=true;availability();};label.htmlFor=select.id;label.textContent='Reviewer model';note.textContent='Decision models review the coding assistant independently. Validation is an optional diagnostic using fixed cases and three runtime cycles.';validate.type='button';validate.textContent='Validate reviewer';validate.onclick=async()=>{try{await choose(select);form.closest('dialog').close();await run('validate');}catch(e){showError(e);}};form.insertBefore(label,form.children[form.children.length-2]);label.after(select,note,validate);availability();refresh().then(()=>{if(!changed)fill(select);availability();}).catch(showError);return select;}
 async function taskOptions(){if(pendingChoice)await pendingChoice;if(!taskRequested)return {reviewAndImprove:false};const model=catalog.find(m=>m.name===settings.reviewerModel&&!m.error);if(!model)throw Error('Choose an available decision model for this task, or select Off.');return {reviewAndImprove:true};}
 return {initialize,refresh,apply:value=>{settings=value;status();},update:(value,current)=>{state=value;session=current;status();},settingsControls,taskOptions,taskEnabled:()=>taskRequested,run};
})();
