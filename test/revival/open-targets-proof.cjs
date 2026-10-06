'use strict';
// Root launches this proof through .revival/run-open-targets-proof.ps1.
// Initial targets come from actual Electron argv; this fixture never seeds or drains them.
process.env.LT_REVIVAL_TEST='1';
const {app,Menu,dialog}=require('electron'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const sourceRoot=path.resolve(__dirname,'../..'),core=path.join(sourceRoot,'deploy/core');
const launchEntries=process.argv.filter(value=>typeof value==='string'&&value.endsWith(':2'));
if(launchEntries.length!==2||launchEntries[0]!==launchEntries[1])throw Error('Pass the same owned Unicode entry:2 twice through actual Electron argv');
const entry=launchEntries[0].slice(0,-2),fixtureRoot=path.dirname(entry);
if(!path.isAbsolute(entry)||!path.basename(fixtureRoot).startsWith('lt-open-targets-')||!entry.includes('\u03a9')||!entry.includes('\ud83d\ude00'))throw Error('The native startup proof requires its owned Unicode temp filename');
const policy=require(path.join(core,'proof-policy.cjs')),projects=require(path.join(core,'revival-projects.cjs'));
const queued=path.join(fixtureRoot,'queued before ready.js'),later=path.join(fixtureRoot,'later response.mjs'),numeric=path.join(fixtureRoot,'notes2026'),sibling=path.join(fixtureRoot,'sibling.js');
const missing=path.join(fixtureRoot,'new startup file.js'),missingOS=path.join(fixtureRoot,'not from cli.js'),invalidParent=path.join(fixtureRoot,'missing-parent','invalid.js');
const junction=path.join(fixtureRoot,'link','blocked.js'),directory=path.join(fixtureRoot,'workspace folder'),otherProject=path.join(fixtureRoot,'second project'),secondFile=path.join(fixtureRoot,'second window.js'),survivorFile=path.join(fixtureRoot,'survivor window.js');
const oversized=path.join(fixtureRoot,'oversized.js'),changedTarget=path.join(fixtureRoot,'changed-target.js'),contextName='context-report.js',contextA=path.join(directory,contextName),contextB=path.join(otherProject,contextName);
const hash=value=>crypto.createHash('sha256').update(value).digest('hex'),normalized=file=>fs.readFileSync(file,'utf8').replace(/\r\n?|\n/g,'\n');
const inside=(file,root)=>{const relative=path.relative(root,file);return relative===''||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative));};
if([policy.deploy,policy.user,policy.docs].some(root=>inside(fixtureRoot,root)))throw Error('Startup fixture must be outside the implicit proof roots');
// These additional targets are created only inside the factory's new owned temp root.
fs.mkdirSync(otherProject);fs.writeFileSync(path.join(otherProject,'second-folder.txt'),'Second native project picker target.',{flag:'wx'});
fs.writeFileSync(oversized,Buffer.alloc(8*1024*1024+1),{flag:'wx'});fs.writeFileSync(changedTarget,'42;',{flag:'wx'});
const fixtureFiles=[entry,queued,later,numeric,sibling,secondFile,survivorFile,oversized,changedTarget,path.join(fixtureRoot,'link-target','blocked.js'),path.join(directory,'folder-only.txt'),path.join(otherProject,'second-folder.txt')];
const original=new Map(fixtureFiles.map(file=>[file,fs.readFileSync(file)]));
if(fs.existsSync(missing)||fs.existsSync(missingOS)||fs.existsSync(path.dirname(invalidParent))||fs.existsSync(contextA)||fs.existsSync(contextB))throw Error('New-file, context-file and invalid-parent targets must initially be absent');
const examples=['bridge-test.txt','calculation.js','input-test.css','large-snapshot.txt','order-report-test.js','order-report.js'];
const normalPaths=[path.join(core,'main.js'),path.join(core,'package.json'),...['proof-files','test-proof-files'].flatMap(folder=>examples.map(name=>path.join(policy.root,folder,name)))];
const snapshot=file=>({path:file,exists:fs.existsSync(file),sha256:fs.existsSync(file)?hash(fs.readFileSync(file)):null});
const normal=normalPaths.map(snapshot),frozen=[__filename,'main.js','revival-open-targets.cjs','proof-preload.cjs','proof-facade.js','LightTable.html','revival-projects.cjs','revival-projects.js','revival-desktop.cjs','proof-policy.cjs',path.join(sourceRoot,'Launch-LightTable.bat'),path.join(sourceRoot,'../Launch-LightTable.bat'),path.join(sourceRoot,'test/revival/open-target-fixtures.cjs')].map(file=>snapshot(path.isAbsolute(file)?file:path.join(core,file)));
const projectBefore=projects.info().current,projectState={path:projects.statePath,exists:fs.existsSync(projects.statePath),bytes:fs.existsSync(projects.statePath)?fs.readFileSync(projects.statePath):null};
const cacheRoot=path.resolve(policy.user,'ltcache');
if(process.env.LT_REVIVAL_TEST!=='1'||path.basename(policy.user)!=='test-user'||!inside(cacheRoot,policy.user))throw Error('Cache restoration is restricted to the owned test-user cache');
function cacheFiles(){
 const files=[];function visit(directory){if(!fs.existsSync(directory))return;if(!inside(directory,cacheRoot))throw Error('Cache enumeration escaped its verified test root');const stat=fs.lstatSync(directory);if(stat.isSymbolicLink()||!stat.isDirectory())throw Error('Invalid test cache directory');for(const name of fs.readdirSync(directory)){const file=path.resolve(directory,name);if(!inside(file,cacheRoot))throw Error('Cache entry escaped its verified test root');const entry=fs.lstatSync(file);if(entry.isSymbolicLink())throw Error('Test cache links are forbidden');if(entry.isDirectory())visit(file);else if(entry.isFile())files.push(file);else throw Error('Invalid test cache file');}}
 visit(cacheRoot);return files;
}
const cacheOriginal=new Map(cacheFiles().map(file=>[file,fs.readFileSync(file)]));
const checks=[],receipt=path.join(policy.root,'open-targets-editor-result.json'),progress=path.join(policy.root,'open-targets-editor-progress.json');
let transport,firstWindow,secondWindow,result,folderUI,finished=false,finishing=false,queuedPrevented=false,queuedBeforeReady=false;
const windows=[];
function restoreProjectState(){if(projectState.exists)fs.writeFileSync(projectState.path,projectState.bytes);else if(fs.existsSync(projectState.path))fs.unlinkSync(projectState.path);}
function restoreCache(){
 for(const file of cacheFiles())if(!cacheOriginal.has(file)){if(!inside(path.resolve(file),cacheRoot)||!fs.lstatSync(file).isFile())throw Error('Refusing removal outside verified test cache');fs.unlinkSync(file);}
 for(const [file,bytes] of cacheOriginal){if(!inside(path.resolve(file),cacheRoot))throw Error('Refusing restoration outside verified test cache');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);}
 const current=cacheFiles();return current.length===cacheOriginal.size&&current.every(file=>cacheOriginal.has(file)&&fs.readFileSync(file).equals(cacheOriginal.get(file)));
}
function saveProgress(stage){fs.writeFileSync(progress,JSON.stringify({stage,checks,entry,fixtureRoot,transport:transport?.diagnostics(),windows:windows.filter(window=>!window.isDestroyed()).map(window=>({id:window.id,webContentsId:window.webContents.id})),time:new Date().toISOString()},null,2));}
const check=(name,ok)=>{if(!ok)throw Error(name);checks.push(name);console.log(name);saveProgress(name);};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(predicate,ms=6000){const end=Date.now()+ms;while(!await predicate()){if(Date.now()>=end)throw Error('Startup proof condition exceeded '+ms+' ms');await sleep(20);}}
const ui=(window,expression)=>window.webContents.executeJavaScript(expression);
const activePath='(()=>{const editor=lt.objs.editor.pool.last_active();return editor?cljs.core.clj__GT_js(cljs.core.get(cljs.core.deref(editor),cljs.core.keyword("info"))).path:null;})()';
const countFor=file=>'cljs.core.count(lt.objs.editor.pool.by_path('+JSON.stringify(file)+'))';
const denyRead=(window,file)=>ui(window,'(()=>{try{ltProof.read('+JSON.stringify(file)+');return false;}catch(error){return /Path outside proof roots|Links forbidden/.test(error.message);}})()');
const nativeItem=label=>{const find=menu=>{for(const item of menu?.items||[]){if(item.label?.replace(/&/g,'')===label)return item;if(item.submenu){const found=find(item.submenu);if(found)return found;}}};return find(Menu.getApplicationMenu());};
async function focused(window){window.focus();window.webContents.focus();await until(()=>window.isFocused()&&window.webContents.isFocused(),2500);}
async function activate(window,file){await focused(window);await ui(window,'lt.objs.tabs.active_BANG_(cljs.core.first(lt.objs.editor.pool.by_path('+JSON.stringify(file)+')));ltProofUI.connect().focus();void 0;');await until(()=>ui(window,activePath).then(value=>value===file));}
async function clickMenu(window,label){await focused(window);await ui(window,'ltProofUI.refreshMenus(true);void 0;');await until(()=>!!nativeItem(label)?.enabled);nativeItem(label).click();}
async function ready(window){await until(()=>ui(window,'typeof ltStartup!=="undefined"&&ltStartup.diagnostics().initialized&&typeof ltProofUI!=="undefined"'),10000);}
async function evaluate(window,file,expected){
 await focused(window);await until(()=>!!nativeItem('Run file')?.enabled);nativeItem('Run file').click();
 await until(()=>ui(window,'ltProofUI.getLast()?.source').then(value=>value===normalized(file)),20000);
 const value=await ui(window,'ltProofUI.pending()');
 check('Native Run evaluates '+path.basename(file)+' as '+expected+' with authored source/hash and hard 1 GiB quota',value.accepted&&value.result.result===String(expected)&&value.result.source===normalized(file)&&value.result.sha256===hash(normalized(file))&&value.result.memory.hardPrivateCommit&&value.result.memory.limitBytes===1024*1024*1024&&value.result.memory.processExited);
 return value.result;
}
async function openEvent(window,file){await focused(window);let prevented=false;app.emit('open-file',{preventDefault(){prevented=true;}},file);return prevented;}
const deadline=setTimeout(()=>{if(finished)return;const timeout={passed:false,checks,entry,fixtureRoot,error:'Original startup native proof exceeded its firm 70-second deadline',transport:transport?.diagnostics(),normal,frozen};try{restoreProjectState();timeout.projectStateRestored=true;timeout.cacheRestored=restoreCache();}catch(error){timeout.restoreError=error.message;}fs.writeFileSync(receipt,JSON.stringify(timeout,null,2));const firstFailure=path.join(policy.root,'open-targets-editor-first-failure.json');if(!fs.existsSync(firstFailure))fs.writeFileSync(firstFailure,JSON.stringify(timeout,null,2));app.exit(2);},70000);
const originalHTML=path.join(core,'LightTable.html').toLowerCase();
function originalURL(window,value){try{const parsed=new URL(value);return parsed.protocol==='file:'&&path.resolve(require('url').fileURLToPath(parsed)).toLowerCase()===originalHTML&&parsed.searchParams.get('id')===String(window.id);}catch(_){return false;}}
function hideOriginal(window){if(window.isDestroyed())return;window.setContentSize(900,600);window.setOpacity(0);window.setSkipTaskbar(true);window.showInactive();}
let initialWindowSeen=false;
app.on('browser-window-created',(_event,window)=>{
 // Original main creates the first window before the UI can start evaluation.
 // Later evaluation BrowserWindows have no editor preload and must stay untouched.
 const first=!initialWindowSeen;initialWindowSeen=true;
 const editorPreload=path.basename(window.webContents.getLastWebPreferences().preload||'')==='proof-preload.cjs';
 if(first||editorPreload)hideOriginal(window);
 const starting=(_navigation,value,_inPlace,mainFrame)=>{if(mainFrame&&originalURL(window,value))hideOriginal(window);};
 const loaded=()=>{
  if(window.isDestroyed()||!originalURL(window,window.webContents.getURL()))return;
  window.webContents.removeListener('did-start-navigation',starting);window.webContents.removeListener('did-finish-load',loaded);
  hideOriginal(window);windows.push(window);
  if(first){firstWindow=window;setTimeout(run,50);}else if(!secondWindow)secondWindow=window;
 };
 window.webContents.on('did-start-navigation',starting);window.webContents.on('did-finish-load',loaded);
});
async function run(){
 try{
  await ready(firstWindow);await until(()=>ui(firstWindow,activePath).then(value=>value===queued));
  const startup=await ui(firstWindow,'ltStartup.diagnostics()');
  check('Actual argv includes Unicode duplicate file:2, a directory, a new-file and Electron logging switch',process.argv.includes(missing)&&process.argv.includes(directory)&&process.argv.includes('--enable-logging')&&app.commandLine.hasSwitch('enable-logging')&&entry.includes('\u03a9')&&entry.includes('\ud83d\ude00'));
  check('The pre-ready OS event was prevented and queued until the original renderer initialized',queuedBeforeReady&&queuedPrevented&&startup.last.path===queued&&startup.last.origin==='file-manager'&&await ui(firstWindow,'ltProofUI.connect().getValue()')===normalized(queued));
  check('Startup delivers four targets once, deduplicates argv and excludes logging from errors/files',startup.delivered===4&&startup.last.kind==='file'&&transport.diagnostics().pending===0&&!transport.diagnostics().overflow&&await ui(firstWindow,countFor(entry))===1&&await ui(firstWindow,countFor(queued))===1&&await ui(firstWindow,countFor(missing))===1);
  folderUI=await ui(firstWindow,'({project:ltProjects.info().current?.path,display:document.getElementById("project-path").textContent,folder:!!lt.objs.sidebar.workspace.find_by_path('+JSON.stringify(directory)+'),folders:cljs.core.clj__GT_js(cljs.core.get(cljs.core.deref(lt.objs.workspace.current_ws),cljs.core.keyword("folders")))})');
  const newFileItem=nativeItem('New file in project...');folderUI.menu={label:'New file in project...',found:!!newFileItem,enabled:!!newFileItem?.enabled};folderUI.mainProject=projects.info().current?.path;folderUI.content=await ui(firstWindow,'ltProof.read('+JSON.stringify(path.join(directory,'folder-only.txt'))+')');
  check('The CLI directory activates the project and appears in the original workspace and New file menu context',folderUI.project===directory&&folderUI.display===directory&&folderUI.folder&&folderUI.folders.includes(directory)&&folderUI.mainProject===directory&&folderUI.menu.enabled&&folderUI.content===normalized(path.join(directory,'folder-only.txt')));
  await activate(firstWindow,entry);const startupEditor=await ui(firstWindow,'({source:ltProofUI.connect().getValue(),cursor:ltProofUI.connect().getCursor()})');
  check('Actual launch file opens original authored CRLF source at requested line 2',startupEditor.source===normalized(entry)&&startupEditor.cursor.line===1);
  check('Startup file grant reads the selected file while its sibling and containing directory remain denied',await ui(firstWindow,'ltProof.read('+JSON.stringify(entry)+')')===fs.readFileSync(entry,'utf8')&&await denyRead(firstWindow,sibling)&&await ui(firstWindow,'(()=>{try{ltProof.list('+JSON.stringify(fixtureRoot)+');return false;}catch(error){return /Path outside proof roots/.test(error.message);}})()'));
  const initial=await evaluate(firstWindow,entry,42);
  await ui(firstWindow,'ltStartup.initialize();ltStartup.initialize();void 0;');
  check('Repeated startup initialization does not replay targets or create duplicate editors',await ui(firstWindow,'ltStartup.diagnostics().delivered')===4&&await ui(firstWindow,countFor(entry))===1&&transport.diagnostics().pending===0);
  check('Later synthetic Electron file-manager delivery uses the main transport',await openEvent(firstWindow,later));await until(()=>ui(firstWindow,activePath).then(value=>value===later));
  check('A later MJS file opens once through the original opener with file-manager provenance',await ui(firstWindow,'ltProofUI.connect().getValue()')===normalized(later)&&await ui(firstWindow,countFor(later))===1&&await ui(firstWindow,'ltStartup.diagnostics().last.origin')==='file-manager');
  const changed=await evaluate(firstWindow,later,63);check('Later Run uses a distinct authored source identity',changed.sha256!==initial.sha256);
  const dirty='// Keep this unsaved\n40 + 24;\n';await ui(firstWindow,'window.openTargetDirtyEditor=ltProofUI.connect();openTargetDirtyEditor.setValue('+JSON.stringify(dirty)+');openTargetDirtyEditor.setCursor({line:1,ch:6});void 0;');
  const beforeDuplicate=await ui(firstWindow,'ltStartup.diagnostics().delivered');await openEvent(firstWindow,later);await until(()=>ui(firstWindow,'ltStartup.diagnostics().delivered').then(value=>value>beforeDuplicate));
  const duplicated=await ui(firstWindow,'({same:ltProofUI.connect()===openTargetDirtyEditor,source:openTargetDirtyEditor.getValue(),cursor:openTargetDirtyEditor.getCursor()})');
  check('Duplicate opening preserves the existing dirty editor, cursor and unsaved disk bytes',await ui(firstWindow,countFor(later))===1&&duplicated.same&&duplicated.source===dirty&&duplicated.cursor.line===1&&duplicated.cursor.ch===6&&fs.readFileSync(later).equals(original.get(later)));
  const beforeDirtyReuse=await ui(firstWindow,'ltStartup.diagnostics().delivered');fs.writeFileSync(later,Buffer.alloc(8*1024*1024+1));
  try{
   await openEvent(firstWindow,later);await until(()=>ui(firstWindow,'ltStartup.diagnostics().delivered').then(value=>value>beforeDirtyReuse));
   const reuse=await ui(firstWindow,'({same:ltProofUI.connect()===openTargetDirtyEditor,source:openTargetDirtyEditor.getValue(),cursor:openTargetDirtyEditor.getCursor(),notice:document.getElementById("proof-notice").textContent})');
   check('Existing dirty editor reuse precedes disk preflight even when its saved file is now oversized',reuse.same&&reuse.source===dirty&&reuse.cursor.line===1&&reuse.cursor.ch===6&&!/Read too large/.test(reuse.notice)&&await ui(firstWindow,countFor(later))===1&&await ui(firstWindow,activePath)===later);
  }finally{fs.writeFileSync(later,original.get(later));}
  await openEvent(firstWindow,numeric);await until(()=>ui(firstWindow,activePath).then(value=>value===numeric));
  check('A numeric-ending filename is opened whole with its original contents',await ui(firstWindow,'ltProofUI.connect().getValue()')===normalized(numeric)&&await ui(firstWindow,'ltStartup.diagnostics().last.path')===numeric);
  await activate(firstWindow,missing);check('A nonexistent CLI target has an original transient editor and no disk bytes',!fs.existsSync(missing)&&await ui(firstWindow,'ltProofUI.connect().getValue()')==='');
  const savedSource='32 * 2;\n',savedBytes=Buffer.from('32 * 2;\r\n','utf8');await ui(firstWindow,'ltProofUI.connect().setValue('+JSON.stringify(savedSource)+');void 0;');check('Editing the new-file remains unsaved until the original Save action',!fs.existsSync(missing));
  let savePickers=0;const nativeSave=dialog.showSaveDialogSync;dialog.showSaveDialogSync=(_owner,options)=>{if(++savePickers!==1||typeof options!=='object')throw Error('Unexpected native Save picker in startup proof');return missing;};
  try{await focused(firstWindow);await until(()=>!!nativeItem('Save file')?.enabled);nativeItem('Save file').click();await until(()=>fs.existsSync(missing)&&fs.readFileSync(missing).equals(savedBytes));}finally{dialog.showSaveDialogSync=nativeSave;}
  check('Original Save asks the native picker once and preserves exact Windows CRLF bytes in the chosen new-file',savePickers===1&&fs.readFileSync(missing).equals(savedBytes)&&await ui(firstWindow,'ltProofUI.connect().getValue()')===savedSource&&await ui(firstWindow,countFor(missing))===1);
  const saved=await evaluate(firstWindow,missing,64);
  const rejectEvent=async(file,label)=>{const before=await ui(firstWindow,'ltStartup.diagnostics().delivered');await openEvent(firstWindow,file);await until(()=>ui(firstWindow,'ltStartup.diagnostics().delivered').then(value=>value>before));const state=await ui(firstWindow,'({last:ltStartup.diagnostics().last,notice:document.getElementById("proof-notice").textContent})');check(label,!await ui(firstWindow,'cljs.core.first(lt.objs.editor.pool.by_path('+JSON.stringify(file)+'))!=null')&&await ui(firstWindow,activePath)===missing&&state.last.kind==='error'&&state.notice.length>0&&state.notice.length<=2048&&await denyRead(firstWindow,file));};
  await rejectEvent(missingOS,'Missing OS file reports a bounded error without a ghost editor or grant');check('Missing OS delivery creates no disk file',!fs.existsSync(missingOS));
  await rejectEvent(invalidParent,'Invalid parent is refused before any editor or file grant');check('Invalid-parent delivery creates no parent directory',!fs.existsSync(path.dirname(invalidParent)));
  await rejectEvent(junction,'A junction target is refused before creating an editor or grant');
  const beforeOversized=await ui(firstWindow,'ltStartup.diagnostics().delivered');await openEvent(firstWindow,oversized);await until(()=>ui(firstWindow,'ltStartup.diagnostics().delivered').then(value=>value>beforeOversized));
  const oversizedState=await ui(firstWindow,'(()=>{let readError=null;try{ltProof.read('+JSON.stringify(oversized)+');}catch(error){readError=error.message;}return {notice:document.getElementById("proof-notice").textContent,selected:ltProof.stat('+JSON.stringify(oversized)+'),kind:ltStartup.diagnostics().last.kind,readError};})()');
  check('An OS-selected oversized file keeps its explicit grant but creates no blank Save-capable editor',oversizedState.selected.file&&oversizedState.selected.size===8*1024*1024+1&&oversizedState.kind==='file'&&/Read too large/.test(oversizedState.readError)&&oversizedState.notice.length>0&&oversizedState.notice.length<=2048&&/Read too large/.test(oversizedState.notice)&&await ui(firstWindow,countFor(oversized))===0&&await ui(firstWindow,activePath)===missing&&fs.readFileSync(oversized).equals(original.get(oversized)));
  const beforeChanged=await ui(firstWindow,'ltStartup.diagnostics().delivered');await focused(firstWindow);app.emit('open-file',{preventDefault(){}},changedTarget);fs.unlinkSync(changedTarget);fs.mkdirSync(changedTarget);
  try{
   await until(()=>ui(firstWindow,'ltStartup.diagnostics().delivered').then(value=>value>beforeChanged));const changedState=await ui(firstWindow,'({notice:document.getElementById("proof-notice").textContent,selected:ltProof.stat('+JSON.stringify(changedTarget)+')})');
   check('A file replaced by a directory after OS selection is rejected before creating an empty editor',changedState.selected.directory&&/no longer a file/.test(changedState.notice)&&changedState.notice.length<=2048&&await ui(firstWindow,countFor(changedTarget))===0&&await ui(firstWindow,activePath)===missing);
  }finally{if(!inside(path.resolve(changedTarget),fixtureRoot)||!fs.lstatSync(changedTarget).isDirectory())throw Error('Refusing changed-target cleanup outside its owned empty directory');fs.rmdirSync(changedTarget);fs.writeFileSync(changedTarget,original.get(changedTarget));}
  await ui(firstWindow,'(()=>{try{ltOpenTargets.take({path:'+JSON.stringify(sibling)+'});}catch(_){}try{ltProof.write('+JSON.stringify(sibling)+',"manufactured");return false;}catch(error){return /Path outside proof roots/.test(error.message);}})()').then(ok=>check('Renderer drain arguments and writes cannot manufacture a sibling grant',ok));
  check('Renderer has no Node require or startup grant/seed capability',await denyRead(firstWindow,sibling)&&await ui(firstWindow,'typeof require==="undefined"&&typeof ltProof.grantFile==="undefined"&&typeof ltOpenTargets.seed==="undefined"')&&fs.readFileSync(sibling).equals(original.get(sibling)));
  const firstInfo=await ui(firstWindow,'({bridge:ltProof.info.windowId,facade:ltRequire("electron").remote.getCurrentWindow().id,original:lt.objs.app.window_number()})');
  check('First original window facade, bridge info and original app use the actual window ID',originalURL(firstWindow,firstWindow.webContents.getURL())&&firstInfo.bridge===firstWindow.id&&firstInfo.facade===firstWindow.id&&firstInfo.original===firstWindow.id);
  await focused(firstWindow);await ui(firstWindow,'lt.objs.app.open_window();void 0;');await until(()=>!!secondWindow);await ready(secondWindow);
  const secondInfo=await ui(secondWindow,'({bridge:ltProof.info.windowId,facade:ltRequire("electron").remote.getCurrentWindow().id,original:lt.objs.app.window_number(),delivery:ltStartup.diagnostics().delivered})');
  check('Original New window IPC creates a second hidden original window with real identity and no replay',originalURL(secondWindow,secondWindow.webContents.getURL())&&secondWindow.id!==firstWindow.id&&secondInfo.bridge===secondWindow.id&&secondInfo.facade===secondWindow.id&&secondInfo.original===secondWindow.id&&secondInfo.delivery===0&&transport.diagnostics().owners===2&&windows.filter(window=>!window.isDestroyed()).every(window=>window.getOpacity()===0));
  await ui(firstWindow,'ltProof.notifyInit(999999);ltProof.notifyInit(-1);void 0;');await ui(secondWindow,'ltProof.notifyInit(1);ltProof.notifyInit(999999);void 0;');await sleep(50);
  check('Repeated init calls with spoofed IDs cannot crash or retarget either actual window',!firstWindow.isDestroyed()&&!secondWindow.isDestroyed()&&await ui(firstWindow,'ltProof.info.windowId')===firstWindow.id&&await ui(secondWindow,'ltProof.info.windowId')===secondWindow.id&&transport.diagnostics().owners===2);
  const firstCount=await ui(firstWindow,'ltStartup.diagnostics().delivered');await openEvent(secondWindow,secondFile);await until(()=>ui(secondWindow,activePath).then(value=>value===secondFile));
  check('A file-manager target routes once to the focused second window without broadcasting to the first',await ui(secondWindow,countFor(secondFile))===1&&await ui(secondWindow,'ltStartup.diagnostics().delivered')===1&&await ui(firstWindow,'ltStartup.diagnostics().delivered')===firstCount&&await ui(firstWindow,countFor(secondFile))===0&&await ui(secondWindow,'ltProofUI.connect().getValue()')===normalized(secondFile));
  const nativeOpen=dialog.showOpenDialogSync;let projectPickers=0;dialog.showOpenDialogSync=(_owner,options)=>{if(++projectPickers!==1||!options?.properties?.includes('openDirectory'))throw Error('Unexpected project picker in startup proof');return [otherProject];};
  try{await clickMenu(secondWindow,'Open project...');await until(()=>ui(secondWindow,'ltProjects.info().current?.path').then(value=>value===otherProject));}finally{dialog.showOpenDialogSync=nativeOpen;}
  check('Second window native Open project selects B while the first still displays project A',projectPickers===1&&projects.info().current?.path===otherProject&&await ui(secondWindow,'document.getElementById("project-path").textContent')===otherProject&&await ui(firstWindow,'ltProjects.info().current?.path')===directory&&await ui(firstWindow,'document.getElementById("project-path").textContent')===directory);
  await clickMenu(firstWindow,'New file in project...');await until(()=>ui(firstWindow,'!!document.getElementById("project-file")?.open'));
  await ui(firstWindow,'document.getElementById("project-file-name").value='+JSON.stringify(contextName)+';document.getElementById("project-file-submit").click();void 0;');
  const contextError=await ui(firstWindow,'document.querySelector("#project-file .project-form-error").textContent');
  check('First window stale New file dialog refuses the changed global project and creates neither A nor B',contextError==='The active project changed in another window. Reopen this project before creating a file.'&&await ui(firstWindow,'document.getElementById("project-file").open')&&!fs.existsSync(contextA)&&!fs.existsSync(contextB));
  await ui(firstWindow,'document.getElementById("project-file-cancel").click();void 0;');await clickMenu(firstWindow,path.basename(directory)+' ('+directory+')');
  await until(()=>ui(firstWindow,'ltProjects.info().current?.path').then(value=>value===directory));
  check('Native Recent projects reopens the chosen displayed project A before retrying New file',projects.info().current?.path===directory&&await ui(firstWindow,'document.getElementById("project-path").textContent')===directory&&!fs.existsSync(contextA)&&!fs.existsSync(contextB));
  await clickMenu(firstWindow,'New file in project...');await until(()=>ui(firstWindow,'!!document.getElementById("project-file")?.open'));await ui(firstWindow,'document.getElementById("project-file-name").value='+JSON.stringify(contextName)+';document.getElementById("project-file-submit").click();void 0;');await until(()=>fs.existsSync(contextA));
  check('Original New file works after explicit project recovery and writes only displayed project A',fs.readFileSync(contextA).length===0&&!fs.existsSync(contextB)&&await ui(firstWindow,activePath)===contextA&&await ui(firstWindow,'ltProofUI.connect().getValue()')===''&&await ui(firstWindow,'!!lt.objs.sidebar.workspace.find_by_path('+JSON.stringify(contextA)+')'));
  // A destroyed renderer cannot reliably deliver executeJavaScript's reply.
  // Trigger the actual bridge, then observe native destruction and ownership.
  ui(firstWindow,'ltProof.window("destroy");void 0;').catch(()=>{});
  await until(()=>firstWindow.isDestroyed());await until(()=>transport.diagnostics().owners===1);
  await openEvent(secondWindow,survivorFile);await until(()=>ui(secondWindow,activePath).then(value=>value===survivorFile));
  check('Closing the first owned window leaves later file-manager delivery usable in the survivor',await ui(secondWindow,countFor(survivorFile))===1&&await ui(secondWindow,'ltStartup.diagnostics().delivered')===2&&await ui(secondWindow,'ltProofUI.connect().getValue()')===normalized(survivorFile)&&transport.diagnostics().pending===0);
  check('Existing owned sources, normal examples, original main and app manifest retain exact bytes',fixtureFiles.every(file=>fs.readFileSync(file).equals(original.get(file)))&&normal.every(item=>fs.existsSync(item.path)===item.exists&&(!item.exists||hash(fs.readFileSync(item.path))===item.sha256)));
  check('The proof and all startup production sources stay frozen during native execution',frozen.every(item=>fs.existsSync(item.path)===item.exists&&(!item.exists||hash(fs.readFileSync(item.path))===item.sha256)));
  await ui(secondWindow,'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');const {captureNativePage}=require('./native-page-capture.cjs');
  const screenshot=path.join(policy.root,'open-targets-original-editor.png');fs.writeFileSync(screenshot,(await captureNativePage(secondWindow.webContents)).toPNG());
  check('An actual native screenshot retains survivor original editor pixels at 900 by 600',secondWindow.getContentSize()[0]===900&&secondWindow.getContentSize()[1]===600&&fs.statSync(screenshot).size>1024);
  result={passed:true,checks,entry,fixtureRoot,initial,changed,saved,startup,startupEditor,folderUI,firstInfo,secondInfo,normal,frozen,screenshot,transport:transport.diagnostics(),eventDelivery:'actual argv and synthetic Electron open-file events; actual original main, IPC and editor routes',directoryScope:'A CLI directory without --add becomes the active project and original workspace folder',projectBefore};
 }catch(error){result={passed:false,checks,entry,fixtureRoot,normal,frozen,folderUI:folderUI||null,error:error.stack,transport:transport?.diagnostics()};try{const visible=secondWindow&&!secondWindow.isDestroyed()?secondWindow:firstWindow;result.display=await ui(visible,'({notice:document.getElementById("proof-notice")?.textContent,transport:typeof ltStartup==="undefined"?null:ltStartup.diagnostics(),body:document.body.innerText.slice(-6000)})');}catch(diagnostic){result.diagnosticError=diagnostic.message;}}
 await finish();
}
async function finish(){
 if(finishing)return;finishing=true;
 try{
  for(const name of ['revival-preview.cjs','revival-npm.cjs','revival-node.cjs','proof-js.cjs'])await require(path.join(core,name)).shutdown();
  const js=require(path.join(core,'proof-js.cjs')),quota=js.diagnostics();delete quota.recent;
  result.cleanup={preview:require(path.join(core,'revival-preview.cjs')).activeCount(),npm:require(path.join(core,'revival-npm.cjs')).activeCount(),node:require(path.join(core,'revival-node.cjs')).activeCount(),js:js.activeCount(),...quota};
  check('All owned execution contexts, quota jobs and helper processes are released',result.cleanup.preview===0&&result.cleanup.npm===0&&result.cleanup.node===0&&result.cleanup.js===0&&result.cleanup.jobs===0&&result.cleanup.pending===0&&!result.cleanup.helperPid);
 }catch(error){result.passed=false;result.cleanupError=error.stack;}
 try{restoreProjectState();check('The prior test-projects.json state is restored with exact bytes after the proof',fs.existsSync(projectState.path)===projectState.exists&&(!projectState.exists||fs.readFileSync(projectState.path).equals(projectState.bytes)));result.projectStateRestored=true;}catch(error){result.passed=false;result.restoreError=error.stack;}
 try{check('Original test workspace cache file bytes and presence are restored without recursive deletion',restoreCache());result.cacheRestored=true;result.cache={root:cacheRoot,files:[...cacheOriginal].map(([file,bytes])=>({path:file,sha256:hash(bytes)}))};}catch(error){result.passed=false;result.cacheRestoreError=error.stack;}
 fs.writeFileSync(receipt,JSON.stringify(result,null,2));if(!result.passed){const firstFailure=path.join(policy.root,'open-targets-editor-first-failure.json');if(!fs.existsSync(firstFailure))fs.writeFileSync(firstFailure,JSON.stringify(result,null,2));}
 finished=true;clearTimeout(deadline);app.exit(result.passed?0:1);
}
const helper=require(path.join(core,'revival-open-targets.cjs')),originalCreate=helper.create;
helper.create=options=>{if(transport)throw Error('Original main unexpectedly created multiple startup transports');transport=originalCreate(options);return transport;};
try{require(path.join(core,'main.js'));}finally{helper.create=originalCreate;}
if(!transport)throw Error('Original main did not construct the startup transport');
queuedBeforeReady=!app.isReady();app.emit('open-file',{preventDefault(){queuedPrevented=true;}},queued);saveProgress('Original main seeded actual argv; OS event queued before app readiness');
