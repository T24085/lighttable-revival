'use strict';
process.env.LT_REVIVAL_TEST='1';process.env.LT_REVIVAL_AUTO_LIVE='0';
const {app,dialog}=require('electron'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const core=path.resolve(__dirname,'../../deploy/core'),policy=require(core+'/proof-policy.cjs'),projects=require(core+'/revival-projects.cjs');
const base=path.join(policy.root,'vite-tailwind-fixtures'),root=path.join(base,crypto.randomUUID()),project=path.join(root,'web-app');fs.mkdirSync(root,{recursive:true});
const previous=fs.existsSync(projects.statePath)?fs.readFileSync(projects.statePath):null;
function tree(dir){const files=new Map();if(!fs.existsSync(dir))return files;for(const item of fs.readdirSync(dir,{withFileTypes:true})){assert(!item.isSymbolicLink());const file=path.join(dir,item.name);if(item.isDirectory())for(const value of tree(file))files.set(...value);else files.set(file,fs.readFileSync(file));}return files;}
const saved=[path.join(policy.user,'ltcache'),path.join(policy.user,'assistant')].map(dir=>({dir,files:tree(dir)}));
dialog.showOpenDialogSync=()=>[root];
require(core+'/revival-assistant-ollama.cjs').create=()=>({models:async()=>[],show:async()=>({capabilities:['tools']})});
const result={passed:false,checks:[],commands:[],behavior:[]};let backend,host,ending=false;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),deadline=setTimeout(()=>finish(Error('Vite/Tailwind native proof exceeded five minutes')),300000);
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
 result.completedAt=new Date().toISOString();fs.writeFileSync(path.join(policy.root,'vite-tailwind-result.json'),JSON.stringify(result,null,2));console.error(JSON.stringify({passed:result.passed,checks:result.checks,error:result.error,cleanupError:result.cleanupError}));app.exit(result.passed?0:1);
}
app.on('browser-window-created',(_event,window)=>{
 if(host)return;host=window;host.setOpacity(0);host.setSkipTaskbar(true);host.showInactive();host.setBounds({x:40,y:40,width:1440,height:900});
 host.webContents.once('did-finish-load',()=>setTimeout(async()=>{try{
  const ui=source=>host.webContents.executeJavaScript(source),until=async predicate=>{const end=Date.now()+15000;while(!await predicate()){if(Date.now()>end)throw Error('Native Vite/Tailwind condition timed out');await sleep(100);}};
  const check=(name,condition)=>{assert(condition,name);result.checks.push(name);console.error(name);};
  await until(()=>ui('!!document.getElementById("assistant-dock")'));
  await ui('ltProjects.newProject();document.getElementById("project-create-name").value="web-app";document.getElementById("project-template").value="vite-react-tailwind";document.getElementById("project-choose-location").click();document.getElementById("project-create-submit").click();void 0;');
  check('The original New project dialog creates the selected Vite/React/Tailwind template',projects.info().current.path===project&&fs.existsSync(path.join(project,'src/App.tsx'))&&fs.existsSync(path.join(project,'vite.config.ts')));
  const owner=host.webContents.id,command=async(text,cwd=project,purpose='setup')=>{const value=await backend.assistant.commands.start(owner,{command:text,cwd,purpose});result.commands.push(value);console.error(JSON.stringify({command:text,status:value.status,exitCode:value.exitCode,error:value.error}));return value;};
  const shellFailure=await command('Write-Error "setup did not finish"; Write-Output "should not reach"');
  check('A PowerShell failure stops the command batch before a later success can mask it',shellFailure.exitCode!==0&&!shellFailure.stdout.includes('should not reach'));
  const nativeFailure=await command('node -e "process.exit(7)"; node -e "console.log(\'should not reach\')"');
  check('A failed native command retains exit 7 and stops subsequent commands',nativeFailure.exitCode===7&&!nativeFailure.stdout.includes('should not reach'));
  await assert.rejects(command('npm create vite@9.2.1 . -- --template react-ts'),error=>error.code==='LT_VITE_INTERACTIVE');
  check('Interactive scaffolding is rejected before a subprocess can start',backend.assistant.commands.activeCount()===0);
  const cancelled=path.join(root,'cancelled');fs.mkdirSync(cancelled);fs.writeFileSync(path.join(cancelled,'keep.txt'),'Keep this user source');
  const cancelledResult=await command('npm create --yes vite@9.2.1 . -- --template react-ts --no-interactive',cancelled);
  check('Actual cancelled Vite scaffolding is reported failed at exit 0 without overwriting files',cancelledResult.exitCode===0&&cancelledResult.status==='failed'&&cancelledResult.code==='LT_VITE_CANCELLED'&&fs.readFileSync(path.join(cancelled,'keep.txt'),'utf8')==='Keep this user source');
  const install=await command('npm install');check('Actual Vite React Tailwind dependencies install under the process-family quota',install.exitCode===0&&install.memory.hardPrivateCommit);
  result.versions=Object.fromEntries(['vite','react','tailwindcss','@tailwindcss/vite'].map(name=>[name,JSON.parse(fs.readFileSync(path.join(project,'node_modules',name,'package.json'),'utf8')).version]));
  const obsolete=await command('npx tailwindcss init -p');check('The actual Tailwind v4 legacy-command failure returns specific recovery instructions',obsolete.status==='failed'&&obsolete.code==='LT_TAILWIND_SETUP'&&obsolete.error.includes('@tailwindcss/vite'));
  const build=await command('npm run build',project,'build');check('The starter passes actual TypeScript checking and Vite production build',build.exitCode===0&&fs.existsSync(path.join(project,'dist/index.html')));
  const server=await backend.assistant.commands.start(owner,{command:'npm run dev -- --host 127.0.0.1 --port 0',cwd:project,purpose:'server',background:true});
  await until(()=>/http:\/\/127\.0\.0\.1:\d+/.test(backend.assistant.commands.status(server.id)?.stdout||''));
  const url=backend.assistant.commands.status(server.id).stdout.match(/http:\/\/127\.0\.0\.1:\d+/)[0],session=backend.assistant.runtime.conversation(project),run={owner,session,abort:new AbortController()};
  await backend.assistant.preview.start(run,{job_id:server.id,url});
  await until(async()=>{try{return (await backend.assistant.preview.inspect(run)).dom.text.includes('Ready to build');}catch(_){return false;}});
  check('The actual Vite development server renders React in the native live preview',true);
  for(const viewport of ['desktop','mobile']){
   const value=await backend.assistant.preview.check(run,{label:'React state and compiled Tailwind styles',viewport,source:'(async()=>{const button=document.getElementById("increment"),output=document.getElementById("count"),before=Number(output.textContent);button.click();await new Promise(r=>setTimeout(r,60));const after=Number(output.textContent),style=getComputedStyle(document.querySelector("h1")),background=getComputedStyle(document.querySelector("main")).backgroundColor;return {passed:after===before+1&&parseFloat(style.fontSize)>=30&&background!=="rgba(0, 0, 0, 0)",details:JSON.stringify({before,after,fontSize:style.fontSize,background})};})()'});
   result.behavior.push(value);check('React interactions and actual compiled Tailwind styling pass at '+viewport+' size',value.passed);
  }
  const files=require(core+'/revival-assistant-files.cjs').create({editor:(op,args)=>backend.assistant.editor(owner,op,args),save:backend.assistant.runtime.store.save}),tools=require(core+'/revival-assistant-tools.cjs').create({files,editor:(op,args)=>backend.assistant.editor(owner,op,args)});
  await tools.execute({function:{name:'read_file',arguments:{path:'src/App.tsx'}}},run);
  await tools.execute({function:{name:'edit_file',arguments:{path:'src/App.tsx',old_text:'Ready to build',new_text:'Updated Vite app'}}},run);
  await until(async()=>{try{return (await backend.assistant.preview.inspect(run)).dom.text.includes('Updated Vite app');}catch(_){return false;}});
  check('Journaled source edits reach the actual React app through Vite live updates',session.journal.at(-1).status==='saved');
  const pixels=await backend.assistant.preview.capture(run);result.screenshot=path.join(policy.root,'vite-tailwind.png');fs.writeFileSync(result.screenshot,Buffer.from(pixels.images[0],'base64'));
  const rebuilt=await command('npm run build',project,'build');check('The edited application still type-checks and builds',rebuilt.exitCode===0);
  await finish();
 }catch(error){await finish(error);}},600));
});backend=require(core+'/main.js');
