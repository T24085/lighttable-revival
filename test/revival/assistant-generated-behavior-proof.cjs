'use strict';
process.env.LT_REVIVAL_TEST='1';
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const core=path.resolve(__dirname,'../../deploy/core'),policy=require(core+'/proof-policy.cjs'),projects=require(core+'/revival-projects.cjs');
const preview=require(core+'/revival-preview.cjs'),memory=require(core+'/proof-memory.cjs');
const base=path.join(policy.root,'assistant-behavior-fixtures'),root=path.join(base,crypto.randomUUID());
const previous=fs.existsSync(projects.statePath)?fs.readFileSync(projects.statePath):null;
const result={passed:false,checks:[],viewports:[]},owner='generated-assistant-behavior';
let ending=false;
const deadline=setTimeout(()=>finish(Error('Generated browser behavior exceeded its deadline')),30000);
async function finish(error){
 if(ending)return;ending=true;clearTimeout(deadline);if(error)result.error=error.stack;
 try{
  await preview.stop(owner);await memory.stop();
  if(previous)fs.writeFileSync(projects.statePath,previous);else if(fs.existsSync(projects.statePath))fs.unlinkSync(projects.statePath);
  if(fs.existsSync(root)){assert.equal(path.dirname(fs.realpathSync(root)),base);fs.rmSync(root,{recursive:true});}
  result.cleanup={...preview.diagnostics(),...memory.status(),removed:!fs.existsSync(root)};
  result.passed=!error&&result.cleanup.jobs===0&&!result.cleanup.helperPid&&result.cleanup.removed;
 }catch(reason){result.cleanupError=reason.stack;}
 fs.writeFileSync(path.join(policy.root,'assistant-generated-behavior-result.json'),JSON.stringify(result,null,2));
 app.exit(result.passed?0:1);
}
app.whenReady().then(async()=>{try{
 const receipt=JSON.parse(fs.readFileSync(path.join(policy.root,'assistant-ollama-web-result.json'),'utf8'));
 assert(receipt.passed,'A completed real-model workflow is required');
 fs.mkdirSync(root,{recursive:true});
 result.model=receipt.model;result.workflowCompletedAt=receipt.completedAt;result.sources=[];
 for(const name of ['index.html','app.js']){
  const file=receipt.generatedFiles.find(file=>file.path===name);assert(file,'Missing generated '+name);
  const hash=crypto.createHash('sha256').update(file.content).digest('hex');assert.equal(hash,file.sha256);
  fs.writeFileSync(path.join(root,name),file.content);result.sources.push({name,sha256:hash});
 }
 projects.activate(root);
 const host=new BrowserWindow({show:false,width:1300,height:900,opacity:0,skipTaskbar:true,webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true,backgroundThrottling:false}});
 host.showInactive();await host.loadURL('data:text/html,<title>Generated app behavior proof</title>');
 await preview.start(owner,{path:path.join(root,'index.html')},host);
 for(const [name,width,height]of [['desktop',1280,800],['mobile',390,844]]){
  preview.bounds(owner,{x:0,y:0,width,height,visible:true});
  await new Promise(resolve=>setTimeout(resolve,150));
  const reply=await preview.evaluate(owner,'(()=>{const output=document.getElementById("count"),button=document.getElementById("increment");if(!output||!button)throw Error("Missing counter controls");const before=Number(output.textContent);button.click();const first=Number(output.textContent);button.click();return {heading:document.querySelector("h1").textContent,before,first,second:Number(output.textContent),width:innerWidth,height:innerHeight};})()');
  assert(!reply.failed,reply.error?.message);const value=JSON.parse(reply.result);
  assert.equal(value.heading,'Updated Counter');assert(Number.isFinite(value.before));if(name==='desktop')assert.equal(value.before,0);assert.equal(value.first,value.before+2);assert.equal(value.second,value.before+4);
  assert.equal(value.width,width);assert.equal(value.height,height);assert.deepEqual(preview.status(owner).errors,[]);
  result.viewports.push({name,...value});result.checks.push('Actual generated button adds 2 per click at '+name+' size');
 }
 await finish();
}catch(error){await finish(error);}});
