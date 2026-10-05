'use strict';
const {captureNativePage,capturePreviewPage}=require('./native-page-capture.cjs');
process.env.LT_REVIVAL_TEST='1';
const {app}=require('electron'),fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict');
const policy=require('../../deploy/core/proof-policy.cjs'),projects=require('../../deploy/core/revival-projects.cjs'),memory=require('../../deploy/core/proof-memory.cjs'),html=require('../../deploy/core/revival-html-watches.cjs'),fixture=require('./package-fixtures.cjs');
const root=path.join(policy.root,'classic-package-editor',crypto.randomUUID()),marker='CLASSIC_START:'+path.basename(root),entry=path.join(root,'index.html');
fixture.fixture(root);projects.activate(root);
const write=(name,source)=>fixture.write(root,name,source);
fixture.install(root,'classic-cjs',{exports:{'.':'./index.cjs','./same':'./index.cjs'}},{'index.cjs':'globalThis.cjsLoads=(globalThis.cjsLoads||0)+1;globalThis.packageEvents=(globalThis.packageEvents||[]);packageEvents.push(["cjs",document.currentScript?.id??null]);module.exports={value:42,state:{calls:0},next(){return ++this.state.calls;}};'});
fixture.install(root,'classic-replace',{}, {'index.cjs':'globalThis.replacementLoads=(globalThis.replacementLoads||0)+1;module.exports={generation:1,replace(){module.exports={generation:2,schedule(){setTimeout(()=>{module.exports={generation:3};},20);}};}};'});
fixture.install(root,'classic-esm',{type:'module',exports:{'.':'./index.mjs','./same':'./index.mjs'}},{'index.mjs':'globalThis.esmLoads=(globalThis.esmLoads||0)+1;globalThis.packageEvents=(globalThis.packageEvents||[]);packageEvents.push(["esm",document.currentScript?.id??null]);\nexport let count=0;export const state={calls:0};export function next(){state.calls++;return ++count;}'});
const lazySource='import {state} from "classic-esm";\nglobalThis.lazyLoads=(globalThis.lazyLoads||0)+1;export {state};export const value=42;\nexport function fail(){throw new Error("classic lazy failed");}',lazyDir=fixture.install(root,'classic-lazy',{type:'module',exports:'./index.mjs'},{'index.mjs':lazySource});
const source=factor=>[
 '<!doctype html>','<html><head><meta charset="utf-8"><title>Native classic package report 🦉</title>',
 '<script id="classic-first">',
 'console.log('+JSON.stringify(marker)+');globalThis.nativeOrder=["blocking-first"];',
 'var nativeGlobal=21;let nativeLexical=20;',
 'function nativeDouble(n){return n * '+factor+';}',
 'globalThis.classicTopThis=this===globalThis;globalThis.firstCurrent=document.currentScript.id;',
 'var requireCjs=require("classic-cjs");var requireEsm=require("classic-esm");var requireAlias=require("classic-esm/same");var requireCondition=require("dual");var firstReplace=require("classic-replace");',
 'function readReplace(){return require("classic-replace");}function replaceClassic(){firstReplace.replace();return require("classic-replace");}',
 'globalThis.firstCount=requireEsm.next();globalThis.localShadow=(function(require){return require("not-installed-local");})(name=>"local:"+name);',
 'globalThis.loadLazy=function(){return import("classic-lazy");};',
 'globalThis.inlineFailure=function(){require("classic-esm");throw new Error("classic inline failed");};',
 '</script>',
 '<script id="classic-strict">"use strict";globalThis.strictTopThis=this===globalThis;globalThis.strictFunctionThis=(function(){return this;})();globalThis.strictCurrent=document.currentScript.id;</script>',
 '<script id="classic-defer" defer src="./defer.js"></script>',
 '<script id="classic-async" async src="./async.js"></script>',
 '<script id="module-entry" type="module" src="./module.mjs"></script>',
 '</head><body><h1>Native classic package report</h1><output id="answer">Ready</output>',
 '<script id="classic-last">nativeOrder.push("blocking-last");globalThis.lastCurrent=document.currentScript.id;globalThis.lastNative=nativeGlobal+nativeLexical;globalThis.secondCjs=require("classic-cjs/same");document.querySelector("output").textContent=String(nativeDouble(nativeGlobal));</script>',
 '</body></html>'
].join('\n');
write('index.html',source(2).replace(/\n/g,'\r\n'));
const deferredSource='nativeOrder.push("defer");globalThis.deferCurrent=document.currentScript.id;globalThis.deferThis=this===globalThis;globalThis.deferLexical=nativeLexical;globalThis.deferShared=require("classic-cjs");\r\nfunction externalFailure(){require("classic-esm");throw new Error("classic external failed");}',deferred=write('defer.js',deferredSource);
write('async.js','nativeOrder.push("async");globalThis.asyncCurrent=document.currentScript.id;globalThis.asyncThis=this===globalThis;globalThis.asyncShared=require("classic-cjs");');
write('module.mjs','import {count,state,next} from "classic-esm";import cjs from "classic-cjs";import replacement from "classic-replace";import dual from "dual";nativeOrder.push("module");globalThis.moduleCurrent=document.currentScript;globalThis.moduleThis=this;globalThis.moduleNative=nativeGlobal+nativeLexical;globalThis.moduleState=state;globalThis.moduleCjs=cjs;globalThis.moduleReplace=replacement;globalThis.moduleCount=next();globalThis.readModuleCount=()=>count;globalThis.moduleNext=next;globalThis.importCondition=dual;');
write('shadow-module.mjs','import value from "leaf";globalThis.shadowModule=value-5;');
write('repeated.js','var repeatedValue=require("classic-cjs");globalThis.repeatedValues=globalThis.repeatedValues||[];repeatedValues.push(typeof repeatedValue==="string"?repeatedValue:repeatedValue.value);globalThis.repeatedCurrents=globalThis.repeatedCurrents||[];repeatedCurrents.push(document.currentScript.id);');
const globalShadow=write('global-shadow.html','<!doctype html><script>console.log('+JSON.stringify(marker)+');globalThis.beforeCustom=require("classic-cjs").value;</script><script id="repeat-before" src="./repeated.js"></script><script>function require(name){return "custom:"+name;}</script><script>globalThis.globalShadow=require("not-installed-global");</script><script id="repeat-after" src="./repeated.js"></script><script type="module" src="./shadow-module.mjs"></script>');
const lexicalShadow=write('lexical-shadow.html','<!doctype html><script>console.log('+JSON.stringify(marker)+');globalThis.beforeLexical=typeof require;</script><script>let require=name=>"lexical:"+name;globalThis.lexicalShadow=require("not-installed-lexical");globalThis.loadShadow=function(){return import("leaf");};</script>');
write('nested-writer.mjs','globalThis.require=name=>"nested:"+name;');write('writer-entry.mjs','import "./nested-writer.mjs";');
const transitiveModule=write('transitive-module.html','<script>console.log('+JSON.stringify(marker)+');function callNested(){return require("not-installed-nested");}</script><script type="module" src="./writer-entry.mjs"></script>');
fixture.install(root,'classic-writer',{}, {'index.cjs':'globalThis.require=name=>"writer:"+name;module.exports=42;'});
const transitiveClassic=write('transitive-classic.html','<script>console.log('+JSON.stringify(marker)+');require("classic-writer");globalThis.customWritten=require("not-installed-written");</script>');
const invalidSource='const unicodeMarker="😀";\u2028const invalid = ;',invalidFile=write('invalid-unicode.js',invalidSource),invalidPage=write('invalid-unicode.html','<script>console.log('+JSON.stringify(marker)+');</script><script src="./invalid-unicode.js"></script>');
const hanging=write('hanging-classic.html','<!doctype html><script>console.log('+JSON.stringify(marker)+');require("hang");globalThis.afterHang=true;</script>');
// Observe real quota attachment and the first authored console event. This is
// test instrumentation only; every attach still invokes the production helper.
const attached=new Map(),quotaSamples=[],originalAttach=memory.attach;
memory.attach=async(...args)=>{const quota=await originalAttach(...args);attached.set(args[0],quota.metadata);return quota;};
app.on('web-contents-created',(_event,wc)=>wc.debugger.on('message',(_event,method,params)=>{
 if(method!=='Runtime.consoleAPICalled'||!params.args?.some(arg=>arg.value===marker))return;
 const pid=wc.getOSProcessId();quotaSamples.push({pid,metadata:attached.get(pid)||null,jobs:memory.status().jobs});
}));
let seen=false;const deadline=setTimeout(()=>app.exit(2),90000);
app.on('browser-window-created',(_event,window)=>{
 if(seen)return;seen=true;window.setOpacity(0);window.setSkipTaskbar(true);window.showInactive();
 window.webContents.once('did-finish-load',()=>setTimeout(async()=>{
  const preview=require('../../deploy/core/revival-preview.cjs'),npm=require('../../deploy/core/revival-npm.cjs'),node=require('../../deploy/core/revival-node.cjs'),js=require('../../deploy/core/proof-js.cjs'),owner=window.webContents.id,checks=[];
  const ui=code=>window.webContents.executeJavaScript(code),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const until=async predicate=>{const end=Date.now()+8000;while(!await predicate()){if(Date.now()>end)throw Error('Classic package editor condition timed out');await sleep(30);}};
  const evaluate=code=>preview.evaluate(owner,code),value=async code=>JSON.parse((await evaluate(code)).result);
  const check=(label,ok)=>{assert(ok,label);checks.push(label);console.error(label);fs.writeFileSync(path.join(policy.root,'classic-package-progress.json'),JSON.stringify({pid:process.pid,checks}));};
  const widget=()=>ui('classicEditor.getWrapperElement().querySelector(".watch-result .full")?.textContent');
  let result;
  try{
   await until(()=>ui('!!window.ltProofUI&&!!window.ltProofMenu&&!!window.ltPreview'));
   await ui(fs.readFileSync(path.join(__dirname,'menu-ui.js'),'utf8'));
   await ui('lt.objs.command.exec_BANG_(cljs.core.keyword("open-path"),'+JSON.stringify(entry)+');var classicEditor=ltProofUI.connect();var classicObject=lt.objs.editor.pool.last_active();lt.objs.menu.main_menu();void 0;');
   check('Original HTML editors expose native Preview file and Watch selection menu commands',await ui('testMenuItem("Preview file").enabled&&testMenuItem("Watch selection").enabled'));
   await ui('testMenuClick("Preview file");ltPreview.pending()');
   check('Original Preview file renders installed packages inside actual native classic scripts',await value('document.querySelector("output").textContent')==='42'&&await value('document.querySelector("#classic-first").type')===''&&preview.status(owner).project.packages.some(item=>item.name==='classic-esm'));
   const initial=preview.status(owner),firstQuota=quotaSamples.at(-1);
   check('The first authored classic script executes only after its separate hard quota is verified',firstQuota?.pid===initial.rendererPid&&firstQuota.metadata?.hardPrivateCommit&&firstQuota.metadata.limitBytes===1024*1024*1024&&firstQuota.jobs===1&&initial.rendererPid!==window.webContents.getOSProcessId()&&npm.activeCount()===0);
   assert.deepEqual(await value('[nativeGlobal,nativeLexical,typeof nativeDouble,Object.hasOwn(globalThis,"nativeGlobal"),Object.hasOwn(globalThis,"nativeLexical"),classicTopThis,strictTopThis,strictFunctionThis===undefined,lastNative,moduleNative,moduleThis===undefined,moduleCurrent===null]'),[21,20,'function',true,false,true,true,true,41,41,true,true]);
   check('Native var, function and lexical declarations, strict this and module access retain browser semantics',true);
   assert.deepEqual(await value('[firstCurrent,strictCurrent,lastCurrent,deferCurrent,asyncCurrent,deferThis,asyncThis,deferLexical]'),['classic-first','classic-strict','classic-last','classic-defer','classic-async',true,true,20]);
   const order=await value('nativeOrder');assert.equal(order[0],'blocking-first');assert(order.indexOf('blocking-last')<order.indexOf('defer'));assert(order.indexOf('blocking-last')<order.indexOf('module'));for(const name of ['blocking-first','blocking-last','defer','async','module'])assert.equal(order.filter(item=>item===name).length,1);
   check('Blocking, defer, async and module scripts preserve native order and document.currentScript',true);
   assert.deepEqual(await value('[cjsLoads,esmLoads,requireCjs===secondCjs,requireCjs===deferShared,requireCjs===asyncShared,requireCjs===moduleCjs,requireEsm===requireAlias,requireEsm.state===moduleState,firstCount,moduleCount,requireEsm.count,readModuleCount(),importCondition,requireCondition,localShadow]'),[1,1,true,true,true,true,true,true,1,2,2,2,42,43,'local:not-installed-local']);
   assert.deepEqual(await value('packageEvents'),[['cjs','classic-first'],['esm','classic-first']]);
   check('Classic requires and actual ESM entries share canonical CJS objects, ESM instances and live exports',true);
   assert.deepEqual(await value('[firstReplace===moduleReplace,readReplace()===firstReplace,firstReplace.generation]'),[true,true,1]);
   assert.deepEqual(await value('(()=>{const current=replaceClassic();return [current===readReplace(),current===firstReplace,current.generation,moduleReplace===firstReplace,moduleReplace.generation,replacementLoads]})()'),[true,false,2,true,1,1]);
   check('Classic require reads replaced CJS module.exports while the already imported ESM default retains its original export object',true);
   await evaluate('readReplace().schedule();undefined');await until(async()=>await value('readReplace().generation===3'));
   assert.deepEqual(await value('[readReplace().generation,moduleReplace.generation,firstReplace.generation,replacementLoads]'),[3,1,1,1]);
   check('A timer replacing CJS exports updates later native classic require calls without rerunning the package',true);
   assert.deepEqual(await value('[moduleNext(),requireEsm.count,requireEsm.next(),readModuleCount()]'),[3,3,4,4]);
   check('Live ESM bindings update across native module callbacks and memoized classic require namespaces',true);
   check('Classic package dynamic imports remain unevaluated until their authored function is called',await value('typeof lazyLoads')==='undefined');
   assert.deepEqual(await value('Promise.all([loadLazy(),loadLazy()]).then(([first,second])=>[first===second,first.state===moduleState,first.value,lazyLoads])'),[true,true,42,1]);
   check('Lazy native imports preserve cached namespace identity and the shared ESM package state',true);
   await ui('lt.objs.tabs.active_BANG_(classicObject);ltProofUI.connect();var classicAt=classicEditor.getValue().indexOf("n * 2");classicEditor.setSelection(classicEditor.posFromIndex(classicAt),classicEditor.posFromIndex(classicAt+5));lt.objs.menu.main_menu();testMenuClick("Watch selection");ltPreview.pending()');
   await until(async()=>await widget()==='42');
   const watched=preview.status(owner);
   check('Original inline HTML watches run beside native classic package source without changing the active editor',await ui('ltProofUI.connect()===classicEditor&&lt.objs.tabs.active_tab()===classicObject')&&watched.watchSnapshot.specs[0].path===entry&&watched.project.files.find(item=>item.path===entry).source===await ui('classicEditor.getValue()'));
   await evaluate('nativeDouble(22)');await until(async()=>await widget()==='44');
   check('Actual page callbacks update the original native classic inline watch',await widget()==='44');
   await ui('classicEditor.replaceRange("3",classicEditor.posFromIndex(classicAt+4),classicEditor.posFromIndex(classicAt+5));void 0;');await until(()=>ui('ltPreview.state().stale'));
   check('Unsaved classic source edits mark the original widget stale while retaining its running renderer',preview.status(owner).rendererPid===watched.rendererPid&&fs.readFileSync(entry,'utf8').replace(/\r\n/g,'\n')===source(2)&&await ui('classicEditor.getWrapperElement().querySelector(".watch-result").dataset.status==="stale"'));
   await evaluate('nativeDouble(30)');check('Old classic callbacks cannot publish current values for an edited source version',await ui('ltPreview.state().stale&&classicEditor.getWrapperElement().querySelector(".watch-result").dataset.status==="stale"'));
   await ui('ltPreview.refresh();ltPreview.pending()');await until(async()=>await widget()==='63');
   check('Original Refresh executes unsaved classic buffers and preserves package identity without saving',await value('document.querySelector("output").textContent')==='63'&&fs.readFileSync(entry,'utf8').replace(/\r\n/g,'\n')===source(2)&&preview.status(owner).project.files.find(item=>item.path===entry).origin==='editor'&&preview.status(owner).watchSnapshot.specs[0].id===watched.watchSnapshot.specs[0].id&&await value('requireCjs===moduleCjs&&requireEsm.state===moduleState')===true);
   const unsaved=await ui('classicEditor.getValue()'),inlinePoint=html.originalLocation(unsaved,unsaved.indexOf('new Error("classic inline failed")'));
   await assert.rejects(evaluate('inlineFailure()'),error=>error.location?.path===entry&&error.location.line===inlinePoint.line&&error.location.column===inlinePoint.column+1&&error.location.source===unsaved);
   check('Actual classic inline exceptions restore original HTML line and column after require-token rewriting',true);
   await until(()=>ui('!!document.querySelector(".preview-error-link")'));await ui('document.querySelector(".preview-error-link").click();void 0;');
   check('Native classic error links open the original HTML editor at the failing source line',await ui('ltProofUI.connect()===classicEditor&&classicEditor.getCursor().line==='+JSON.stringify(inlinePoint.line-1)));
   const externalPoint=html.originalLocation(deferredSource,deferredSource.indexOf('new Error("classic external failed")'));
   await assert.rejects(evaluate('externalFailure()'),error=>error.location?.path===deferred&&error.location.line===externalPoint.line&&error.location.column===externalPoint.column+1&&error.location.source===deferredSource);
   check('External deferred classic exceptions retain original CRLF source coordinates past rewritten calls',true);
   await until(()=>ui('Array.from(document.querySelectorAll(".preview-error-link")).at(-1)?.textContent.includes("defer.js:")'));await ui('Array.from(document.querySelectorAll(".preview-error-link")).at(-1).click();void 0;');
   check('External classic error links open their authored file and exact failing line',await ui('ltProofUI.connect().getCursor().line==='+JSON.stringify(externalPoint.line-1)+'&&ltProofUI.connect().getValue().includes("classic external failed")'));
   await assert.rejects(evaluate('loadLazy().then(module=>module.fail())'),error=>error.location?.path===path.join(lazyDir,'index.mjs')&&error.location.line===3&&error.location.source===lazySource);
   check('Lazy package errors retain the installed original ESM file and failing line',true);
   await ui('lt.objs.tabs.active_BANG_(classicObject);ltProofUI.connect();lt.objs.command.exec_BANG_(cljs.core.keyword("save"));ltPreview.open('+JSON.stringify(entry)+',false);ltPreview.pending()');await until(async()=>await widget()==='63');
   check('Original Save and Refresh retain current classic widgets and normalized authored source',fs.readFileSync(entry,'utf8').replace(/\r\n/g,'\n')===await ui('classicEditor.getValue()')&&await ui('classicEditor.getWrapperElement().querySelector(".watch-result").dataset.status==="current"'));
   await ui('classicEditor.refresh();void 0;');await sleep(100);
   fs.writeFileSync(path.join(policy.root,'classic-package-original-editor.png'),(await captureNativePage(window.webContents)).toPNG());fs.writeFileSync(path.join(policy.root,'classic-package-native-page.png'),(await capturePreviewPage(preview,owner)).image.toPNG());preview.bounds(owner,{x:0,y:0,width:1,height:1,visible:false});
   const dependency=path.join(root,'node_modules','classic-cjs','index.cjs'),dependencyDisk=fs.readFileSync(dependency,'utf8');
   await ui('lt.objs.command.exec_BANG_(cljs.core.keyword("open-path"),'+JSON.stringify(dependency)+');var dependencyEditor=ltProofUI.connect();var dependencyObject=lt.objs.editor.pool.last_active();var dependencyAt=dependencyEditor.getValue().indexOf("value:42")+6;dependencyEditor.setSelection(dependencyEditor.posFromIndex(dependencyAt),dependencyEditor.posFromIndex(dependencyAt+2));lt.objs.menu.main_menu();testMenuClick("Watch selection");ltPreview.pending()');
   const dependencyWidget=()=>ui('dependencyEditor.getWrapperElement().querySelector(".watch-result .full")?.textContent');await until(async()=>await dependencyWidget()==='42');
   check('Original watches inside an installed CJS dependency observe its actual lazy classic initialization',await ui('ltProofUI.connect()===dependencyEditor')&&await value('requireCjs===moduleCjs&&cjsLoads===1')===true);
   const dependencyRun=preview.status(owner);await ui('dependencyEditor.replaceRange("63",dependencyEditor.posFromIndex(dependencyAt),dependencyEditor.posFromIndex(dependencyAt+2));void 0;');await until(()=>ui('ltPreview.state().stale'));
   check('Unsaved installed-package edits invalidate native classic values without changing disk or renderer',fs.readFileSync(dependency,'utf8')===dependencyDisk&&preview.status(owner).rendererPid===dependencyRun.rendererPid&&await ui('dependencyEditor.getWrapperElement().querySelector(".watch-result").dataset.status==="stale"'));
   await ui('ltPreview.open('+JSON.stringify(entry)+',false);ltPreview.pending()');await until(async()=>await dependencyWidget()==='63');
   check('Unsaved dependency Refresh preserves package watch IDs and shared native classic/ESM exports',(await value('[requireCjs.value,moduleCjs.value,requireCjs===moduleCjs]')).join(',')==='63,63,true'&&fs.readFileSync(dependency,'utf8')===dependencyDisk&&preview.status(owner).watchSnapshot.specs.some(spec=>spec.path===dependency&&dependencyRun.watchSnapshot.specs.some(old=>old.id===spec.id)));
   await ui('lt.objs.command.exec_BANG_(cljs.core.keyword("save"));ltPreview.open('+JSON.stringify(entry)+',false);ltPreview.pending()');await until(async()=>await dependencyWidget()==='63');
   check('Original package Save retains its native watch and exact current captured source',fs.readFileSync(dependency,'utf8').replace(/\r\n/g,'\n')===await ui('dependencyEditor.getValue()')&&preview.status(owner).project.files.find(file=>file.path===dependency).source===await ui('dependencyEditor.getValue()'));
   await ui('lt.objs.command.exec_BANG_(cljs.core.keyword("open-path"),'+JSON.stringify(globalShadow)+');ltProofUI.connect();testMenuClick("Preview file");ltPreview.pending()');
   assert.deepEqual(await value('[beforeCustom,globalShadow,shadowModule]'),[63,'custom:not-installed-global',42]);
   check('A preceding classic global function replaces fallback require and prevents speculative package resolution',true);
   assert.deepEqual(await value('[repeatedValues,repeatedCurrents,cjsLoads]'),[[63,'custom:classic-cjs'],['repeat-before','repeat-after'],1]);
   check('Repeated native external script resources dispatch the current require binding before and after a global function replacement',true);
   await ui('lt.objs.command.exec_BANG_(cljs.core.keyword("open-path"),'+JSON.stringify(lexicalShadow)+');ltProofUI.connect();testMenuClick("Preview file");ltPreview.pending()');
   assert.deepEqual(await value('[beforeLexical,lexicalShadow,typeof require]'),['undefined','lexical:not-installed-lexical','function']);assert.equal(await value('loadShadow().then(module=>module.default)'),47);
   check('Import-only bootstrap leaves require absent until a native global lexical declaration shadows it',true);
   await ui('lt.objs.command.exec_BANG_(cljs.core.keyword("open-path"),'+JSON.stringify(transitiveModule)+');ltProofUI.connect();testMenuClick("Preview file");ltPreview.pending()');
   check('A transitive native ESM writer supplies custom require to an earlier classic callback',await value('callNested()')==='nested:not-installed-nested');
   await ui('lt.objs.command.exec_BANG_(cljs.core.keyword("open-path"),'+JSON.stringify(transitiveClassic)+');ltProofUI.connect();testMenuClick("Preview file");ltPreview.pending()');
   check('An initialized CJS dependency can replace global require before a later native classic call',await value('customWritten')==='writer:not-installed-written');
   await ui('lt.objs.command.exec_BANG_(cljs.core.keyword("open-path"),'+JSON.stringify(invalidPage)+');ltProofUI.connect();testMenuClick("Preview file");ltPreview.pending()');
   const invalidLocation=preview.status(owner).errors.find(error=>error.location?.path===invalidFile)?.location;
   check('Native syntax failures after a Unicode separator map to the original single editor line',invalidLocation?.line===1&&invalidLocation.column===invalidSource.lastIndexOf(';')+1&&invalidLocation.source===invalidSource);
   await ui('document.querySelector(".preview-error-link").click();void 0;');
   check('Unicode syntax error links select the original physical editor line and authored source',await ui('ltProofUI.connect().getCursor().line===0&&ltProofUI.connect().getValue().includes("const invalid = ;")'));
   check('Every native classic page and refresh starts under a verified quota without extra npm jobs',quotaSamples.length>=5&&quotaSamples.every(sample=>sample.metadata?.hardPrivateCommit&&sample.metadata.limitBytes===1024*1024*1024&&sample.jobs===1)&&npm.activeCount()===0);
   await ui('ltPreview.stop();ltPreview.pending()');
   check('Original Stop releases the classic package renderer quota and keeps Activity free of buttons',preview.activeCount()===0&&memory.status().jobs===0&&await ui('!ltPreview.isRunning()&&document.querySelectorAll("#proof-calculation button").length===0'));
   await assert.rejects(preview.start(owner,{path:hanging},window),/1500 ms|loading exceeded|closed|detached|terminated/);
   check('A synchronous classic package initializer obeys the page deadline and releases its quota',preview.activeCount()===0&&memory.status().jobs===0&&quotaSamples.at(-1)?.metadata?.hardPrivateCommit);
   await ui('lt.objs.command.exec_BANG_(cljs.core.keyword("open-path"),'+JSON.stringify(entry)+');ltProofUI.connect();testMenuClick("Preview file");ltPreview.pending()');
   check('A bounded classic package failure recovers through the original menu with a fresh quota',await value('document.querySelector("output").textContent')==='63'&&preview.status(owner).memory.hardPrivateCommit&&memory.status().jobs===1);
   await ui('ltPreview.stop();ltPreview.pending()');
   check('Final original Stop releases every classic package renderer after failure recovery',preview.activeCount()===0&&memory.status().jobs===0);
   result={passed:true,checks,root,quotaSamples};
  }catch(error){result={passed:false,checks,root,quotaSamples,error:error.stack,snapshot:preview.status(owner)};try{result.display=await ui('({activity:document.getElementById("preview-activity").textContent,state:ltPreview.state(),source:typeof classicEditor!=="undefined"?classicEditor.getValue():null,widgets:Array.from(document.querySelectorAll(".watch-result")).map(item=>({status:item.dataset.status,text:item.textContent}))})');}catch(_){}console.error(error);}
  await preview.shutdown();await npm.shutdown();await node.shutdown();await js.shutdown();memory.attach=originalAttach;
  result.cleanup={previewActive:preview.activeCount(),npmActive:npm.activeCount(),nodeActive:node.activeCount(),jsActive:js.activeCount(),...js.diagnostics()};delete result.cleanup.recent;result.passed=result.passed&&result.cleanup.previewActive===0&&result.cleanup.npmActive===0&&result.cleanup.nodeActive===0&&result.cleanup.jsActive===0&&result.cleanup.jobs===0&&result.cleanup.pending===0&&!result.cleanup.helperPid;
  fs.writeFileSync(path.join(policy.root,'classic-package-result.json'),JSON.stringify(result,null,2));clearTimeout(deadline);app.exit(result.passed?0:1);
 },250));
});
require('../../deploy/core/main.js');
