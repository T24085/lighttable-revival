'use strict';
const {captureNativePage,capturePreviewPage}=require('./native-page-capture.cjs');
process.env.LT_REVIVAL_TEST='1';
const {app}=require('electron'),fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict');
const policy=require('../../deploy/core/proof-policy.cjs'),projects=require('../../deploy/core/revival-projects.cjs'),memory=require('../../deploy/core/proof-memory.cjs'),html=require('../../deploy/core/revival-html-watches.cjs'),fixture=require('./package-fixtures.cjs');
const root=path.join(policy.root,'buffer-browser',crypto.randomUUID()),marker='BUFFER_BROWSER_START:'+path.basename(root),immutable=new Map(),virtual=[];
const crlf=source=>source.replace(/\r?\n/g,'\r\n'),hash=source=>crypto.createHash('sha256').update(source).digest('hex');
const write=(name,source)=>{const file=fixture.write(root,name,source);immutable.set(file,fs.readFileSync(file));return file;};
const buffer=(name,source,key,syntax)=>{const file=fixture.write(root,name,'// Owned temporary file used to open an original editor.\n');virtual.push({path:file,source:crlf(source),key,syntax});return file;};
const normalPaths=[path.join(__dirname,'../../deploy/core/main.js'),path.join(__dirname,'../../deploy/core/package.json'),...['bridge-test.txt','calculation.js','input-test.css','large-snapshot.txt','order-report-test.js','order-report.js'].map(name=>path.join(policy.root,'proof-files',name))];
const normalFiles=normalPaths.map(file=>({path:file,exists:fs.existsSync(file),sha256:fs.existsSync(file)?hash(fs.readFileSync(file)):null}));
const savedProjects=fs.existsSync(projects.statePath)?fs.readFileSync(projects.statePath):null;
write('package.json',{name:'light-table-buffer-browser',version:'1.0.0',private:true,browser:{unrelated:'./unused.cjs','./exact.js':'./exact-target.js','./disabled.js':false}});
write('unused.cjs','throw new Error("Unrelated browser replacement executed");');
write('orders.calc/package.json',{name:'buffer-main',main:'./report.js'});
write('orders.calc/index.js','export const record={name:"wrong saved index"};export function calculate(){return -999;}export function fail(){throw Error("Decoy index executed");}');
const nestedManifest=write('index.calc/package.json',{name:'buffer-index',browser:{'./index.mjs':'./mapped.js'}}),nestedBytes=fs.readFileSync(nestedManifest);
const exactOriginal=buffer('exact.js','globalThis.exactOriginalRan=true;throw new Error("Exact browser original executed");\n','exactOriginal');
const exactTarget=buffer('exact-target.js','export default 21;\n','exactTarget');
const report=buffer('orders.calc/report.js',[
 'globalThis.bufferReportLoads=(globalThis.bufferReportLoads||0)+1;',
 'export const record={name:"unsaved typed main"};',
 'export function calculate(n: number): number { return n * 2; }',
 'export function fail(){const label="😀";throw new Error("unsaved buffer failed");}',
 '// Original preview menu selection: bufferFailure()'
].join('\n')+'\n','report','TypeScript');
const indexOriginal=buffer('index.calc/index.mjs','globalThis.indexOriginalRan=true;throw new Error("Resolved browser original executed");\n','indexOriginal');
const indexTarget=buffer('index.calc/mapped.js','export default {calculate:()=>7};\n','indexTarget');
const disabled=buffer('disabled.js','globalThis.disabledRan=true;throw new Error("Disabled unsaved source executed");\n','disabled');
const isolatedSource=crlf('import exact from "./exact.js";\nimport indexed from "./index.calc";\nimport disabled from "./disabled.js";\nimport {calculate,fail} from "./orders.calc";\nconsole.log("BUFFER_ISOLATED:"+exact+":"+indexed.calculate()+":"+!!globalThis.disabledRan);\ncalculate(21);\n'),isolated=write('isolated.mjs',isolatedSource);
const typedImport='import("./orders.calc").then(loaded=>loaded.calculate(21)) as Promise<number>';
write('classic.js','var classicReport=require("./orders.calc");var classicExact=require("./exact.js");var classicIndexed=require("./index.calc");var classicDisabled=require("./disabled.js");globalThis.bufferClassic=classicReport.calculate(21);');
write('main.mjs',crlf([
 'import exact from "./exact.js";',
 'import indexed from "./index.calc";',
 'import disabled from "./disabled.js";',
 'import {calculate,fail,record} from "./orders.calc";',
 'globalThis.bufferFailure=fail;globalThis.bufferRecord=record;globalThis.bufferExact=exact;',
 'globalThis.bufferIndex=typeof indexed.calculate==="function"?indexed.calculate():0;',
 'globalThis.bufferLazy=()=>import("./orders.calc");',
 'document.querySelector("#report").textContent=String(calculate(21));',
 'document.querySelector("#exact").textContent=String(exact);document.querySelector("#indexed").textContent=String(bufferIndex);',
 'document.querySelector("#lazy").onclick=async()=>{const loaded=await bufferLazy();globalThis.bufferSame=loaded.record===bufferRecord&&classicReport.record===bufferRecord;document.querySelector("#lazy-result").textContent=String(loaded.calculate(21));};'
].join('\n')+'\n'));
const page=write('index.html',crlf([
 '<!doctype html><html><head><meta charset="utf-8"><title>Unsaved browser buffers</title></head><body style="font:20px system-ui;padding:24px;background:#f4f2e8;color:#24352d">',
 '<h1>Unsaved browser buffers</h1><p>Typed main: <output id="report">Ready</output></p><p>Exact remap: <output id="exact">Ready</output> · Index remap: <output id="indexed">Ready</output></p><button id="lazy">Load the same report</button><p>Lazy report: <output id="lazy-result">Ready</output></p>',
 '<script>console.log('+JSON.stringify(marker)+');</script>',
 '<script id="buffer-classic" src="./classic.js"></script>',
 '<script type="module" src="./main.mjs"></script>',
 '</body></html>'
].join('\n')+'\n'));
const closer=path.join(root,'orders.calc.js'),diskDecoy='throw new Error("Saved report decoy executed instead of its dirty buffer");\n';
projects.activate(root);
const originalAttach=memory.attach,attached=new Map(),attachments=[],quotaSamples=[];
memory.attach=async(...args)=>{const quota=await originalAttach(...args);attached.set(args[0],quota.metadata);attachments.push({pid:args[0],metadata:quota.metadata});return quota;};
app.on('web-contents-created',(_event,wc)=>wc.debugger.on('message',(_event,method,params)=>{if(method!=='Runtime.consoleAPICalled'||!params.args?.some(arg=>arg.value===marker))return;const pid=wc.getOSProcessId();quotaSamples.push({pid,metadata:attached.get(pid)||null,jobs:memory.status().jobs});}));
let seen=false;const deadline=setTimeout(()=>app.exit(2),150000);
app.on('browser-window-created',(_event,window)=>{
 if(seen)return;seen=true;window.setOpacity(0);window.setSkipTaskbar(true);window.setContentSize(900,600);window.showInactive();
 window.webContents.once('did-finish-load',()=>setTimeout(async()=>{
  const preview=require('../../deploy/core/revival-preview.cjs'),npm=require('../../deploy/core/revival-npm.cjs'),node=require('../../deploy/core/revival-node.cjs'),js=require('../../deploy/core/proof-js.cjs'),owner=window.webContents.id,checks=[],locations=[],graphs=[];
  const ui=code=>window.webContents.executeJavaScript(code),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const until=async predicate=>{const end=Date.now()+8000;while(!await predicate()){if(Date.now()>end)throw Error('Buffer browser editor condition timed out');await sleep(30);}};
  const check=(label,ok)=>{assert(ok,label);checks.push(label);console.error(label);fs.writeFileSync(path.join(policy.root,'buffer-browser-progress.json'),JSON.stringify({pid:process.pid,checks}));};
  const open=(file,key)=>ui('lt.objs.command.exec_BANG_(cljs.core.keyword("open-path"),'+JSON.stringify(file)+');var '+key+'Editor=ltProofUI.connect();var '+key+'Object=lt.objs.editor.pool.last_active();void 0;');
  const focus=key=>ui('lt.objs.tabs.active_BANG_('+key+'Object);ltProofUI.connect();'+key+'Editor.focus();void 0;');
  const menu=(labels,pending)=>ui('lt.objs.menu.main_menu();testMenuClick('+JSON.stringify(labels)+');'+(pending?pending+'.pending()':'void 0'));
  const refresh=()=>menu(['Run','Refresh preview'],'ltPreview'),start=()=>menu(['Run','Preview file'],'ltPreview'),stop=()=>menu(['Run','Stop'],'ltPreview');
  const value=async code=>JSON.parse((await preview.evaluate(owner,code)).result),widget=key=>ui(key+'Editor.getWrapperElement().querySelector(".watch-result .full")?.textContent');
  const captured=(items,file)=>items.find(item=>item.path.toLowerCase()===file.toLowerCase());
  const unexecutedNegative=(items,file)=>{const item=captured(items,file);return !item||item.snapshotRole==='metadata'&&item.exists===false&&item.source===null&&item.sha256===null;};
  const point=(source,text)=>{const offset=source.indexOf(text);assert(offset>=0,'Missing authored error');return html.originalLocation(source,offset);};
  const select=async(key,text,last=false)=>{await focus(key);await ui('var selectedAt='+key+'Editor.getValue().'+(last?'lastIndexOf':'indexOf')+'('+JSON.stringify(text)+');if(selectedAt<0)throw Error("Missing authored selection");'+key+'Editor.setSelection('+key+'Editor.posFromIndex(selectedAt),'+key+'Editor.posFromIndex(selectedAt+'+text.length+'));void 0;');};
  const watch=async(key,text,pending='ltPreview')=>{await select(key,text);return menu(['Run','Watch selection'],pending);};
  const typedSelection=async()=>{await select('isolated',typedImport,true);return menu(['Run','Evaluate selection in preview'],'ltPreview');};
  const run=async()=>{await focus('isolated');return menu(['Run','Run file'],'ltProofUI');};
  const setFactor=factor=>ui('var factorAt=reportEditor.getValue().indexOf("n * ")+4;reportEditor.replaceRange('+JSON.stringify(String(factor))+',reportEditor.posFromIndex(factorAt),reportEditor.posFromIndex(factorAt+1));void 0;');
  const lazy=async expected=>{await value('document.querySelector("#lazy").click();true');await until(async()=>await value('document.querySelector("#lazy-result").textContent')===String(expected));};
  const syntax=async(key,label)=>{
   await focus(key);await menu(['View','Commands']);
   await ui('(()=>{const input=document.querySelector("#right-bar .command.active > .selector input");if(!input)throw Error("Original command selector did not open");input.value="Editor: Set current editor syntax";input.dispatchEvent(new KeyboardEvent("keyup",{bubbles:true,key:"x"}));})()');
   await until(()=>ui('Array.from(document.querySelectorAll("#right-bar .command.active > .selector li")).some(item=>item.textContent.includes("Editor: Set current editor syntax"))'));
   await ui('Array.from(document.querySelectorAll("#right-bar .command.active > .selector li")).find(item=>item.textContent.includes("Editor: Set current editor syntax")).dispatchEvent(new MouseEvent("mousedown",{bubbles:true,cancelable:true}));void 0;');
   await until(()=>ui('!!document.querySelector("#right-bar .command.active > .options input[placeholder=Syntax]")'));
   await ui('(()=>{const input=document.querySelector("#right-bar .command.active > .options input[placeholder=Syntax]");input.value='+JSON.stringify(label)+';input.dispatchEvent(new KeyboardEvent("keyup",{bubbles:true,key:"x"}));})()');
   await until(()=>ui('Array.from(document.querySelectorAll("#right-bar .command.active > .options li")).some(item=>item.textContent.trim()==='+JSON.stringify(label)+')'));
   await ui('Array.from(document.querySelectorAll("#right-bar .command.active > .options li")).find(item=>item.textContent.trim()==='+JSON.stringify(label)+').dispatchEvent(new MouseEvent("mousedown",{bubbles:true,cancelable:true}));void 0;');
   await until(()=>ui('ltProofUI.sourceLoader('+key+'Object)==="ts"&&'+key+'Editor.getMode().name==="javascript"'));await focus(key);
  };
  const retainGraph=label=>{const state=preview.status(owner);graphs.push({label,id:state.id,rendererPid:state.rendererPid,sha256:state.project?.sha256,files:state.project?.files});return state;};
  const checkStale=async before=>{await ui('ltPreview.checkSources()');await until(()=>ui('ltPreview.state().stale'));return preview.status(owner).rendererPid===before.rendererPid&&preview.status(owner).project.sha256===before.project.sha256;};
  let result;
  try{
   await until(()=>ui('!!window.ltProofUI&&!!window.ltProofMenu&&!!window.ltPreview'));await ui(fs.readFileSync(path.join(__dirname,'menu-ui.js'),'utf8'));
   for(const item of virtual){await open(item.path,item.key);await ui(item.key+'Editor.setValue('+JSON.stringify(item.source)+');void 0;');if(item.syntax)await syntax(item.key,item.syntax);await until(()=>ui('!!cljs.core.get(cljs.core.deref('+item.key+'Object),cljs.core.keyword("dirty"))'));fs.unlinkSync(item.path);}
   check('Original dirty editors retain exact, main, index and disabled source paths after their owned disk files are deleted',virtual.every(item=>!fs.existsSync(item.path))&&await ui('['+virtual.map(item=>item.key+'Object').join(',')+'].every(obj=>!!cljs.core.get(cljs.core.deref(obj),cljs.core.keyword("dirty")))'));
   check('The real Set syntax command gives a missing JS-named editor TypeScript grammar without saving it',await ui('ltProofUI.sourceLoader(reportObject)==="ts"&&reportEditor.getValue().includes("n: number")')&&!fs.existsSync(report));
   await watch('report','n * 2','ltProofUI');await open(isolated,'isolated');const first=await run();await until(async()=>await widget('report')==='42');
   check('Original isolated Run resolves exact remap, virtual directory main and nested virtual index instead of saved decoys',first.accepted&&first.result.result==='42'&&first.result.logs.join('\n').includes('BUFFER_ISOLATED:21:7:false')&&captured(first.result.project.modules,exactTarget)&&captured(first.result.project.modules,indexTarget)&&!captured(first.result.project.modules,exactOriginal)&&!captured(first.result.project.modules,indexOriginal));
   check('Isolated typed watches preserve unsaved source, grammar and the hard quota for the virtual main',captured(first.result.project.modules,report)?.origin==='editor'&&captured(first.result.project.modules,report)?.loader==='ts'&&captured(first.result.project.modules,report)?.source===await ui('reportEditor.getValue()')&&first.result.memory.hardPrivateCommit&&first.result.memory.limitBytes===1024*1024*1024&&first.result.memory.processExited&&memory.status().jobs===0);
   const authored=await ui('reportEditor.getValue()'),isolatedPoint=point(authored,'new Error("unsaved buffer failed")');await ui('isolatedEditor.replaceRange("fail();\\n",isolatedEditor.posFromIndex(isolatedEditor.getValue().length));void 0;');const isolatedFailure=await run();locations.push(isolatedFailure.location);
   check('Isolated virtual-source errors preserve original CRLF and emoji UTF16 positions after TypeScript lowering',!isolatedFailure.accepted&&isolatedFailure.location?.path===report&&isolatedFailure.location.source===authored&&isolatedFailure.location.line===isolatedPoint.line&&isolatedFailure.location.column===isolatedPoint.column+1&&virtual.find(item=>item.path===report).source.includes('\r\n')&&memory.status().jobs===0);
   await ui('document.getElementById("proof-error-open").click();void 0;');
   check('The original isolated error link reuses the missing dirty editor at the exact authored cursor',await ui('ltProofUI.connect()===reportEditor&&reportEditor.getCursor().line==='+JSON.stringify(isolatedPoint.line-1)+'&&reportEditor.getCursor().ch==='+JSON.stringify(isolatedPoint.column)));
   await ui('isolatedEditor.setValue('+JSON.stringify(isolatedSource.replace(/\r\n/g,'\n'))+');void 0;');const recovered=await run();await until(async()=>await widget('report')==='42');
   check('Original Run recovers with the same unsaved buffers and leaves all virtual files absent',recovered.accepted&&recovered.result.result==='42'&&virtual.every(item=>!fs.existsSync(item.path))&&memory.status().jobs===0);
   await focus('isolated');await ui('isolatedEditor.replaceRange('+JSON.stringify('// Original typed preview selection: '+typedImport+'\n')+',isolatedEditor.posFromIndex(isolatedEditor.getValue().length));void 0;');await syntax('isolated','TypeScript');
   await focus('report');await menu(['Run','Clear watches']);await open(page,'page');await start();await until(async()=>await value('document.querySelector("#report")?.textContent')==='42');await lazy(42);const firstPage=retainGraph('initial virtual sources');
   check('The actual native page shares one virtual typed main across classic require, static ESM and lazy import',JSON.stringify(await value('[bufferClassic,bufferSame,bufferReportLoads,bufferExact,bufferIndex]'))===JSON.stringify([42,true,1,21,7])&&captured(firstPage.project.files,report)?.loader==='ts'&&captured(firstPage.project.files,report)?.origin==='editor');
   check('Browser snapshot identity separates a missing disk main from its executable editor source and grammar',captured(firstPage.project.files,report)?.exists===true&&captured(firstPage.project.files,report)?.resolutionSha256===null&&captured(firstPage.project.files,report)?.source===await ui('reportEditor.getValue()')&&captured(firstPage.project.files,closer)?.exists===false&&firstPage.project.files.filter(item=>item.path.toLowerCase()===report.toLowerCase()).length===1);
   check('Root and resolved-target browser replacements suppress their throwing original buffers and the false replacement',await value('!globalThis.exactOriginalRan&&!globalThis.indexOriginalRan&&!globalThis.disabledRan&&Object.keys(classicDisabled).length===0')&&captured(firstPage.project.files,exactTarget)?.origin==='editor'&&captured(firstPage.project.files,indexTarget)?.origin==='editor'&&unexecutedNegative(firstPage.project.files,disabled));
   const selected42=await typedSelection();
   check('The original typed preview selection imports the missing directory from its captured unsaved main and returns 42',selected42.result==='42'&&selected42.status==='running'&&!selected42.stale&&preview.status(owner).rendererPid===firstPage.rendererPid&&await ui('ltProofUI.sourceLoader(isolatedObject)==="ts"')&&memory.status().jobs===1&&virtual.every(item=>!fs.existsSync(item.path)));
   await watch('report','n * 2');await until(async()=>await widget('report')==='42');const watched=retainGraph('watched virtual main'),watchId=watched.watchSnapshot.specs[0].id;
   check('Original Watch selection observes the TypeScript function in a deleted unsaved imported editor',watched.watchSnapshot.specs.length===1&&await ui('reportEditor.getWrapperElement().querySelector(".watch-result").dataset.status==="current"')&&!fs.existsSync(report));
   await setFactor(3);
   check('Editing the unsaved virtual main stales its current report and watch while the old renderer stays pinned',await checkStale(watched)&&await value('document.querySelector("#report").textContent')==='42'&&await ui('reportEditor.getWrapperElement().querySelector(".watch-result").dataset.status==="stale"'));
   await refresh();await until(async()=>await widget('report')==='63');await lazy(63);const edited=retainGraph('edited virtual main');
   check('Original Refresh publishes unsaved 63 consistently to ESM, classic and lazy callers with the same watch ID',await value('document.querySelector("#report").textContent')==='63'&&await value('bufferClassic')===63&&await value('bufferSame')===true&&edited.project.sha256!==watched.project.sha256&&edited.watchSnapshot.specs[0].id===watchId&&captured(edited.project.files,report)?.source===await ui('reportEditor.getValue()')&&!fs.existsSync(report));
   const selected63=await typedSelection();
   check('A refreshed typed preview selection imports the current captured 63 buffer while preserving the running page and watch',selected63.result==='63'&&selected63.status==='running'&&!selected63.stale&&preview.status(owner).rendererPid===edited.rendererPid&&preview.status(owner).watchSnapshot.specs[0].id===watchId&&await widget('report')==='63'&&memory.status().jobs===1);
   const browserAuthored=await ui('reportEditor.getValue()'),browserPoint=point(browserAuthored,'new Error("unsaved buffer failed")');await select('report','bufferFailure()',true);await menu(['Run','Evaluate selection in preview'],'ltPreview');await until(()=>ui('ltPreview.state().errors.some(item=>item.location&&item.message.includes("unsaved buffer failed"))'));const browserError=await ui('ltPreview.state().errors.find(item=>item.location&&item.message.includes("unsaved buffer failed"))');locations.push(browserError.location);
   check('A native virtual-source runtime error retains the original missing path, source and emoji cursor',browserError.location?.path===report&&browserError.location.source===browserAuthored&&browserError.location.line===browserPoint.line&&browserError.location.column===browserPoint.column+1&&browserError.location.sourceLine.includes('😀'));
   await ui('Array.from(document.querySelectorAll(".preview-error-link")).find(link=>link.textContent==='+JSON.stringify(browserError.location.name+':'+browserPoint.line+':'+(browserPoint.column+1))+').click();void 0;');
   check('The actual preview error link selects the original unsaved typed editor at its authored position',await ui('ltProofUI.connect()===reportEditor&&reportEditor.getCursor().line==='+JSON.stringify(browserPoint.line-1)+'&&reportEditor.getCursor().ch==='+JSON.stringify(browserPoint.column)));
   await refresh();await until(async()=>await widget('report')==='63');await typedSelection();const beforeCreation=retainGraph('missing disk before creation'),editorBeforeDisk=await ui('reportEditor.getValue()');fs.writeFileSync(report,diskDecoy);
   check('Creating the missing saved main stales its negative disk identity while the dirty buffer and old rendering stay pinned',await checkStale(beforeCreation)&&await value('document.querySelector("#report").textContent')==='63'&&await ui('reportEditor.getValue()')===editorBeforeDisk&&await ui('reportEditor.getWrapperElement().querySelector(".watch-result").dataset.status==="stale"'));
   const driftedSelection=await typedSelection();
   check('Typed literal-import evaluation refuses saved disk drift until Refresh without replacing the pinned page or its quota',driftedSelection.accepted===false&&/Refresh the preview/i.test(driftedSelection.error)&&preview.status(owner).rendererPid===beforeCreation.rendererPid&&preview.status(owner).project.sha256===beforeCreation.project.sha256&&await value('document.querySelector("#report").textContent')==='63'&&memory.status().jobs===1);
   await refresh();await until(async()=>await widget('report')==='63');const diskCreated=retainGraph('created disk main');
   const selectedSavedIdentity=await typedSelection(),capturedDiskCreated=retainGraph('created disk main after typed selection');
   check('Refresh captures the new disk identity independently of unchanged unsaved source and still executes 63',diskCreated.project.sha256!==beforeCreation.project.sha256&&captured(diskCreated.project.files,report)?.sha256===captured(beforeCreation.project.files,report)?.sha256&&captured(diskCreated.project.files,report)?.resolutionSha256===hash(diskDecoy)&&captured(diskCreated.project.files,report)?.origin==='editor'&&captured(diskCreated.project.files,report)?.source===editorBeforeDisk&&await value('bufferClassic')===63&&selectedSavedIdentity.result==='63'&&selectedSavedIdentity.status==='running'&&!selectedSavedIdentity.stale);
   fs.unlinkSync(report);
   check('Deleting that saved main stales its captured disk hash without discarding the missing dirty editor or old result',await checkStale(capturedDiskCreated)&&await value('document.querySelector("#report").textContent')==='63'&&await ui('reportEditor.getValue()')===editorBeforeDisk);
   await refresh();await until(async()=>await widget('report')==='63');const diskRemoved=retainGraph('deleted disk main');
   check('Refresh returns the disk fingerprint to absent while preserving original source ownership and typed watch observations',diskRemoved.project.sha256!==diskCreated.project.sha256&&captured(diskRemoved.project.files,report)?.resolutionSha256===null&&captured(diskRemoved.project.files,report)?.sha256===captured(diskCreated.project.files,report)?.sha256&&diskRemoved.watchSnapshot.specs[0].id===watchId&&await ui('!ltPreview.state().stale'));
   fs.writeFileSync(closer,'export const record={name:"nearer saved source"};export function calculate(n){return n*4;}export function fail(){throw Error("nearer source error");}');
   check('Creating a nearer disk file invalidates the directory negative candidate while keeping the virtual main pinned',await checkStale(diskRemoved)&&await value('document.querySelector("#report").textContent')==='63');
   await refresh();await until(async()=>await widget('report')==='Not reached in this run');await lazy(84);const nearer=retainGraph('nearer saved file');
   check('Original Refresh honors the nearer saved file and clears observations from the unreached virtual main',await value('document.querySelector("#report").textContent')==='84'&&await value('bufferClassic')===84&&captured(nearer.project.files,closer)?.origin==='disk'&&await ui('!ltPreview.state().stale'));
   fs.unlinkSync(closer);
   check('Deleting the chosen saved file stales its source fingerprint while the native page retains 84',await checkStale(nearer)&&await value('document.querySelector("#report").textContent')==='84');
   await refresh();await until(async()=>await widget('report')==='63');await lazy(63);const restored=retainGraph('virtual main restored');
   check('Refresh after nearer-file deletion resolves the missing dirty TypeScript main again without saving it',await value('document.querySelector("#report").textContent')==='63'&&await value('bufferClassic')===63&&captured(restored.project.files,report)?.resolutionSha256===null&&restored.watchSnapshot.specs[0].id===watchId&&!fs.existsSync(report));
   fs.writeFileSync(nestedManifest,JSON.stringify({name:'buffer-index',browser:{'./index.mjs':false}}));
   check('Changing a resolved-target browser map to false stales its saved metadata without executing the throwing original',await checkStale(restored)&&await value('bufferIndex')===7&&await value('!globalThis.indexOriginalRan'));
   await refresh();await until(async()=>await widget('report')==='63');const suppressed=retainGraph('resolved target false');
   check('Refresh safely suppresses the missing index buffer through its resolved-target false replacement',await value('bufferIndex')===0&&await value('!globalThis.indexOriginalRan&&!globalThis.disabledRan')&&unexecutedNegative(suppressed.project.files,indexTarget)&&await value('document.querySelector("#report").textContent')==='63'&&await ui('!ltPreview.state().stale'));
   fs.writeFileSync(nestedManifest,nestedBytes);await refresh();await until(async()=>await widget('report')==='63');await lazy(63);
   check('Restoring the saved browser map recovers the original unsaved index target without losing typed watches',await value('bufferIndex')===7&&await value('bufferSame')===true&&captured(preview.status(owner).project.files,indexTarget)?.source===await ui('indexTargetEditor.getValue()')&&preview.status(owner).watchSnapshot.specs[0].id===watchId);
   await focus('report');await ui('reportEditor.refresh();void 0;');const editorImage=await captureNativePage(window.webContents);assert.deepEqual(editorImage.getSize(),{width:900,height:600});fs.writeFileSync(path.join(policy.root,'buffer-browser-original-editor.png'),editorImage.toPNG());
   check('A nonempty native capture shows the original deleted-file editor and its current unsaved 63 watch',await ui('ltProofUI.connect()===reportEditor&&reportEditor.getWrapperElement().querySelector(".watch-result").dataset.status==="current"')&&!fs.existsSync(report));
   const {image:pageImage,observations:pageCapture}=await capturePreviewPage(preview,owner);assert.deepEqual(pageImage.getSize(),{width:900,height:600});fs.writeFileSync(path.join(policy.root,'buffer-page-capture-observations.json'),JSON.stringify(pageCapture,null,2));fs.writeFileSync(path.join(policy.root,'buffer-browser-native-page.png'),pageImage.toPNG());
   check('A nonempty native page capture shows actual remapped buffers and the recovered typed report',await value('document.querySelector("#report").textContent')==='63'&&await value('document.querySelector("#exact").textContent')==='21'&&await value('document.querySelector("#indexed").textContent')==='7');
   await stop();check('Original Stop releases the preview and every authored page ran behind the verified hard 1 GiB quota',preview.activeCount()===0&&memory.status().jobs===0&&quotaSamples.length>=8&&quotaSamples.every(sample=>sample.metadata?.hardPrivateCommit&&sample.metadata.limitBytes===1024*1024*1024&&sample.jobs===1)&&attachments.every(item=>item.metadata.hardPrivateCommit&&item.metadata.limitBytes===1024*1024*1024));
   check('All six normal example identities, original app entry/manifest and immutable fixture bytes remain unchanged',normalFiles.every(item=>fs.existsSync(item.path)===item.exists&&(!item.exists||hash(fs.readFileSync(item.path))===item.sha256))&&[...immutable].every(([file,bytes])=>fs.readFileSync(file).equals(bytes))&&virtual.every(item=>!fs.existsSync(item.path))&&!fs.existsSync(closer));
   result={passed:true,checks,root,quotaSamples,attachments,locations,graphs,normalFiles};
  }catch(error){result={passed:false,checks,root,quotaSamples,attachments,locations,graphs,normalFiles,error:error.stack,snapshot:preview.status(owner)};try{result.display=await ui('({activity:document.getElementById("preview-activity").textContent,state:ltPreview.state(),output:document.getElementById("proof-output").textContent,command:document.querySelector("#right-bar .command")?.outerHTML,editors:['+virtual.map(item=>'typeof '+item.key+'Editor==="undefined"?{path:'+JSON.stringify(item.path)+',opened:false}:{path:'+JSON.stringify(item.path)+',source:'+item.key+'Editor.getValue(),cursor:'+item.key+'Editor.getCursor(),loader:ltProofUI.sourceLoader('+item.key+'Object)}').join(',')+'],widgets:Array.from(document.querySelectorAll(".watch-result")).map(item=>({status:item.dataset.status,text:item.textContent}))})');}catch(diagnostic){result.displayError=diagnostic.message;}if(result.snapshot?.status==='running')try{result.previewDOM=await value('document.documentElement.outerHTML');}catch(diagnostic){result.previewDOMError=diagnostic.message;}console.error(error);}
  try{fs.writeFileSync(nestedManifest,nestedBytes);await preview.shutdown();await npm.shutdown();await node.shutdown();await js.shutdown();}catch(error){result.passed=false;result.cleanupError=error.stack;}finally{memory.attach=originalAttach;if(savedProjects)fs.writeFileSync(projects.statePath,savedProjects);else if(fs.existsSync(projects.statePath))fs.unlinkSync(projects.statePath);}
  result.cleanup={previewActive:preview.activeCount(),npmActive:npm.activeCount(),nodeActive:node.activeCount(),jsActive:js.activeCount(),...js.diagnostics()};delete result.cleanup.recent;
  result.passed=result.passed&&result.cleanup.previewActive===0&&result.cleanup.npmActive===0&&result.cleanup.nodeActive===0&&result.cleanup.jsActive===0&&result.cleanup.jobs===0&&result.cleanup.pending===0&&!result.cleanup.helperPid;
  fs.writeFileSync(path.join(policy.root,'buffer-browser-editor-result.json'),JSON.stringify(result,null,2));clearTimeout(deadline);app.exit(result.passed?0:1);
 },250));
});
require('../../deploy/core/main.js');
