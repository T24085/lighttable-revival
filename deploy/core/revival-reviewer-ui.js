'use strict';
window.ltReviewerUI=(()=>{
 let settings={},catalog=[],session=null,state=null,pending=null,loaded=false;
 const invoke=(op,args={})=>ltAssistant.invoke(op,args);
 async function refresh(){
  if(pending)return pending;
  pending=(async()=>{
   const resolved=await invoke('reviewer-auto');catalog=resolved.models;settings=resolved.settings;
   loaded=true;return catalog;
  })();try{return await pending;}finally{pending=null;}
 }
 async function taskOptions(){
  if(!loaded||pending)await refresh();
  if(!catalog.some(m=>m.name===settings.reviewerModel&&!m.error)){
   await refresh();
   if(!catalog.some(m=>m.name===settings.reviewerModel&&!m.error))throw Error('Automatic verification requires an installed local Ollama decision model. Install a compatible reviewer, then refresh models. Your draft is preserved.');
  }
  return {reviewAndImprove:true};
 }
 async function run(mode){await taskOptions();if(!session){await ltAssistantUI.action('chat');if(!ltAssistantUI.state().session)await ltAssistantUI.action('new');session=ltAssistantUI.state().session;}ltAssistantUI.show('chat');state=await invoke('review',{mode,sessionId:session.id});ltAssistantUI.reviewerState(state);}
 // Retain the independent reviewer in settings without exposing an opt-out.
 function settingsControls(form){const value=document.createElement('input');value.type='hidden';value.id='assistant-settings-reviewer';value.value=settings.reviewerModel||'';form.append(value);refresh().then(()=>value.value=settings.reviewerModel||'').catch(()=>{});return value;}
 return {initialize:value=>{settings=value;loaded=false;},refresh,apply:value=>{settings=value;},update:(value,current)=>{state=value;session=current;},settingsControls,taskOptions,taskEnabled:()=>true,run};
})();
