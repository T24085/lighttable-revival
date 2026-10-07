'use strict';
const crypto=require('crypto'),fs=require('fs');
// Use exact CSS viewports. Chrome's mobile shrink-to-fit can enlarge innerWidth
// to fit an overflowing element, concealing the very defect being checked.
const viewports=[{name:'desktop',width:1280,height:800,mobile:false},{name:'mobile',width:390,height:844,mobile:false}];
const digest=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const wait=(ms,signal)=>require('node:timers/promises').setTimeout(ms,null,{signal});
function sourceFiles(state){const files=(state?.project?.files||[]).filter(f=>f.path&&f.kind!=='resolution-source');return state?.project?.mode==='server'?[...new Map(files.map(f=>[f.path.toLowerCase(),f])).values()]:files;}
const sources=state=>sourceFiles(state).map(f=>({path:f.path,sha256:f.origin==='http'?f.sourceSha256:f.sha256}));
function identity(state){return digest([state?.id,state?.reloadCount,state?.liveUpdate,state?.project?.files?.map(file=>[file.path,file.sha256,file.sourceSha256])]);}
async function collect({wc,status,current,signal,images=false,sampleMs=5000,checks=[],progress=()=>{}}){
 const assertCurrent=async()=>{signal?.throwIfAborted();if(wc.isDestroyed()||!await current())throw Error('Review evidence is stale: source or preview changed');};
 const evaluate=async(expression,awaitPromise=false)=>{const r=await wc.debugger.sendCommand('Runtime.evaluate',{expression,awaitPromise,returnByValue:true,timeout:10000});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
 await assertCurrent();const saved=await evaluate('({x:scrollX,y:scrollY})'),evidence={previewId:status.id,revision:identity(status),url:status.url,capturedAt:new Date().toISOString(),sources:sources(status),sourceBindingSupported:status.project?.mode!=='server'||sourceFiles(status).length>0,viewports:[],images:[]};
 let focusEmulated=false;
 try{
  // Keep baseline and current measurements under the same active-page condition.
  // An occluded preview can otherwise sample Chromium's one-second background
  // frame cadence instead of the authored program. No OS focus is taken.
  await wc.debugger.sendCommand('Emulation.setFocusEmulationEnabled',{enabled:true});focusEmulated=true;
  for(const viewport of viewports){
   await assertCurrent();progress('Measuring '+viewport.name+' preview');
   await wc.debugger.sendCommand('Emulation.setDeviceMetricsOverride',{...Object.fromEntries(['width','height','mobile'].map(key=>[key,viewport[key]])),deviceScaleFactor:1});
   await evaluate('Promise.race([document.fonts.ready,new Promise((_,reject)=>setTimeout(()=>reject(Error("Preview fonts did not settle")),5000))]).then(()=>Promise.race([new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))),new Promise(r=>setTimeout(r,2000))]))',true);
   await evaluate('scrollTo(0,0)');
   const dom=await evaluate(`(()=>{const elements=Array.from(document.querySelectorAll('button,input,a,output,h1,h2,p,img,canvas,[role="button"]')).slice(0,80).map(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {tag:e.tagName,id:e.id,text:(e.innerText||e.alt||'').slice(0,120),visible:!!(r.width&&r.height&&s.visibility!=='hidden'&&s.display!=='none'&&s.opacity!=='0'&&(typeof e.checkVisibility!=='function'||e.checkVisibility({opacityProperty:true,visibilityProperty:true}))),x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height),clipped:r.width>0&&(r.left< -1||r.right>innerWidth+1),textClipped:s.overflow!=='visible'&&(e.scrollWidth>e.clientWidth+1||e.scrollHeight>e.clientHeight+1)};});return {title:document.title,text:document.body.innerText.slice(0,1800),width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth+1,elements};})()`);
   dom.requiredControls=await evaluate(`(${JSON.stringify(checks)}).map(check=>{try{const elements=Array.from(document.querySelectorAll(check.selector));return {id:check.id,selector:check.selector,passed:elements.some(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'&&s.opacity!=='0'&&r.left>=-1&&r.right<=innerWidth+1&&(typeof e.checkVisibility!=='function'||e.checkVisibility({opacityProperty:true,visibilityProperty:true}));})};}catch(error){return {id:check.id,error:error.message};}})`);
   const key='__lt_review_'+crypto.randomBytes(8).toString('hex');
   await evaluate(`(()=>{const s={frames:[],longTasks:[],start:performance.now(),last:null};window[${JSON.stringify(key)}]=s;s.tick=t=>{if(s.last!==null&&s.frames.length<2000)s.frames.push(t-s.last);s.last=t;s.raf=requestAnimationFrame(s.tick)};s.raf=requestAnimationFrame(s.tick);try{s.observer=new PerformanceObserver(list=>{for(const e of list.getEntries())if(s.longTasks.length<200)s.longTasks.push(e.duration)});s.observer.observe({type:'longtask',buffered:false})}catch(_){s.unsupported=true}})()`);
   let performance;
   try{await wait(sampleMs,signal);await assertCurrent();performance=await evaluate(`(()=>{const s=window[${JSON.stringify(key)}],f=s.frames.sort((a,b)=>a-b);return {sampleMs:performance.now()-s.start,frames:f.length,medianFrameMs:f[Math.floor(f.length*.5)]||null,p95FrameMs:f[Math.floor(f.length*.95)]||null,longTasks:s.longTasks.length,longTaskMs:s.longTasks.reduce((a,b)=>a+b,0),supported:!s.unsupported,focusEmulated:true,kind:'browser frame intervals; not application FPS'};})()`);}
   finally{if(!wc.isDestroyed())await evaluate(`(()=>{const s=window[${JSON.stringify(key)}];if(s){cancelAnimationFrame(s.raf);s.observer?.disconnect();delete window[${JSON.stringify(key)}]}})()`).catch(()=>{});}
   const state=await statusNow(status,current);evidence.viewports.push({name:viewport.name,width:viewport.width,height:viewport.height,dom,performance,errors:(state?.errors||[]).map(e=>({message:e.message,location:e.location?{path:e.location.path,line:e.location.line}:null})),logs:(state?.logs||[]).slice(-8),memory:state?.memory});
   if(images){await assertCurrent();const r=await wc.debugger.sendCommand('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:true,clip:{x:0,y:0,width:viewport.width,height:viewport.height,scale:1}});if(!r.data)throw Error('Preview pixels are unavailable');evidence.images.push(r.data);}
  }
  await assertCurrent();return evidence;
 }finally{
  if(!wc.isDestroyed()){try{await wc.debugger.sendCommand('Emulation.clearDeviceMetricsOverride');await evaluate('scrollTo('+saved.x+','+saved.y+')');}finally{if(focusEmulated&&!wc.isDestroyed())await wc.debugger.sendCommand('Emulation.setFocusEmulationEnabled',{enabled:false});}}
 }
}
async function statusNow(fallback,current){return typeof current.status==='function'?current.status():fallback;}
function sourceCurrent(state,buffers=[]){
 const open=new Map(buffers.map(b=>[b.path.toLowerCase(),b.source]));
 return sourceFiles(state).every(f=>{try{const source=open.get(f.path.toLowerCase());if(f.origin==='http'){const disk=fs.readFileSync(f.path);return !!f.sourceSha256&&crypto.createHash('sha256').update(disk).digest('hex')===f.sourceSha256&&(source===undefined||source.replace(/\r\n?/g,'\n')===disk.toString('utf8').replace(/\r\n?/g,'\n'));}return source!==undefined&&f.source!==null?source===f.source:crypto.createHash('sha256').update(fs.readFileSync(f.path)).digest('hex')===f.sha256;}catch(_){return false;}});
}
module.exports={collect,identity,sourceCurrent,sourceFiles,sources,viewports,digest};
