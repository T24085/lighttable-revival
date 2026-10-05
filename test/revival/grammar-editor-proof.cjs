'use strict';
const {captureNativePage,capturePreviewPage}=require('./native-page-capture.cjs');
process.env.LT_REVIVAL_TEST='1';
const {app,dialog}=require('electron'),fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict');
const policy=require('../../deploy/core/proof-policy.cjs'),projects=require('../../deploy/core/revival-projects.cjs'),memory=require('../../deploy/core/proof-memory.cjs'),html=require('../../deploy/core/revival-html-watches.cjs'),fixture=require('./package-fixtures.cjs');
const root=path.join(policy.root,'grammar-editor',crypto.randomUUID()),marker='GRAMMAR_PROJECT_START:'+path.basename(root),originals=new Map();
const write=(name,source)=>{const file=fixture.write(root,name,source);originals.set(file,fs.readFileSync(file));return file;};
const crlf=source=>source.replace(/\r?\n/g,'\r\n'),hash=source=>crypto.createHash('sha256').update(source).digest('hex');
write('package.json',{name:'light-table-grammar-editor',version:'1.0.0',private:true});
write('tsconfig.json',{compilerOptions:{jsx:'react',jsxFactory:'h',baseUrl:'.',paths:{'@dom':['dom.js'],'@math':['helper.js']}}});
write('dom.js','export function h(tag,props,...children){const element=document.createElement(tag);for(const [key,value]of Object.entries(props||{})){if(/^on/.test(key)&&typeof value==="function")element[key.toLowerCase()]=value;else element.setAttribute(key,String(value));}for(const child of children.flat())element.append(child instanceof Node?child:String(child));return element;}');
write('factory.js','export function h(tag,props,...children){return {tag,props:props||{},children};}');
const helperSource=crlf('export function double(n: number): number { return n * 2; }\n'),helper=write('helper.js',helperSource);
const mainSource=crlf([
 '// Saved JS filename, original typed JSX source 😀',
 'import {h} from "@dom";',
 'import {double} from "@math";',
 'console.log('+JSON.stringify(marker)+');',
 'interface Report { total: number; }',
 'const report: Report={total:double(21)};',
 'globalThis.grammarFailure=()=>{const label="😀";throw new Error("grammar runtime failed");};',
 'document.body.style.cssText="font:20px system-ui;padding:24px;background:#f4f2e8;color:#24352d";',
 'document.body.append(<main id="grammar-report"><h1>Editor grammar overrides</h1><output>{report.total as number}</output><button id="calculate" onClick={()=>{document.querySelector("output").textContent=String(double(21));}}>Calculate</button></main>);',
 '// Original preview menu selection: grammarFailure()'
].join('\n')+'\n'),entry=write('main.js',mainSource);
const compatibleSource=crlf('import {h} from "@dom";\nimport {double} from "@math";\nconsole.log('+JSON.stringify(marker)+');\ndocument.body.append(<output id="compatible-answer">{double(21)}</output>);\n'),compatible=write('compatible.js',compatibleSource);
const isolatedJSX=write('isolated-jsx.js',crlf('import {h} from "./factory.js";\nconst view=<output>{21 * 2}</output>;\nview.children[0];\n'));
const isolatedTS=write('isolated-ts.js',crlf('import {double} from "@math";\nconst amount: number=21;\ndouble(amount);\n'));
const classicTypedSource=crlf([
 'var classicAmount: number=21;',
 'function classicDouble(n: number): number { return n * 2; }',
 'globalThis.classicTypedCurrent=document.currentScript.id;',
 'globalThis.classicTypedThis=this===globalThis;',
 'classicOrder.push("typed");',
 'globalThis.classicFailure=()=>{const label="😀";throw new Error("classic grammar failed");};',
 '// Original preview menu selection: classicFailure()'
].join('\n')+'\n'),classicTyped=write('classic-typed.js',classicTypedSource);
const classicJSXSource=crlf('document.body.append(<output id="classic-answer">{classicDouble(classicAmount) as number}</output>);\nglobalThis.classicJSXCurrent=document.currentScript.id;\nclassicOrder.push("jsx");\n'),classicJSX=write('classic-jsx.js',classicJSXSource);
const classicPage=write('classic.html',crlf([
 '<!doctype html><html><head><title>Native classic grammar</title></head><body>',
 '<h1>Native classic grammar</h1>',
 '<script id="classic-before">console.log('+JSON.stringify(marker)+');var classicOrder=["before"];var classicGlobal=7;var h=(tag,props,...children)=>{const element=document.createElement(tag);for(const [key,value]of Object.entries(props||{}))element.setAttribute(key,String(value));for(const child of children.flat())element.append(child instanceof Node?child:String(child));return element;};</script>',
 '<script id="classic-typed" src="./classic-typed.js"></script>',
 '<script id="classic-jsx" src="./classic-jsx.js"></script>',
 '<script id="classic-after">classicOrder.push("after");globalThis.afterClassic={answer:classicDouble(classicAmount),global:classicGlobal};</script>',
 '</body></html>'
].join('\n')+'\n'));
const nodeCases=[
 {name:'node-ts.js',syntax:'TypeScript',loader:'ts',expression:'n * 2',source:'console.log("GRAMMAR_NODE_TS:"+typeof require);\nfunction double(n: number): number{return n * 2;}\ndouble(21);\n',log:'GRAMMAR_NODE_TS:function'},
 {name:'node-jsx.js',syntax:'JSX',loader:'jsx',expression:'21 * 2',source:'const h=(tag,props,...children)=>({tag,children});\nconsole.log("GRAMMAR_NODE_JSX:"+typeof require);\nconst view=<output>{21 * 2}</output>;\nview.children[0];\n',log:'GRAMMAR_NODE_JSX:function'},
 {name:'node-js.ts',syntax:'JavaScript',loader:'js',expression:'n * 2',source:'console.log("GRAMMAR_NODE_JS:"+typeof require);\nfunction double(n){return n * 2;}\ndouble(21);\n',log:'GRAMMAR_NODE_JS:function'},
 {name:'node-js.mts',syntax:'JavaScript',loader:'js',expression:'n * 2',source:'console.log("GRAMMAR_NODE_MTS:"+typeof require);\nfunction double(n){return n * 2;}\ndouble(21);\n',log:'GRAMMAR_NODE_MTS:undefined'}
].map(item=>({...item,path:write(item.name,crlf(item.source))}));
projects.activate(root);
// Consent is supplied only to this fixed trusted fixture's native Node prompt.
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
  const until=async predicate=>{const end=Date.now()+8000;while(!await predicate()){if(Date.now()>end)throw Error('Grammar editor condition timed out');await sleep(30);}};
  const check=(label,ok)=>{assert(ok,label);checks.push(label);console.error(label);fs.writeFileSync(path.join(policy.root,'grammar-editor-progress.json'),JSON.stringify({pid:process.pid,checks}));};
  const open=(file,key)=>ui('lt.objs.command.exec_BANG_(cljs.core.keyword("open-path"),'+JSON.stringify(file)+');var '+key+'Editor=ltProofUI.connect();var '+key+'Object=lt.objs.editor.pool.last_active();void 0;');
  const focus=key=>ui('lt.objs.tabs.active_BANG_('+key+'Object);ltProofUI.connect();'+key+'Editor.focus();void 0;');
  const menu=(label,pending)=>ui('lt.objs.menu.main_menu();testMenuClick('+JSON.stringify(label)+');'+(pending?pending+'.pending()':'void 0'));
  const refresh=()=>menu(['Run','Refresh preview'],'ltPreview'),start=()=>menu(['Run','Preview file'],'ltPreview'),stop=()=>menu(['Run','Stop'],'ltPreview');
  const value=async code=>JSON.parse((await preview.evaluate(owner,code)).result),widget=key=>ui(key+'Editor.getWrapperElement().querySelector(".watch-result .full")?.textContent');
  const point=(source,text)=>{const offset=source.indexOf(text);assert(offset>=0,'Expected authored error text');return {...html.originalLocation(source,offset),offset};};
  const fileSnapshot=(state,file)=>state.project.files.find(item=>item.path.toLowerCase()===file.toLowerCase());
  const allCurrent=()=>ui('[mainEditor,helperEditor].every(editor=>editor.getWrapperElement().querySelector(".watch-result")?.dataset.status==="current")');
  const watch=async(key,text,pending='ltPreview')=>{await focus(key);await ui('var watchAt='+key+'Editor.getValue().indexOf('+JSON.stringify(text)+');if(watchAt<0)throw Error("Missing authored watch");'+key+'Editor.setSelection('+key+'Editor.posFromIndex(watchAt),'+key+'Editor.posFromIndex(watchAt+'+text.length+'));void 0;');return menu(['Run','Watch selection'],pending);};
  // Set syntax goes through View -> Commands, the real command selector and its
  // real Syntax options; no loader argument or direct set-syntax call is used.
  const syntax=async(key,label)=>{
   await focus(key);await menu(['View','Commands']);
   await ui('(()=>{const input=document.querySelector("#right-bar .command.active > .selector input");if(!input)throw Error("Original command selector did not open");input.value="Editor: Set current editor syntax";input.dispatchEvent(new KeyboardEvent("keyup",{bubbles:true,key:"x"}));})()');
   await until(()=>ui('Array.from(document.querySelectorAll("#right-bar .command.active > .selector li")).some(item=>item.textContent.includes("Editor: Set current editor syntax"))'));
   await ui('Array.from(document.querySelectorAll("#right-bar .command.active > .selector li")).find(item=>item.textContent.includes("Editor: Set current editor syntax")).dispatchEvent(new MouseEvent("mousedown",{bubbles:true,cancelable:true}));void 0;');
   await until(()=>ui('!!document.querySelector("#right-bar .command.active > .options input[placeholder=Syntax]")'));
   await ui('(()=>{const input=document.querySelector("#right-bar .command.active > .options input[placeholder=Syntax]");input.value='+JSON.stringify(label)+';input.dispatchEvent(new KeyboardEvent("keyup",{bubbles:true,key:"x"}));})()');
   await until(()=>ui('Array.from(document.querySelectorAll("#right-bar .command.active > .options li")).some(item=>item.textContent.trim()==='+JSON.stringify(label)+')'));
   await ui('Array.from(document.querySelectorAll("#right-bar .command.active > .options li")).find(item=>item.textContent.trim()==='+JSON.stringify(label)+').dispatchEvent(new MouseEvent("mousedown",{bubbles:true,cancelable:true}));void 0;');
   const loader=label==='TSX'?'tsx':label==='JSX'?'jsx':label==='TypeScript'?'ts':'js';
   await until(()=>ui('ltProofUI.sourceLoader('+key+'Object)==='+JSON.stringify(loader)+'&&'+key+'Editor.getMode().name==='+JSON.stringify(['tsx','jsx'].includes(loader)?'jsx':'javascript')));
   await focus(key);
  };
  let result;
  try{
   await until(()=>ui('!!window.ltProofUI&&!!window.ltProofMenu&&!!window.ltPreview'));await ui(fs.readFileSync(path.join(__dirname,'menu-ui.js'),'utf8'));
   await open(helper,'helper');await open(entry,'main');
   check('Saved JS-named typed files initially use their original JavaScript grammar',await ui('ltProofUI.sourceLoader(mainObject)==="js"&&ltProofUI.sourceLoader(helperObject)==="js"')&&fs.readFileSync(entry,'utf8')===mainSource&&fs.readFileSync(helper,'utf8')===helperSource);
   await syntax('helper','TypeScript');await syntax('main','TSX');
   check('Original command and syntax selectors change whole-file grammar without changing filenames or saving bytes',await ui('mainEditor.getMode().name==="jsx"&&ltProofUI.sourceLoader(mainObject)==="tsx"&&ltProofUI.sourceLoader(helperObject)==="ts"')&&fs.readFileSync(entry,'utf8')===mainSource&&fs.readFileSync(helper,'utf8')===helperSource);
   await start();await until(async()=>await value('document.querySelector("output")?.textContent')==='42');const initial=preview.status(owner),firstQuota=quotaSamples.at(-1);
   check('Original Preview file compiles saved JS-named TSX and a separately overridden TypeScript dependency through config aliases',fileSnapshot(initial,entry).loader==='tsx'&&fileSnapshot(initial,helper).loader==='ts'&&fileSnapshot(initial,entry).source===await ui('mainEditor.getValue()')&&fileSnapshot(initial,helper).source===await ui('helperEditor.getValue()'));
   check('Authored overridden code starts after its separate hard 1 GiB quota is attached',firstQuota?.pid===initial.rendererPid&&firstQuota.metadata?.hardPrivateCommit&&firstQuota.metadata.limitBytes===1024*1024*1024&&firstQuota.jobs===1&&initial.rendererPid!==window.webContents.getOSProcessId());
   await syntax('helper','TSX');await ui('ltPreview.checkSources()');await until(()=>ui('ltPreview.state().stale'));
   check('Changing only an unwatched imported editor grammar stales the pinned renderer and source graph',preview.status(owner).rendererPid===initial.rendererPid&&preview.status(owner).project.sha256===initial.project.sha256&&await ui('helperEditor.getValue()')===fileSnapshot(initial,helper).source&&fs.readFileSync(helper,'utf8')===helperSource);
   await refresh();await until(async()=>await value('document.querySelector("output")?.textContent')==='42');const importedGrammar=preview.status(owner);
   check('Refresh changes imported grammar identity while keeping the same raw bytes and native result',importedGrammar.project.sha256!==initial.project.sha256&&fileSnapshot(importedGrammar,helper).loader==='tsx'&&fileSnapshot(importedGrammar,helper).sha256===fileSnapshot(initial,helper).sha256);
   await syntax('main','JavaScript');await ui('ltPreview.checkSources()');await until(()=>ui('ltPreview.state().stale'));
   check('Changing only an unwatched entry grammar marks the preview stale without executing replacement code',preview.status(owner).rendererPid===importedGrammar.rendererPid&&preview.status(owner).project.sha256===importedGrammar.project.sha256&&await ui('mainEditor.getValue()')===fileSnapshot(importedGrammar,entry).source);
   const beforeWrongGrammar=quotaSamples.length;await refresh();await until(()=>ui('!!document.querySelector(".preview-error-link")&&ltPreview.state().errors.some(item=>item.location)'));const wrongGrammar=await ui('ltPreview.state().errors.find(item=>item.location)');
   check('Native JavaScript rejects typed JSX with the selected grammar and original source before authored execution',wrongGrammar.location?.path===entry&&wrongGrammar.location.loader==='js'&&wrongGrammar.location.source===await ui('mainEditor.getValue()')&&fileSnapshot(preview.status(owner),entry).loader==='js'&&quotaSamples.length===beforeWrongGrammar);
   await syntax('main','TSX');await refresh();await until(async()=>await value('document.querySelector("output")?.textContent')==='42');
   check('Restoring the original TSX syntax recovers the unchanged saved project',await ui('!ltPreview.state().stale&&!document.querySelector(".preview-error-link")')&&fileSnapshot(preview.status(owner),entry).loader==='tsx');
   await open(compatible,'compatible');await syntax('compatible','JSX');await start();await until(async()=>await value('document.querySelector("#compatible-answer")?.textContent')==='42');const jsxGrammar=preview.status(owner);
   check('Original JSX Set syntax launches a saved JS-named whole-file JSX preview',fileSnapshot(jsxGrammar,compatible).loader==='jsx'&&fs.readFileSync(compatible,'utf8')===compatibleSource);
   await syntax('compatible','TSX');await ui('ltPreview.checkSources()');await until(()=>ui('ltPreview.state().stale'));
   check('Same-byte entry syntax changes preserve the existing page until Refresh',preview.status(owner).rendererPid===jsxGrammar.rendererPid&&preview.status(owner).project.sha256===jsxGrammar.project.sha256&&await value('document.querySelector("#compatible-answer").textContent')==='42');
   await refresh();await until(async()=>await value('document.querySelector("#compatible-answer")?.textContent')==='42');const tsxGrammar=preview.status(owner);
   check('Refresh captures a distinct whole-file grammar graph with unchanged entry source hash',tsxGrammar.project.sha256!==jsxGrammar.project.sha256&&fileSnapshot(tsxGrammar,compatible).loader==='tsx'&&fileSnapshot(tsxGrammar,compatible).sha256===fileSnapshot(jsxGrammar,compatible).sha256);
   await stop();check('Original Stop releases every unwatched grammar preview quota',preview.activeCount()===0&&memory.status().jobs===0);
   await syntax('helper','TypeScript');await focus('main');await start();await watch('helper','n * 2');await until(async()=>await widget('helper')==='42');await watch('main','report.total as number');await until(async()=>await widget('main')==='42');
   check('Original Watch selection observes actual typed imports and TSX expressions using selected whole-file grammars',await allCurrent()&&preview.status(owner).watchSnapshot.specs.length===2);
   const watched=preview.status(owner);
   await ui('var importAt=mainEditor.getValue().indexOf("@math");mainEditor.replaceRange("./helper.js",mainEditor.posFromIndex(importAt),mainEditor.posFromIndex(importAt+5));var factorAt=helperEditor.getValue().indexOf("n * 2")+4;helperEditor.replaceRange("3",helperEditor.posFromIndex(factorAt),helperEditor.posFromIndex(factorAt+1));void 0;');await ui('ltPreview.checkSources()');await until(()=>ui('ltPreview.state().stale'));
   check('Unsaved import and typed function edits stale the same captured watch graph without saving',preview.status(owner).rendererPid===watched.rendererPid&&preview.status(owner).project.sha256===watched.project.sha256&&fs.readFileSync(entry,'utf8')===mainSource&&fs.readFileSync(helper,'utf8')===helperSource&&await ui('[mainEditor,helperEditor].every(editor=>editor.getWrapperElement().querySelector(".watch-result").dataset.status==="stale")'));
   await refresh();await until(async()=>await widget('helper')==='63'&&await widget('main')==='63');const edited=preview.status(owner);
   check('Original Refresh captures unsaved imports and overrides and publishes 63 in the real page and widgets',await value('document.querySelector("output").textContent')==='63'&&edited.project.sha256!==watched.project.sha256&&await allCurrent()&&fileSnapshot(edited,entry).loader==='tsx'&&fileSnapshot(edited,helper).loader==='ts'&&fileSnapshot(edited,entry).sha256===hash(await ui('mainEditor.getValue()')));
   await value('document.querySelector("#calculate").click();true');
   check('Native DOM callbacks retain overridden dependency watches and unsaved value 63',await widget('helper')==='63'&&await value('document.querySelector("output").textContent')==='63');
   await syntax('helper','TSX');await ui('ltPreview.checkSources()');await until(()=>ui('ltPreview.state().stale'));
   check('Grammar-only changes to a watched dependency stale current original widgets without changing source',preview.status(owner).project.sha256===edited.project.sha256&&await ui('[mainEditor,helperEditor].every(editor=>editor.getWrapperElement().querySelector(".watch-result").dataset.status==="stale")'));
   await refresh();await until(async()=>await widget('helper')==='63'&&await widget('main')==='63');const retyped=preview.status(owner);
   check('Refresh changes watched grammar identity while preserving original watch IDs and values',retyped.project.sha256!==edited.project.sha256&&fileSnapshot(retyped,helper).sha256===fileSnapshot(edited,helper).sha256&&fileSnapshot(retyped,helper).loader==='tsx'&&retyped.watchSnapshot.specs.every(item=>watched.watchSnapshot.specs.some(prior=>prior.id===item.id))&&await allCurrent());
   const authored=await ui('mainEditor.getValue()'),runtimePoint=point(authored,'new Error("grammar runtime failed")');await focus('main');await ui('var failureAt=mainEditor.getValue().lastIndexOf("grammarFailure()");mainEditor.setSelection(mainEditor.posFromIndex(failureAt),mainEditor.posFromIndex(failureAt+16));void 0;');await menu(['Run','Evaluate selection in preview'],'ltPreview');
   await until(()=>ui('ltPreview.state().errors.some(item=>item.location&&item.message.includes("grammar runtime failed"))'));const runtimeError=await ui('ltPreview.state().errors.find(item=>item.location&&item.message.includes("grammar runtime failed"))');
   check('Actual preview menu errors map erased types and same-line emoji to exact original UTF16 coordinates',runtimeError.location?.path===entry&&runtimeError.location.line===runtimePoint.line&&runtimeError.location.column===runtimePoint.column+1&&runtimeError.location.source===authored&&mainSource.includes('\r\n')&&runtimeError.location.sourceLine.includes('😀'));
   await ui('Array.from(document.querySelectorAll(".preview-error-link")).find(link=>link.textContent==='+JSON.stringify(runtimeError.location.name+':'+runtimePoint.line+':'+(runtimePoint.column+1))+').click();void 0;');
   check('Original runtime error links select the JS-named TSX editor at the exact authored cursor',await ui('ltProofUI.connect()===mainEditor&&mainEditor.getCursor().line==='+JSON.stringify(runtimePoint.line-1)+'&&mainEditor.getCursor().ch==='+JSON.stringify(runtimePoint.column)));
   await refresh();await until(allCurrent);const cleanSource=await ui('mainEditor.getValue()'),broken='const label="😀";const invalid: number = ;\n',compileSource=cleanSource+broken,compilePoint={...html.originalLocation(compileSource,compileSource.lastIndexOf(';'))},beforeCompile=quotaSamples.length;
   await ui('mainEditor.replaceRange('+JSON.stringify(broken)+',mainEditor.posFromIndex(mainEditor.getValue().length));void 0;');await refresh();await until(()=>ui('ltPreview.state()?.status==="stopped"&&!!document.querySelector(".preview-error-link")'));const compileError=await ui('ltPreview.state().errors[0]');
   check('Compiler failures preserve exact original emoji columns and stop before any authored renderer starts',compileError.location?.path===entry&&compileError.location.line===compilePoint.line&&compileError.location.column===compilePoint.column+1&&compileError.location.source===compileSource&&quotaSamples.length===beforeCompile&&preview.activeCount()===0&&memory.status().jobs===0&&fs.readFileSync(entry,'utf8')===mainSource);
   await ui('document.querySelector(".preview-error-link").click();void 0;');
   check('Original compiler error links select their exact authored JS-named editor position',await ui('ltProofUI.connect()===mainEditor&&mainEditor.getCursor().line==='+JSON.stringify(compilePoint.line-1)+'&&mainEditor.getCursor().ch==='+JSON.stringify(compilePoint.column)));
   await ui('mainEditor.replaceRange("",mainEditor.posFromIndex('+cleanSource.length+'),mainEditor.posFromIndex(mainEditor.getValue().length));void 0;');assert.equal(await ui('mainEditor.getValue()'),cleanSource);await refresh();await until(allCurrent);
   check('Repair and Refresh recover all overridden watches and native DOM without saving',await value('document.querySelector("output").textContent')==='63'&&await ui('!ltPreview.state().stale&&!document.querySelector(".preview-error-link")'));
   await focus('main');await ui('mainEditor.refresh();void 0;');await sleep(100);const editorImage=await captureNativePage(window.webContents);assert.deepEqual(editorImage.getSize(),{width:900,height:600});fs.writeFileSync(path.join(policy.root,'grammar-original-editor.png'),editorImage.toPNG());
   const {image:pageImage}=await capturePreviewPage(preview,owner);assert.deepEqual(pageImage.getSize(),{width:900,height:600});fs.writeFileSync(path.join(policy.root,'grammar-native-page.png'),pageImage.toPNG());preview.bounds(owner,{x:0,y:0,width:1,height:1,visible:false});
   check('Original editor widgets and actual native preview have separate 900 by 600 screenshots',true);
   await stop();check('Original Stop releases every watched grammar preview and verified browser quota',preview.activeCount()===0&&memory.status().jobs===0&&quotaSamples.length>=8&&quotaSamples.every(sample=>sample.metadata?.hardPrivateCommit&&sample.jobs===1));
   await focus('main');await menu(['Run','Clear watches']);await focus('helper');await menu(['Run','Clear watches']);
   await open(classicTyped,'classicTyped');await syntax('classicTyped','TypeScript');await open(classicJSX,'classicJSX');await syntax('classicJSX','TSX');await open(classicPage,'classicPage');await start();await until(async()=>await value('document.querySelector("#classic-answer")?.textContent')==='42');const classicInitial=preview.status(owner),classicQuota=quotaSamples.at(-1);
   check('Original syntax selectors compile external classic TS and TSX while preserving native globals, top-level this, currentScript and tag order',JSON.stringify(await value('[classicOrder,classicTypedCurrent,classicJSXCurrent,classicTypedThis,afterClassic.answer,afterClassic.global]'))===JSON.stringify([['before','typed','jsx','after'],'classic-typed','classic-jsx',true,42,7])&&fileSnapshot(classicInitial,classicTyped).loader==='ts'&&fileSnapshot(classicInitial,classicJSX).loader==='tsx'&&fs.readFileSync(classicTyped,'utf8')===classicTypedSource&&fs.readFileSync(classicJSX,'utf8')===classicJSXSource);
   await watch('classicTyped','n * 2');await until(async()=>await widget('classicTyped')==='42');await watch('classicJSX','classicDouble(classicAmount) as number');await until(async()=>await widget('classicJSX')==='42');
   check('Original watch menus observe transformed external classic TypeScript functions and TSX values in the captured HTML page',preview.status(owner).watchSnapshot.specs.length===2&&await ui('[classicTypedEditor,classicJSXEditor].every(editor=>editor.getWrapperElement().querySelector(".watch-result")?.dataset.status==="current")')&&await value('document.querySelector("#classic-answer").textContent')==='42');
   const classicAuthored=await ui('classicTypedEditor.getValue()'),classicPoint=point(classicAuthored,'new Error("classic grammar failed")');await focus('classicTyped');await ui('var classicFailureAt=classicTypedEditor.getValue().lastIndexOf("classicFailure()");classicTypedEditor.setSelection(classicTypedEditor.posFromIndex(classicFailureAt),classicTypedEditor.posFromIndex(classicFailureAt+16));void 0;');await menu(['Run','Evaluate selection in preview'],'ltPreview');await until(()=>ui('ltPreview.state().errors.some(item=>item.location&&item.message.includes("classic grammar failed"))'));const classicError=await ui('ltPreview.state().errors.find(item=>item.location&&item.message.includes("classic grammar failed"))');
   check('Native external classic error maps erased types and a same-line emoji to its original saved JS source',classicError.location?.path===classicTyped&&classicError.location.line===classicPoint.line&&classicError.location.column===classicPoint.column+1&&classicError.location.source===classicAuthored&&classicError.location.sourceLine.includes('😀')&&fs.readFileSync(classicTyped,'utf8')===classicTypedSource);
   await ui('Array.from(document.querySelectorAll(".preview-error-link")).find(link=>link.textContent==='+JSON.stringify(classicError.location.name+':'+classicPoint.line+':'+(classicPoint.column+1))+').click();void 0;');
   check('Original external classic error link opens the selected TypeScript grammar at the exact authored cursor',await ui('ltProofUI.connect()===classicTypedEditor&&classicTypedEditor.getCursor().line==='+JSON.stringify(classicPoint.line-1)+'&&classicTypedEditor.getCursor().ch==='+JSON.stringify(classicPoint.column)));
   await stop();check('Original Stop releases the classic captured page after its quota was attached before authored scripts',preview.activeCount()===0&&memory.status().jobs===0&&classicQuota?.pid===classicInitial.rendererPid&&classicQuota.metadata?.hardPrivateCommit&&classicQuota.metadata.limitBytes===1024*1024*1024&&classicQuota.jobs===1&&quotaSamples.length>=11&&quotaSamples.every(sample=>sample.metadata?.hardPrivateCommit&&sample.jobs===1));
   await focus('classicTyped');await menu(['Run','Clear watches']);await focus('classicJSX');await menu(['Run','Clear watches']);
   await open(isolatedJSX,'isolated');await syntax('isolated','JSX');await watch('isolated','21 * 2','ltProofUI');const isolatedResult=await menu(['Run','Run file'],'ltProofUI');await until(async()=>await widget('isolated')==='42');
   check('Original isolated Run file honors JSX grammar for a saved JS-named file with real imports and watches',isolatedResult.accepted&&isolatedResult.result.result==='42'&&isolatedResult.result.project.modules.find(item=>item.path===isolatedJSX).loader==='jsx'&&isolatedResult.result.memory.hardPrivateCommit&&isolatedResult.result.memory.processExited&&memory.status().jobs===0);
   await open(isolatedTS,'isolatedTyped');await syntax('isolatedTyped','TypeScript');await watch('isolatedTyped','double(amount)','ltProofUI');const isolatedTyped=await menu(['Run','Run file'],'ltProofUI');await until(async()=>await widget('isolatedTyped')==='63');
   check('Original isolated Run file carries unsaved imported grammar independently of JS filenames',isolatedTyped.accepted&&isolatedTyped.result.result==='63'&&isolatedTyped.result.project.modules.find(item=>item.path===isolatedTS).loader==='ts'&&isolatedTyped.result.project.modules.find(item=>item.path===helper).loader==='tsx'&&isolatedTyped.result.memory.processExited&&memory.status().jobs===0);
   await open(nodeCases[2].path,'isolatedJS');await syntax('isolatedJS','JavaScript');await watch('isolatedJS','n * 2','ltProofUI');const isolatedPlain=await menu(['Run','Run file'],'ltProofUI');await until(async()=>await widget('isolatedJS')==='42');
   check('Original isolated Run file honors explicit JavaScript on a TS filename without applying the typed transform',isolatedPlain.accepted&&isolatedPlain.result.result==='42'&&isolatedPlain.result.mode==='disposable-javascript'&&isolatedPlain.result.memory.processExited&&memory.status().jobs===0);
   for(const item of nodeCases){
    await open(item.path,'node');await syntax('node',item.syntax);await watch('node',item.expression,'ltProofUI');const actual=await menu(['Run','Run file with Node'],'ltProofUI');await until(async()=>await widget('node')==='42');
    check('Original Node menu honors '+item.syntax+' on '+item.name+' while retaining native module format and watches',actual.accepted&&actual.result.result==='42'&&actual.result.logs.join('\n').includes(item.log)&&actual.result.project.modules.find(source=>source.path===item.path).loader===item.loader&&actual.result.memory.hardPrivateCommit&&actual.result.memory.contextFilesRemoved&&memory.status().jobs===0);
   }
   await focus('node');await menu(['Run','Clear watches']);const nodeErrorSource='const message="😀";throw new Error("grammar Node failed");\n',nodePoint=point(nodeErrorSource,'new Error');await ui('nodeEditor.setValue('+JSON.stringify(nodeErrorSource)+');void 0;');const nodeFailure=await menu(['Run','Run file with Node'],'ltProofUI');
   check('JS grammar override retains native MTS runtime error links at exact authored emoji columns',!nodeFailure.accepted&&nodeFailure.location?.path===nodeCases.at(-1).path&&nodeFailure.location.line===nodePoint.line&&nodeFailure.location.column===nodePoint.column+1&&nodeFailure.location.source===nodeErrorSource&&memory.status().jobs===0);
   await ui('document.getElementById("proof-error-open").click();void 0;');check('Original Node error links reopen the unchanged-extension editor at the exact source cursor',await ui('ltProofUI.connect()===nodeEditor&&nodeEditor.getCursor().line==='+JSON.stringify(nodePoint.line-1)+'&&nodeEditor.getCursor().ch==='+JSON.stringify(nodePoint.column)));
   await ui('nodeEditor.setValue("console.log(\\"GRAMMAR_NODE_READY\\");new Promise(()=>{});\\n");void 0;');await menu(['Run','Run file with Node']);await until(()=>ui('document.getElementById("proof-output").textContent.includes("GRAMMAR_NODE_READY")'));await menu(['Run','Stop'],'ltProofUI');
   check('Original Stop cancels a live overridden Node program and its complete process quota',node.activeCount()===0&&memory.status().jobs===0&&await ui('!ltProofUI.isRunning()'));
   check('All fixture bytes remain saved exactly as authored and only this trusted Node project receives consent',trustRequests===1&&[...originals].every(([file,bytes])=>fs.readFileSync(file).equals(bytes)));
   result={passed:true,checks,root,quotaSamples,trustRequests};
  }catch(error){result={passed:false,checks,root,quotaSamples,trustRequests,error:error.stack,snapshot:preview.status(owner)};try{result.display=await ui('({activity:document.getElementById("preview-activity").textContent,state:ltPreview.state(),output:document.getElementById("proof-output").textContent,command:document.querySelector("#right-bar .command")?.outerHTML,widgets:Array.from(document.querySelectorAll(".watch-result")).map(item=>({status:item.dataset.status,text:item.textContent}))})');}catch(_){}if(result.snapshot?.status==='running')try{result.previewDOM=await value('document.documentElement.outerHTML');}catch(diagnostic){result.previewDOMError=diagnostic.message;}console.error(error);}
  dialog.showMessageBox=originalDialog;await preview.shutdown();await npm.shutdown();await node.shutdown();await js.shutdown();memory.attach=originalAttach;
  result.cleanup={previewActive:preview.activeCount(),npmActive:npm.activeCount(),nodeActive:node.activeCount(),jsActive:js.activeCount(),...js.diagnostics()};delete result.cleanup.recent;
  result.passed=result.passed&&result.cleanup.previewActive===0&&result.cleanup.npmActive===0&&result.cleanup.nodeActive===0&&result.cleanup.jsActive===0&&result.cleanup.jobs===0&&result.cleanup.pending===0&&!result.cleanup.helperPid;
  fs.writeFileSync(path.join(policy.root,'grammar-editor-result.json'),JSON.stringify(result,null,2));clearTimeout(deadline);app.exit(result.passed?0:1);
 },250));
});
require('../../deploy/core/main.js');
