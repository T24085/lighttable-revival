'use strict';
process.env.LT_REVIVAL_TEST='1';process.env.LT_REVIVAL_AUTO_LIVE='1';
const {app,dialog}=require('electron'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const core=path.resolve(__dirname,'../../deploy/core'),policy=require(core+'/proof-policy.cjs'),projects=require(core+'/revival-projects.cjs');
const base=path.join(policy.root,'auto-vite-fixtures'),root=path.join(base,crypto.randomUUID()),project=path.join(root,'web-app');fs.mkdirSync(root,{recursive:true});
const previous=fs.existsSync(projects.statePath)?fs.readFileSync(projects.statePath):null;
function tree(dir){const files=new Map();if(!fs.existsSync(dir))return files;for(const item of fs.readdirSync(dir,{withFileTypes:true})){assert(!item.isSymbolicLink());const file=path.join(dir,item.name);if(item.isDirectory())for(const value of tree(file))files.set(...value);else files.set(file,fs.readFileSync(file));}return files;}
const saved=[path.join(policy.user,'ltcache'),path.join(policy.user,'assistant')].map(dir=>({dir,files:tree(dir)}));
dialog.showOpenDialogSync=()=>[root];
let trustCalls=0,allowTrust=true;dialog.showMessageBox=async()=>{trustCalls++;return {response:allowTrust?1:0};};
projects.create(projects.chooseParent(root).token,'web-app',{template:'vite-react-tailwind'});
require(core+'/revival-assistant-ollama.cjs').create=()=>({models:async()=>[],show:async()=>({capabilities:['tools']})});
const result={passed:false,checks:[],commands:[],behavior:[]};let backend,host,ending=false;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),deadline=setTimeout(()=>finish(Error('Automatic Vite native proof exceeded five minutes')),300000);
async function finish(error){
 if(ending)return;ending=true;clearTimeout(deadline);if(error)result.error=error.stack;
 try{
  await backend.assistant.shutdown();for(const name of ['revival-preview.cjs','revival-languages.cjs','revival-npm.cjs','revival-node.cjs','proof-js.cjs'])await require(core+'/'+name).shutdown();await require(core+'/proof-memory.cjs').stop();
  if(previous)fs.writeFileSync(projects.statePath,previous);else if(fs.existsSync(projects.statePath))fs.unlinkSync(projects.statePath);
  for(const {dir,files}of saved){for(const file of tree(dir).keys())if(!files.has(file))fs.unlinkSync(file);for(const [file,bytes]of files){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);}}
  assert.equal(path.dirname(fs.realpathSync(root)),base);fs.rmSync(root,{recursive:true});
  result.cleanup={...backend.assistant.diagnostics(),...require(core+'/proof-memory.cjs').status(),removed:!fs.existsSync(root),projectRestored:previous?fs.readFileSync(projects.statePath).equals(previous):!fs.existsSync(projects.statePath)};
  result.passed=!error&&result.cleanup.active===0&&result.cleanup.commands===0&&result.cleanup.jobs===0&&!result.cleanup.helperPid&&result.cleanup.removed&&result.cleanup.projectRestored;
 }catch(reason){result.cleanupError=reason.stack;}
 result.completedAt=new Date().toISOString();fs.writeFileSync(path.join(policy.root,'auto-vite-result.json'),JSON.stringify(result,null,2));console.error(JSON.stringify({passed:result.passed,checks:result.checks,error:result.error,cleanupError:result.cleanupError}));app.exit(result.passed?0:1);
}
app.on('browser-window-created',(_event,window)=>{
 if(host)return;host=window;host.setOpacity(0);host.setSkipTaskbar(true);host.showInactive();host.setBounds({x:40,y:40,width:1440,height:900});
 host.webContents.once('did-finish-load',()=>setTimeout(async()=>{try{
  const owner=host.webContents.id,preview=require(core+'/revival-preview.cjs'),npm=require(core+'/revival-npm.cjs');
  const ui=source=>host.webContents.executeJavaScript(source),until=async(predicate,timeout=20000)=>{const end=Date.now()+timeout;while(true){try{if(await predicate())return;}catch(_){}if(Date.now()>end)throw Error('Automatic Vite condition timed out');await sleep(100);}};
  const check=(name,condition)=>{assert(condition,name);result.checks.push(name);console.error(name);};
  const rendered=async text=>{try{return await preview.view(owner)?.webContents.executeJavaScript('document.body.innerText.includes('+JSON.stringify(text)+')');}catch(_){return false;}};
  await until(()=>ui('!!document.getElementById("live-preview-pane")&&!document.getElementById("live-preview-pane").hidden'));
  check('A restored Vite project opens its preview pane automatically before setup completes',true);
  await until(()=>rendered('Ready to build'),120000);
  const first=npm.status(owner);result.initialServer={id:first.id,pid:first.pid,automatic:first.automatic};
  check('Automatic startup installs missing dependencies and starts a quota-contained Vite server after project trust',trustCalls===1&&first.automatic&&first.memory.hardPrivateCommit&&fs.existsSync(path.join(project,'node_modules/vite/bin/vite.js')));
  check('The automatic split displays the actual Vite app without a Run or Preview action',preview.status(owner).project.live&&await ui('document.body.classList.contains("live-preview-split")'));
  const clicked=await preview.view(owner).webContents.executeJavaScript('(async()=>{document.getElementById("increment").click();await new Promise(r=>setTimeout(r,70));return {count:document.getElementById("count").textContent,font:getComputedStyle(document.querySelector("h1")).fontSize};})()');
  check('The actual automatic app has React interactions and compiled Tailwind styling',clicked.count==='1'&&parseFloat(clicked.font)>=30);
  const appFile=path.join(project,'src/App.tsx');await ui('lt.objs.command.exec_BANG_(cljs.core.keyword("open-path"),'+JSON.stringify(appFile)+');void 0;');
  const files=require(core+'/revival-assistant-files.cjs').create({editor:(op,args)=>backend.assistant.editor(owner,op,args),save:backend.assistant.runtime.store.save}),tools=require(core+'/revival-assistant-tools.cjs').create({files,editor:(op,args)=>backend.assistant.editor(owner,op,args)}),session=backend.assistant.runtime.conversation(project),run={owner,session,abort:new AbortController()};
  await tools.execute({function:{name:'read_file',arguments:{path:'src/App.tsx'}}},run);await tools.execute({function:{name:'edit_file',arguments:{path:'src/App.tsx',old_text:'Ready to build',new_text:'Automatic Vite verified'}}},run);
  await until(()=>rendered('Automatic Vite verified'));
  check('A journaled saved edit reaches the automatic Vite preview through live updates',session.journal.at(-1).status==='saved'&&npm.status(owner).id===first.id);
  await ui('document.getElementById("live-preview-run").click();void 0;');await until(async()=>await rendered('Automatic Vite verified')&&await ui('!ltLive.state().busy'));
  check('The preview Run button reloads the app and reuses its existing server',npm.status(owner).id===first.id&&await preview.view(owner).webContents.executeJavaScript('document.getElementById("count").textContent==="0"'));
  host.webContents.reload();await until(()=>ui('!!window.ltLive&&!!document.getElementById("assistant-dock")'));await until(()=>rendered('Automatic Vite verified'));
  check('Reloading the editor automatically restores the split and adopts the existing server without duplicates',npm.status(owner).id===first.id&&npm.activeCount()===1&&await ui('!document.getElementById("live-preview-pane").hidden'));
  await until(()=>preview.view(owner)?.getVisible());
  result.previewBounds=preview.view(owner).getBounds();result.previewScreenshot=path.join(policy.root,'auto-vite-preview.png');fs.writeFileSync(result.previewScreenshot,(await require('./native-page-capture.cjs').captureNativePage(preview.view(owner).webContents)).toPNG());
  check('The actual automatic preview is visible beside the code with nonzero viewport bounds and captured pixels',result.previewBounds.width>200&&result.previewBounds.height>200);
  result.screenshot=path.join(policy.root,'auto-vite.png');fs.writeFileSync(result.screenshot,(await require('./native-page-capture.cjs').captureNativePage(host.webContents)).toPNG());
  await ui('ltLive.pause();void 0;');await until(()=>npm.activeCount()===0&&preview.activeCount()===0);await sleep(1200);
  check('Pausing automatic Vite stops its owned process family and does not immediately restart',npm.activeCount()===0&&await ui('ltLive.paused()'));
  fs.writeFileSync(path.join(project,'vite.config.ts'),'this is invalid TypeScript config !!!');await ui('ltLive.resume();void 0;');await until(()=>ui('ltLive.paused()&&!ltLive.state().busy'));
  check('Failed Vite startup leaves the preview pane visible with a retryable error',await ui('!document.getElementById("live-preview-pane").hidden&&!!document.getElementById("live-preview-status").textContent&&document.getElementById("live-preview-slot").textContent.includes("npm")'));
  fs.writeFileSync(path.join(project,'vite.config.ts'),require(core+'/revival-project-starters.cjs').files('vite-react-tailwind')['vite.config.ts']);await ui('document.getElementById("live-preview-run").click();void 0;');await until(()=>rendered('Automatic Vite verified'));
  check('Fixing setup and clicking Run restarts the actual automatic preview',npm.status(owner).id!==first.id&&await ui('!ltLive.paused()'));
  const plain=path.join(root,'plain');fs.mkdirSync(plain);fs.writeFileSync(path.join(plain,'index.html'),'<h1>Plain automatic preview preserved</h1>');projects.activate(plain);await ui('ltProjects.openedFolder('+JSON.stringify({path:plain,name:'plain'})+');void 0;');await until(()=>rendered('Plain automatic preview preserved'));
  check('Switching to plain HTML closes the automatic Vite server and retains ordinary automatic preview',npm.activeCount()===0&&!preview.status(owner).project.live);
  const incomplete=path.join(root,'incomplete');fs.mkdirSync(incomplete);fs.writeFileSync(path.join(incomplete,'package.json'),JSON.stringify({devDependencies:{tailwindcss:'4.3.3'}}));projects.activate(incomplete);await ui('ltProjects.openedFolder('+JSON.stringify({path:incomplete,name:'incomplete'})+');void 0;');await until(()=>ui('ltLive.paused()&&!ltLive.state().busy'));
  check('An incomplete web project shows setup guidance in the preview pane instead of disappearing',npm.activeCount()===0&&await ui('!document.getElementById("live-preview-pane").hidden&&document.getElementById("live-preview-slot").textContent.includes("dev script")'));
  allowTrust=false;await ui('ltProjects.newProject();document.getElementById("project-create-name").value="declined";document.getElementById("project-template").value="vite-react-tailwind";document.getElementById("project-choose-location").click();document.getElementById("project-create-submit").click();void 0;');await until(()=>ui('ltProjects.info().current.name==="declined"&&ltLive.paused()&&!ltLive.state().busy&&ltLive.state().reason.includes("cancelled")'));
  const declinedCalls=trustCalls;await sleep(1200);
  check('A cancelled project-execution permission pauses automatic setup without looping or starting processes',npm.activeCount()===0&&trustCalls===declinedCalls&&await ui('document.getElementById("live-preview-slot").textContent.includes("cancelled")'));
  await ui('ltLive.toggle();void 0;');projects.activate(project);await ui('ltProjects.openedFolder('+JSON.stringify({path:project,name:'web-app'})+');void 0;');await sleep(1300);
  check('Turning Automatic live view off keeps it off when changing projects',npm.activeCount()===0&&await ui('!ltLive.enabled()&&document.getElementById("live-preview-pane").hidden'));
  await finish();
 }catch(error){await finish(error);}},600));
});backend=require(core+'/main.js');
