'use strict';
const {captureNativePage,capturePreviewPage}=require('./native-page-capture.cjs');
process.env.LT_REVIVAL_TEST='1';
const {app,dialog}=require('electron'),fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict');
const policy=require('../../deploy/core/proof-policy.cjs'),projects=require('../../deploy/core/revival-projects.cjs'),memory=require('../../deploy/core/proof-memory.cjs'),html=require('../../deploy/core/revival-html-watches.cjs'),fixture=require('./package-fixtures.cjs');
const root=path.join(policy.root,'directory-editor',crypto.randomUUID()),marker='DIRECTORY_PROJECT_START:'+path.basename(root),originals=new Map();
const crlf=source=>source.replace(/\r?\n/g,'\r\n');
const write=(name,source)=>{const file=fixture.write(root,name,source);originals.set(file,fs.readFileSync(file));return file;};
write('package.json',{name:'light-table-directory-editor',version:'1.0.0',private:true,browser:{unrelated:'./unused.cjs'}});
write('unused.cjs','throw new Error("Unrelated browser mapping executed");');
write('node_modules/directory-rates/package.json',{name:'directory-rates',version:'1.0.0',main:'index.cjs'});
write('node_modules/directory-rates/index.cjs','module.exports={unit:1};');
const manifest=write('orders.calc/package.json',{name:'directory-order-report',main:'./report.ts'}),manifestBytes=fs.readFileSync(manifest);
const reportSource=crlf([
 'import rates from "directory-rates";',
 'globalThis.directoryReportLoads=(globalThis.directoryReportLoads||0)+1;',
 'export const record={name:"typed-directory-main"};',
 'export function calculate(n: number): number { return n * 2 * rates.unit; }',
 'export function fail(){const label="😀";throw new Error("directory report failed");}',
 '// Original preview menu selection: directoryFailure()'
].join('\n')+'\n'),report=write('orders.calc/report.ts',reportSource);
write('orders.calc/index.js','export const record={};export function calculate(){return -999;}export function fail(){throw new Error("decoy index executed");}');
const alternate=write('orders.calc/alternate.cjs','module.exports={record:{name:"changed-directory-main"},calculate:n=>n*4,fail(){throw new Error("alternate directory failure");}};');
const isolatedSource=crlf('import {calculate,fail} from "./orders.calc";\nconsole.log("DIRECTORY_ISOLATED_REPORT");\ncalculate(21);\n'),isolated=write('report.mjs',isolatedSource);
const main=write('main.mjs',crlf([
 'import {calculate,fail,record} from "./orders.calc";',
 'globalThis.directoryCalculate=calculate;globalThis.directoryFailure=fail;globalThis.directoryRecord=record;',
 'globalThis.directoryLazy=()=>import("./orders.calc");',
 'document.querySelector("#report").textContent=String(calculate(21));',
 'document.querySelector("#lazy").onclick=async()=>{const loaded=await directoryLazy();globalThis.directorySame=loaded.record===directoryRecord&&classicReport.record===directoryRecord;document.querySelector("#lazy-result").textContent=String(loaded.calculate(21));};'
].join('\n')+'\n'));
const classic=write('classic.js','var classicReport=require("./orders.calc");globalThis.directoryClassic=classicReport.calculate(21);');
const page=write('index.html',crlf([
 '<!doctype html><html><head><meta charset="utf-8"><title>Directory package order report</title></head><body style="font:20px system-ui;padding:24px;background:#f4f2e8;color:#24352d">',
 '<h1>Directory package order report</h1><p>Report: <output id="report">Ready</output></p><button id="lazy">Load report</button><p>Lazy report: <output id="lazy-result">Ready</output></p>',
 '<script>console.log('+JSON.stringify(marker)+');</script>',
 '<script id="directory-classic" src="./classic.js"></script>',
 '<script type="module" src="./main.mjs"></script>',
 '</body></html>'
].join('\n')+'\n'));
write('new.folder/index.mjs','export function calculate(){return 90;}');
const createdMain=write('new.folder/created.cjs','module.exports={calculate:()=>99};'),createdManifest=path.join(root,'new.folder/package.json');
const creationEntry=write('creation.mjs','import {calculate} from "./new.folder";calculate();');
write('creation-preview.mjs','import {calculate} from "./new.folder";document.querySelector("output").textContent=String(calculate());');
const creationPage=write('creation.html','<!doctype html><h1>New directory manifest</h1><output>Ready</output><script>console.log('+JSON.stringify(marker)+');</script><script type="module" src="./creation-preview.mjs"></script>');
const closer=path.join(root,'orders.calc.js');
const nodeManifest=write('node.orders/package.json',{name:'native-node-order-report',main:'./report.cjs'});
const nodeReport=write('node.orders/report.cjs','const rates=require("directory-rates");module.exports=n=>n*2*rates.unit;');
write('node.orders/index.js','module.exports=()=>-999;');
const nodeEntry=write('node-report.cjs','const calculate=require("./node.orders");console.log("DIRECTORY_NATIVE_CJS");calculate(21);');
projects.activate(root);
// Answer only this fixed trusted project's normal Node consent dialog.
const originalDialog=dialog.showMessageBox;let trustRequests=0;
dialog.showMessageBox=async(window,options)=>options.title==='Run local Node project'?(trustRequests++,{response:1}):originalDialog(window,options);
const originalAttach=memory.attach,attached=new Map(),quotaSamples=[];
memory.attach=async(...args)=>{const quota=await originalAttach(...args);attached.set(args[0],quota.metadata);return quota;};
app.on('web-contents-created',(_event,wc)=>wc.debugger.on('message',(_event,method,params)=>{
 if(method!=='Runtime.consoleAPICalled'||!params.args?.some(arg=>arg.value===marker))return;
 const pid=wc.getOSProcessId();quotaSamples.push({pid,metadata:attached.get(pid)||null,jobs:memory.status().jobs});
}));
let seen=false;const deadline=setTimeout(()=>app.exit(2),150000);
app.on('browser-window-created',(_event,window)=>{
 if(seen)return;seen=true;window.setOpacity(0);window.setSkipTaskbar(true);window.setContentSize(900,600);window.showInactive();
 window.webContents.once('did-finish-load',()=>setTimeout(async()=>{
  const preview=require('../../deploy/core/revival-preview.cjs'),npm=require('../../deploy/core/revival-npm.cjs'),node=require('../../deploy/core/revival-node.cjs'),js=require('../../deploy/core/proof-js.cjs'),owner=window.webContents.id,checks=[];
  const ui=code=>window.webContents.executeJavaScript(code),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const until=async predicate=>{const end=Date.now()+8000;while(!await predicate()){if(Date.now()>end)throw Error('Directory editor condition timed out');await sleep(30);}};
  const check=(label,ok)=>{assert(ok,label);checks.push(label);console.error(label);fs.writeFileSync(path.join(policy.root,'directory-editor-progress.json'),JSON.stringify({pid:process.pid,checks}));};
  const open=(file,key)=>ui('lt.objs.command.exec_BANG_(cljs.core.keyword("open-path"),'+JSON.stringify(file)+');var '+key+'Editor=ltProofUI.connect();var '+key+'Object=lt.objs.editor.pool.last_active();void 0;');
  const focus=key=>ui('lt.objs.tabs.active_BANG_('+key+'Object);ltProofUI.connect();'+key+'Editor.focus();void 0;');
  const menu=(labels,pending)=>ui('lt.objs.menu.main_menu();testMenuClick('+JSON.stringify(labels)+');'+(pending?pending+'.pending()':'void 0'));
  const refresh=()=>menu(['Run','Refresh preview'],'ltPreview'),start=()=>menu(['Run','Preview file'],'ltPreview'),stop=()=>menu(['Run','Stop'],'ltPreview');
  const value=async code=>JSON.parse((await preview.evaluate(owner,code)).result),widget=key=>ui(key+'Editor.getWrapperElement().querySelector(".watch-result .full")?.textContent');
  const captured=(items,file)=>items.find(item=>item.path.toLowerCase()===file.toLowerCase());
  const point=(source,text)=>{const offset=source.indexOf(text);assert(offset>=0);return html.originalLocation(source,offset);};
  const watch=async(key,text,pending='ltPreview')=>{await focus(key);await ui('var selectedAt='+key+'Editor.getValue().indexOf('+JSON.stringify(text)+');if(selectedAt<0)throw Error("Missing authored watch");'+key+'Editor.setSelection('+key+'Editor.posFromIndex(selectedAt),'+key+'Editor.posFromIndex(selectedAt+'+text.length+'));void 0;');return menu(['Run','Watch selection'],pending);};
  const run=async key=>{await focus(key);return menu(['Run','Run file'],'ltProofUI');};
  const setFactor=factor=>ui('var factorAt=reportEditor.getValue().indexOf("n * ")+4;reportEditor.replaceRange('+JSON.stringify(String(factor))+',reportEditor.posFromIndex(factorAt),reportEditor.posFromIndex(factorAt+1));void 0;');
  const changedManifest=()=>fs.writeFileSync(manifest,JSON.stringify({name:'directory-order-report',main:'./alternate.cjs'}));
  const restoreManifest=()=>fs.writeFileSync(manifest,manifestBytes);
  const createManifest=()=>fs.writeFileSync(createdManifest,JSON.stringify({name:'created-directory-report',main:'./created.cjs'}));
  let result;
  try{
   await until(()=>ui('!!window.ltProofUI&&!!window.ltProofMenu&&!!window.ltPreview'));await ui(fs.readFileSync(path.join(__dirname,'menu-ui.js'),'utf8'));
   await open(report,'report');await watch('report','n * 2','ltProofUI');await open(isolated,'isolated');const first=await run('isolated');await until(async()=>await widget('report')==='42');
   check('Original isolated Run chooses a dotted directory TypeScript main and installed dependency despite an unrelated browser mapping and decoy index',first.accepted&&first.result.result==='42'&&captured(first.result.project.modules,report)?.loader==='ts'&&first.result.project.packages.some(item=>item.name==='directory-rates')&&!first.result.project.modules.some(item=>item.path.endsWith('orders.calc'+path.sep+'index.js'))&&!first.result.project.modules.some(item=>item.name==='unused.cjs'));
   check('Isolated directory resolution records its saved manifest and absent nearer file without creating executable metadata',captured(first.result.project.metadata,manifest)?.sha256&&captured(first.result.project.metadata,closer)?.exists===false&&!first.result.project.modules.some(item=>item.path===manifest)&&first.result.memory.hardPrivateCommit&&first.result.memory.limitBytes===1024*1024*1024&&first.result.memory.processExited&&memory.status().jobs===0);
   await setFactor(3);await focus('isolated');await until(()=>ui('document.getElementById("proof-output").dataset.status==="stale"'));
   check('Unsaved imported directory-main edits stale the original isolated report and watch while disk stays pinned',await ui('reportEditor.getWrapperElement().querySelector(".watch-result").dataset.status==="stale"')&&fs.readFileSync(report,'utf8')===reportSource);
   const edited=await run('isolated');await until(async()=>await widget('report')==='63');
   check('Original isolated Run uses unsaved typed directory watches with a new captured source graph',edited.accepted&&edited.result.result==='63'&&edited.result.project.sha256!==first.result.project.sha256&&captured(edited.result.project.modules,report)?.source===await ui('reportEditor.getValue()')&&captured(edited.result.project.modules,report)?.origin==='editor'&&memory.status().jobs===0);
   const authored=await ui('reportEditor.getValue()'),errorPoint=point(authored,'new Error("directory report failed")');await ui('isolatedEditor.replaceRange("fail();\\n",isolatedEditor.posFromIndex(isolatedEditor.getValue().length));void 0;');const isolatedFailure=await run('isolated');
   check('Isolated imported-directory runtime errors retain exact original CRLF and emoji UTF16 source coordinates',!isolatedFailure.accepted&&isolatedFailure.location?.path===report&&isolatedFailure.location.line===errorPoint.line&&isolatedFailure.location.column===errorPoint.column+1&&isolatedFailure.location.source===authored&&reportSource.includes('\r\n')&&memory.status().jobs===0);
   await ui('document.getElementById("proof-error-open").click();void 0;');
   check('Original isolated error navigation selects the imported typed main at its exact authored cursor',await ui('ltProofUI.connect()===reportEditor&&reportEditor.getCursor().line==='+JSON.stringify(errorPoint.line-1)+'&&reportEditor.getCursor().ch==='+JSON.stringify(errorPoint.column)));
   await ui('isolatedEditor.setValue('+JSON.stringify(isolatedSource.replace(/\r\n/g,'\n'))+');void 0;');await run('isolated');await until(async()=>await widget('report')==='63');changedManifest();await focus('isolated');await until(()=>ui('document.getElementById("proof-output").dataset.status==="stale"'));
   check('A saved directory manifest change stales the actual isolated result and original watched source',await ui('reportEditor.getWrapperElement().querySelector(".watch-result").dataset.status==="stale"')&&await ui('ltProofUI.getLast().result')==='63');
   const replaced=await run('isolated');await until(async()=>await widget('report')==='Not reached in this run');
   check('Rerunning after a saved main change executes the CJS alternate and drops old typed-main observations',replaced.accepted&&replaced.result.result==='84'&&captured(replaced.result.project.modules,alternate)&&!captured(replaced.result.project.modules,report)&&memory.status().jobs===0);
   restoreManifest();await run('isolated');await until(async()=>await widget('report')==='63');await open(creationEntry,'creation');const absent=await run('creation');
   check('A directory without a manifest runs its original index and captures the missing manifest identity',absent.accepted&&absent.result.result==='90'&&captured(absent.result.project.metadata,createdManifest)?.exists===false);
   createManifest();await until(()=>ui('document.getElementById("proof-output").dataset.status==="stale"'));
   check('Creating a previously missing package manifest stales an unchanged original isolated entry',await ui('ltProofUI.getLast().result')==='90'&&await ui('creationEditor.getValue()')===fs.readFileSync(creationEntry,'utf8'));
   const created=await run('creation');
   check('Original isolated Run recaptures a newly created manifest and chooses its CJS main instead of index',created.accepted&&created.result.result==='99'&&created.result.project.sha256!==absent.result.project.sha256&&captured(created.result.project.modules,createdMain)&&captured(created.result.project.metadata,createdManifest)?.exists===true&&memory.status().jobs===0);
   fs.unlinkSync(createdManifest);await focus('report');await menu(['Run','Clear watches']);await setFactor(2);await open(page,'page');await start();await until(async()=>await value('document.querySelector("#report")?.textContent')==='42');const browserFirst=preview.status(owner);
   await value('document.querySelector("#lazy").click();true');await until(async()=>await value('document.querySelector("#lazy-result").textContent')==='42');
   check('The actual captured page resolves ESM, lazy import and classic require to the same dotted-directory main and package instance',JSON.stringify(await value('[directoryClassic,directorySame,directoryReportLoads]'))===JSON.stringify([42,true,1])&&captured(browserFirst.project.files,report)?.loader==='ts'&&browserFirst.project.packages.some(item=>item.name==='directory-rates')&&captured(browserFirst.project.files,manifest)?.sha256&&captured(browserFirst.project.files,closer)?.exists===false);
   await watch('report','n * 2');await until(async()=>await widget('report')==='42');const browserWatched=preview.status(owner),watchId=browserWatched.watchSnapshot.specs[0].id;
   check('Original browser Watch selection captures the actual typed directory main behind module and classic callers',browserWatched.watchSnapshot.specs.length===1&&await ui('reportEditor.getWrapperElement().querySelector(".watch-result").dataset.status==="current"')&&await value('document.querySelector("#report").textContent')==='42');
   await setFactor(3);await ui('ltPreview.checkSources()');await until(()=>ui('ltPreview.state().stale'));
   check('Unsaved browser directory-main edits keep the renderer and prior graph pinned while original widgets stale',preview.status(owner).rendererPid===browserWatched.rendererPid&&preview.status(owner).project.sha256===browserWatched.project.sha256&&fs.readFileSync(report,'utf8')===reportSource&&await ui('reportEditor.getWrapperElement().querySelector(".watch-result").dataset.status==="stale"'));
   await refresh();await until(async()=>await widget('report')==='63');await value('document.querySelector("#lazy").click();true');await until(async()=>await value('document.querySelector("#lazy-result").textContent')==='63');const browserEdited=preview.status(owner);
   check('Original Refresh updates ESM, lazy and classic directory callers to unsaved 63 without changing saved files or watch IDs',await value('document.querySelector("#report").textContent')==='63'&&await value('directoryClassic')===63&&await value('directorySame')===true&&browserEdited.project.sha256!==browserWatched.project.sha256&&browserEdited.watchSnapshot.specs[0].id===watchId&&captured(browserEdited.project.files,report)?.source===await ui('reportEditor.getValue()')&&fs.readFileSync(report,'utf8')===reportSource);
   const browserAuthored=await ui('reportEditor.getValue()'),browserPoint=point(browserAuthored,'new Error("directory report failed")');await focus('report');await ui('var failureAt=reportEditor.getValue().lastIndexOf("directoryFailure()");reportEditor.setSelection(reportEditor.posFromIndex(failureAt),reportEditor.posFromIndex(failureAt+18));void 0;');await menu(['Run','Evaluate selection in preview'],'ltPreview');await until(()=>ui('ltPreview.state().errors.some(item=>item.location&&item.message.includes("directory report failed"))'));const browserError=await ui('ltPreview.state().errors.find(item=>item.location&&item.message.includes("directory report failed"))');
   check('Native directory-package errors map through lowering and classic dispatch to the exact original imported source',browserError.location?.path===report&&browserError.location.line===browserPoint.line&&browserError.location.column===browserPoint.column+1&&browserError.location.source===browserAuthored&&browserError.location.sourceLine.includes('😀'));
   await ui('Array.from(document.querySelectorAll(".preview-error-link")).find(link=>link.textContent==='+JSON.stringify(browserError.location.name+':'+browserPoint.line+':'+(browserPoint.column+1))+').click();void 0;');
   check('The actual preview error link opens the original typed package main at its exact authored cursor',await ui('ltProofUI.connect()===reportEditor&&reportEditor.getCursor().line==='+JSON.stringify(browserPoint.line-1)+'&&reportEditor.getCursor().ch==='+JSON.stringify(browserPoint.column)));
   await refresh();await until(async()=>await widget('report')==='63');await focus('report');await ui('reportEditor.refresh();void 0;');const editorImage=await captureNativePage(window.webContents);assert.deepEqual(editorImage.getSize(),{width:900,height:600});fs.writeFileSync(path.join(policy.root,'directory-original-editor.png'),editorImage.toPNG());
   const {image:pageImage,observations:pageCapture}=await capturePreviewPage(preview,owner);assert.deepEqual(pageImage.getSize(),{width:900,height:600});fs.writeFileSync(path.join(policy.root,'directory-page-capture-observations.json'),JSON.stringify(pageCapture,null,2));fs.writeFileSync(path.join(policy.root,'directory-native-page.png'),pageImage.toPNG());preview.bounds(owner,{x:0,y:0,width:1,height:1,visible:false});
   check('Original directory watch 63 and the actual native page have separate 900 by 600 screenshots',true);
   const beforeMetadata=preview.status(owner);changedManifest();await ui('ltPreview.checkSources()');await until(()=>ui('ltPreview.state().stale'));
   check('A saved directory main change stales the native page and original watch without replacing the pinned renderer',preview.status(owner).rendererPid===beforeMetadata.rendererPid&&preview.status(owner).project.sha256===beforeMetadata.project.sha256&&await ui('reportEditor.getWrapperElement().querySelector(".watch-result").dataset.status==="stale"'));
   await refresh();await until(async()=>await widget('report')==='Not reached in this run');
   check('Native Refresh honors the changed CJS main and clears observations from its unreached typed predecessor',await value('document.querySelector("#report").textContent')==='84'&&await value('directoryClassic')===84&&captured(preview.status(owner).project.files,alternate)&&await ui('!ltPreview.state().stale'));
   restoreManifest();await refresh();await until(async()=>await widget('report')==='63');const beforeInvalid=quotaSamples.length;fs.writeFileSync(manifest,'{"main":');await refresh();await until(()=>ui('ltPreview.state()?.status==="stopped"&&ltPreview.state().errors.length>0'));
   check('Invalid saved directory metadata fails before any authored browser code starts and releases the previous quota',quotaSamples.length===beforeInvalid&&preview.activeCount()===0&&memory.status().jobs===0&&await ui('ltPreview.state().errors.some(item=>/package|metadata|JSON/i.test(item.message))'));
   restoreManifest();await refresh();await until(async()=>await widget('report')==='63');
   check('Repairing directory metadata recovers the original unsaved typed watches and native report',await value('document.querySelector("#report").textContent')==='63'&&preview.status(owner).watchSnapshot.specs[0].id===watchId&&await ui('!ltPreview.state().stale'));
   const beforeCloser=preview.status(owner);fixture.write(root,'orders.calc.js','export const record={name:"nearer-file"};export function calculate(n){return n*5;}export function fail(){throw new Error("nearer failure");}');await ui('ltPreview.checkSources()');await until(()=>ui('ltPreview.state().stale'));
   check('Creating a nearer file beside the dotted folder invalidates its captured negative resolution identity',preview.status(owner).rendererPid===beforeCloser.rendererPid&&preview.status(owner).project.sha256===beforeCloser.project.sha256&&await ui('reportEditor.getWrapperElement().querySelector(".watch-result").dataset.status==="stale"'));
   await refresh();await until(async()=>await widget('report')==='Not reached in this run');
   check('Original Refresh executes the nearer file and drops old directory-main watch observations',await value('document.querySelector("#report").textContent')==='105'&&await value('directoryClassic')===105&&captured(preview.status(owner).project.files,closer)?.exists===true&&await ui('!ltPreview.state().stale'));
   await stop();check('Original Stop releases the compiled directory preview and all browser execution jobs',preview.activeCount()===0&&memory.status().jobs===0);
   const closerIsolated=await run('isolated');await until(async()=>await widget('report')==='Not reached in this run');
   check('Isolated Run likewise resolves the newly nearer file rather than a watched old folder main',closerIsolated.accepted&&closerIsolated.result.result==='105'&&captured(closerIsolated.result.project.modules,closer)&&!captured(closerIsolated.result.project.modules,report)&&memory.status().jobs===0);
   await focus('report');await menu(['Run','Clear watches']);await open(creationPage,'creationPage');await start();await until(async()=>await value('document.querySelector("output").textContent')==='90');const browserAbsent=preview.status(owner);
   check('A real captured page pins a missing local manifest alongside its index result',captured(browserAbsent.project.files,createdManifest)?.exists===false);
   createManifest();await ui('ltPreview.checkSources()');await until(()=>ui('ltPreview.state().stale'));
   check('Creating the missing directory manifest stales the native page while retaining its original index rendering',preview.status(owner).rendererPid===browserAbsent.rendererPid&&await value('document.querySelector("output").textContent')==='90');
   await refresh();await until(async()=>await value('document.querySelector("output").textContent')==='99');
   check('Native Refresh recaptures newly created metadata and replaces index with the declared CJS main',preview.status(owner).project.sha256!==browserAbsent.project.sha256&&captured(preview.status(owner).project.files,createdManifest)?.exists===true&&captured(preview.status(owner).project.files,createdMain));
   await stop();check('Every authored directory page starts after the hard 1 GiB quota and Stop releases its jobs',preview.activeCount()===0&&memory.status().jobs===0&&quotaSamples.length>=10&&quotaSamples.every(sample=>sample.metadata?.hardPrivateCommit&&sample.metadata.limitBytes===1024*1024*1024&&sample.jobs===1));
   await open(nodeEntry,'node');await watch('node','calculate(21)','ltProofUI');const native=await menu(['Run','Run file with Node'],'ltProofUI');await until(async()=>await widget('node')==='42');
   check('Original native Node CJS retains its own directory main behavior and captures the saved manifest under the hard quota',native.accepted&&native.result.result==='42'&&native.result.logs.join('\n').includes('DIRECTORY_NATIVE_CJS')&&captured(native.result.project.modules,nodeReport)&&captured(native.result.project.metadata,nodeManifest)?.sha256&&native.result.memory.hardPrivateCommit&&native.result.memory.limitBytes===1024*1024*1024&&native.result.memory.contextFilesRemoved&&memory.status().jobs===0);
   check('Original source, decoy and installed-package bytes remain unchanged despite unsaved edits and intentional resolution changes',trustRequests===1&&[...originals].every(([file,bytes])=>fs.readFileSync(file).equals(bytes))&&fs.existsSync(closer)&&fs.existsSync(createdManifest));
   result={passed:true,checks,root,quotaSamples,trustRequests};
  }catch(error){result={passed:false,checks,root,quotaSamples,trustRequests,error:error.stack,snapshot:preview.status(owner)};try{result.display=await ui('({activity:document.getElementById("preview-activity").textContent,state:ltPreview.state(),output:document.getElementById("proof-output").textContent,widgets:Array.from(document.querySelectorAll(".watch-result")).map(item=>({status:item.dataset.status,text:item.textContent}))})');}catch(_){}if(result.snapshot?.status==='running')try{result.previewDOM=await value('document.documentElement.outerHTML');}catch(diagnostic){result.previewDOMError=diagnostic.message;}console.error(error);}
  restoreManifest();dialog.showMessageBox=originalDialog;await preview.shutdown();await npm.shutdown();await node.shutdown();await js.shutdown();memory.attach=originalAttach;
  result.cleanup={previewActive:preview.activeCount(),npmActive:npm.activeCount(),nodeActive:node.activeCount(),jsActive:js.activeCount(),...js.diagnostics()};delete result.cleanup.recent;
  result.passed=result.passed&&result.cleanup.previewActive===0&&result.cleanup.npmActive===0&&result.cleanup.nodeActive===0&&result.cleanup.jsActive===0&&result.cleanup.jobs===0&&result.cleanup.pending===0&&!result.cleanup.helperPid;
  fs.writeFileSync(path.join(policy.root,'directory-editor-result.json'),JSON.stringify(result,null,2));clearTimeout(deadline);app.exit(result.passed?0:1);
 },250));
});
require('../../deploy/core/main.js');
