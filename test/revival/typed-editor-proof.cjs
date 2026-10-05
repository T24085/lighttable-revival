'use strict';
const {captureNativePage,capturePreviewPage}=require('./native-page-capture.cjs');
process.env.LT_REVIVAL_TEST='1';
const {app,dialog}=require('electron'),fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict');
const policy=require('../../deploy/core/proof-policy.cjs'),projects=require('../../deploy/core/revival-projects.cjs'),memory=require('../../deploy/core/proof-memory.cjs'),html=require('../../deploy/core/revival-html-watches.cjs'),fixture=require('./package-fixtures.cjs');
const root=path.join(policy.root,'typed-editor',crypto.randomUUID()),marker='TYPED_PROJECT_START:'+path.basename(root),write=(name,source)=>fixture.write(root,name,source);
write('package.json',{name:'light-table-typed-editor',version:'1.0.0',private:true});
write('tsconfig.json',{compilerOptions:{target:'ES2020',jsx:'react',jsxFactory:'h',strict:true}});
const helperSource='export function double(n: number): number { return n * 2; }\n',helper=write('helper.ts',helperSource.replace(/\n/g,'\r\n'));
write('dom.ts','export function h(tag: string, props: Record<string, unknown> | null, ...children: unknown[]): HTMLElement { const element=document.createElement(tag); for(const [key,value] of Object.entries(props||{})) element.setAttribute(key,String(value)); for(const child of children.flat()) element.append(child instanceof Node ? child : String(child)); return element; }');
const jsxSource='import {h} from "./dom.ts";\nexport function tile(answer){return <aside id="jsx-tile">{"JSX "+answer}</aside>;}\n',jsx=write('tile.jsx',jsxSource);
const mts=write('label.mts','export const label: string = "MTS";'),cts=write('label.cts','const label: string = "CTS";module.exports={label};');
const mainSource=[
 'import {double} from "./helper.ts";',
 'import {h} from "./dom.ts";',
 'import {tile} from "./tile.jsx";',
 'import {label as esmLabel} from "./label.mts";',
 'import common from "./label.cts";',
 'console.log('+JSON.stringify(marker)+');',
 'interface Report { total: number; labels: string[]; }',
 'const report: Report={total:double(21),labels:[esmLabel,common.label]};',
 'globalThis.typedDouble=double;',
 'globalThis.h=h;',
 'globalThis.typedFailure=()=>{throw new Error("typed preview failed");};',
 'document.body.style.cssText="font:20px system-ui;padding:24px;background:#f4f2e8;color:#24352d";',
 'document.body.append(<main id="typed-report"><h1>Typed preview</h1><output>{report.total as number}</output><p>{report.labels.join(" / ")}</p><button id="calculate">Calculate</button></main>);',
 'document.body.append(tile(report.total));',
 'document.getElementById("calculate")!.onclick=()=>{document.querySelector("output")!.textContent=String(double(21));};',
 '// Live typed selection: typedDouble(21) as number',
 '// Live JSX selection: document.body.append(<aside id="selection-jsx">{typedDouble(21) as number}</aside>)',
 '// Live JSX failure: <aside>{((): number=>{throw new Error("typed JSX selection failed");})()}</aside>'
].join('\n')+'\n',entry=write('main.tsx',mainSource.replace(/\n/g,'\r\n'));
const routes=['js','mjs','cjs'].map(extension=>write('route.'+extension,'42;'));
const isolatedSource='function double(n: number): number { return n * 2; }\ndouble(21);\n',isolated=write('isolated.ts',isolatedSource);
const selectionSource='const prior: number = 7;\n({answer: (21 as number) * 2});\n',selection=write('selection.ts',selectionSource);
const nodeFiles=['ts','mts','cts'].map(extension=>({extension,path:write('node-'+extension+'.'+extension,'console.log("NODE_FORMAT:'+extension+':"+typeof require);\nfunction double(n: number): number { return n * 2; }\ndouble(21);\n')}));
projects.activate(root);
const originalDialog=dialog.showMessageBox;let trustRequests=0;
dialog.showMessageBox=async(window,options)=>options.title==='Run local Node project'?(trustRequests++,{response:1}):originalDialog(window,options);
const attached=new Map(),quotaSamples=[],originalAttach=memory.attach;
memory.attach=async(...args)=>{const quota=await originalAttach(...args);attached.set(args[0],quota.metadata);return quota;};
app.on('web-contents-created',(_event,wc)=>wc.debugger.on('message',(_event,method,params)=>{if(method!=='Runtime.consoleAPICalled'||!params.args?.some(arg=>arg.value===marker))return;const pid=wc.getOSProcessId();quotaSamples.push({pid,metadata:attached.get(pid)||null,jobs:memory.status().jobs});}));
let seen=false;const deadline=setTimeout(()=>app.exit(2),110000);
app.on('browser-window-created',(_event,window)=>{
 if(seen)return;seen=true;window.setOpacity(0);window.setSkipTaskbar(true);window.setContentSize(900,600);window.showInactive();
 window.webContents.once('did-finish-load',()=>setTimeout(async()=>{
  const preview=require('../../deploy/core/revival-preview.cjs'),npm=require('../../deploy/core/revival-npm.cjs'),node=require('../../deploy/core/revival-node.cjs'),js=require('../../deploy/core/proof-js.cjs'),owner=window.webContents.id,checks=[];
  const ui=code=>window.webContents.executeJavaScript(code),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),until=async predicate=>{const end=Date.now()+8000;while(!await predicate()){if(Date.now()>end)throw Error('Typed editor condition timed out');await sleep(30);}},evaluate=code=>preview.evaluate(owner,code),value=async code=>JSON.parse((await evaluate(code)).result);
  const check=(label,ok)=>{assert(ok,label);checks.push(label);console.error(label);fs.writeFileSync(path.join(policy.root,'typed-editor-progress.json'),JSON.stringify({pid:process.pid,checks}));};
  const open=file=>ui('lt.objs.command.exec_BANG_(cljs.core.keyword("open-path"),'+JSON.stringify(file)+');ltProofUI.connect();void 0;'),refresh=()=>ui('lt.objs.menu.main_menu();testMenuClick("Refresh preview");ltPreview.pending()');
  const browserSelection=source=>ui('lt.objs.tabs.active_BANG_(typedObject);ltProofUI.connect();var browserFrom=typedEditor.getValue().indexOf('+JSON.stringify(source)+');if(browserFrom<0)throw Error("Missing authored browser selection");typedEditor.setSelection(typedEditor.posFromIndex(browserFrom),typedEditor.posFromIndex(browserFrom+'+source.length+'));lt.objs.menu.main_menu();testMenuClick("Evaluate selection in preview");ltPreview.pending()');
  const widget=name=>ui(name+'.getWrapperElement().querySelector(".watch-result .full")?.textContent'),currentWidgets=()=>ui('[typedEditor,helperEditor,jsxEditor].every(editor=>editor.getWrapperElement().querySelector(".watch-result")?.dataset.status==="current")');
  let result;
  try{
   await until(()=>ui('!!window.ltProofUI&&!!window.ltProofMenu&&!!window.ltPreview'));await ui(fs.readFileSync(path.join(__dirname,'menu-ui.js'),'utf8'));
   for(const file of [...routes,jsx,helper,entry,mts,cts]){
    await open(file);const extension=path.extname(file).slice(1),expectedMime=extension==='jsx'?'text/jsx':extension==='tsx'?'text/typescript-jsx':['ts','mts','cts'].includes(extension)?'text/typescript':'text/javascript';
    const recognized=await ui('(()=>{const object=lt.objs.editor.pool.last_active(),editor=ltProofUI.connect(),info=cljs.core.clj__GT_js(cljs.core.get(cljs.core.deref(object),cljs.core.keyword("info")));lt.objs.menu.main_menu();return {mime:info.mime,mode:editor.getMode().name,javascript:!!lt.object.has_tag_QMARK_(object,cljs.core.keyword("editor.javascript")),watchable:!!lt.object.has_tag_QMARK_(object,cljs.core.keyword("watchable")),menus:[testMenuItem("Preview file").enabled,testMenuItem("Watch selection").enabled,testMenuItem("Run file with Node").enabled],family:ltProofUI.hasJavaScriptEditor(object)}})()');
    assert.equal(recognized.mime,expectedMime);assert.equal(recognized.mode,['jsx','tsx'].includes(extension)?'jsx':'javascript');assert.deepEqual(recognized.menus,[true,true,true]);
    check('Original '+extension.toUpperCase()+' editor keeps its grammar, JavaScript client tags and native preview/watch/Node menus',recognized.javascript&&recognized.watchable&&recognized.family);
   }
   await open(entry);await ui('var typedEditor=ltProofUI.connect();var typedObject=lt.objs.editor.pool.last_active();lt.objs.menu.main_menu();testMenuClick("Preview file");ltPreview.pending()');
   assert.deepEqual(await value('[document.querySelector("output").textContent,document.querySelector("#jsx-tile").textContent,document.querySelector("#typed-report p").textContent]'),['42','JSX 42','MTS / CTS']);
   const first=preview.status(owner),firstQuota=quotaSamples.at(-1);
   check('Original TSX Preview file compiles actual JSX with imported TS, JSX, MTS and CTS modules',first.project.files.filter(item=>[entry,helper,jsx,mts,cts].includes(item.path)).length===5&&first.project.files.find(item=>item.path===entry).source===await ui('typedEditor.getValue()')&&fs.readFileSync(entry,'utf8')===mainSource.replace(/\n/g,'\r\n'));
   check('Typed project code starts only after its separate hard 1 GiB preview quota is verified',firstQuota?.pid===first.rendererPid&&firstQuota.metadata?.hardPrivateCommit&&firstQuota.metadata.limitBytes===1024*1024*1024&&firstQuota.jobs===1&&first.rendererPid!==window.webContents.getOSProcessId());
   await open(helper);await ui('var helperEditor=ltProofUI.connect();var helperObject=lt.objs.editor.pool.last_active();var helperAt=helperEditor.getValue().indexOf("n * 2");helperEditor.setSelection(helperEditor.posFromIndex(helperAt),helperEditor.posFromIndex(helperAt+5));lt.objs.menu.main_menu();testMenuClick("Watch selection");ltPreview.pending()');await until(async()=>await widget('helperEditor')==='42');
   check('Original TypeScript imported function watches publish 42 beside the authored expression',preview.status(owner).watchSnapshot.specs.some(item=>item.path===helper));
   await ui('lt.objs.tabs.active_BANG_(typedObject);ltProofUI.connect();var typedAt=typedEditor.getValue().indexOf("report.total as number");typedEditor.setSelection(typedEditor.posFromIndex(typedAt),typedEditor.posFromIndex(typedAt+22));lt.objs.menu.main_menu();testMenuClick("Watch selection");ltPreview.pending()');await until(async()=>await widget('typedEditor')==='42');
   await open(jsx);await ui('var jsxEditor=ltProofUI.connect();var jsxObject=lt.objs.editor.pool.last_active();var jsxAt=jsxEditor.getValue().indexOf("+answer")+1;jsxEditor.setSelection(jsxEditor.posFromIndex(jsxAt),jsxEditor.posFromIndex(jsxAt+6));lt.objs.menu.main_menu();testMenuClick("Watch selection");ltPreview.pending()');await until(async()=>await widget('jsxEditor')==='42');
   check('Original TSX type assertions and JSX child expressions join the same captured browser watch group',await currentWidgets()&&preview.status(owner).watchSnapshot.specs.length===3);
   const watched=preview.status(owner);
   await ui('lt.objs.tabs.active_BANG_(helperObject);ltProofUI.connect();helperEditor.replaceRange("3",helperEditor.posFromIndex(helperAt+4),helperEditor.posFromIndex(helperAt+5));void 0;');await ui('ltPreview.checkSources()');await until(()=>ui('ltPreview.state().stale'));
   check('Unsaved TypeScript changes stale every original typed/JSX watch without saving or replacing its renderer',preview.status(owner).rendererPid===watched.rendererPid&&preview.status(owner).project.sha256===watched.project.sha256&&fs.readFileSync(helper,'utf8')===helperSource.replace(/\n/g,'\r\n')&&await ui('[typedEditor,helperEditor,jsxEditor].every(editor=>editor.getWrapperElement().querySelector(".watch-result").dataset.status==="stale")'));
   await refresh();await until(async()=>await widget('helperEditor')==='63'&&await widget('typedEditor')==='63'&&await widget('jsxEditor')==='63');
   check('Native Refresh captures unsaved TypeScript and updates actual TSX/JSX DOM and all source watches to 63',await value('document.querySelector("output").textContent')==='63'&&await value('document.querySelector("#jsx-tile").textContent')==='JSX 63'&&preview.status(owner).project.sha256!==watched.project.sha256&&preview.status(owner).project.files.find(item=>item.path===helper).origin==='editor'&&fs.readFileSync(helper,'utf8')===helperSource.replace(/\n/g,'\r\n'));
   await ui('lt.objs.tabs.active_BANG_(helperObject);ltProofUI.connect();lt.objs.command.exec_BANG_(cljs.core.keyword("save"));void 0;');await refresh();await until(currentWidgets);
   check('Original typed Save and Refresh retain captured source, watch IDs and native DOM callbacks',fs.readFileSync(helper,'utf8').replace(/\r\n/g,'\n')===await ui('helperEditor.getValue()')&&preview.status(owner).watchSnapshot.specs.every(item=>watched.watchSnapshot.specs.some(prior=>prior.id===item.id)));
   await evaluate('document.querySelector("#calculate").click();undefined');await until(async()=>await widget('helperEditor')==='63');
   check('Actual native callbacks retain the typed function watch after source save',await value('document.querySelector("output").textContent')==='63');
   const authored=await ui('typedEditor.getValue()'),point=html.originalLocation(authored,authored.indexOf('new Error("typed preview failed")'));
   await assert.rejects(evaluate('typedFailure()'),error=>error.location?.path===entry&&error.location.line===point.line&&error.location.column===point.column+1&&error.location.source===authored);
   await until(()=>ui('Array.from(document.querySelectorAll(".preview-error-link")).at(-1)?.textContent.includes("main.tsx:")'));await ui('Array.from(document.querySelectorAll(".preview-error-link")).at(-1).click();void 0;');
   check('Transformed TSX errors navigate to the original exact editor line and column',await ui('ltProofUI.connect()===typedEditor&&typedEditor.getCursor().line==='+JSON.stringify(point.line-1)+'&&typedEditor.getCursor().ch==='+JSON.stringify(point.column)));
   await refresh();await until(currentWidgets);const repairedHelper=await ui('helperEditor.getValue()'),beforeFailure=quotaSamples.length;
   await ui('lt.objs.tabs.active_BANG_(helperObject);ltProofUI.connect();helperEditor.replaceRange("type Broken = ;\\n",{line:0,ch:0});void 0;');await refresh();await until(()=>ui('ltPreview.state()?.status==="stopped"&&!!document.querySelector(".preview-error-link")'));
   const failure=await ui('ltPreview.state().errors[0]');
   check('Typed syntax failures retain original imported source before any project renderer or quota starts',failure.location?.path===helper&&failure.location.line===1&&failure.location.column>0&&failure.location.source===await ui('helperEditor.getValue()')&&preview.activeCount()===0&&memory.status().jobs===0&&quotaSamples.length===beforeFailure);
   await ui('Array.from(document.querySelectorAll(".preview-error-link")).at(-1).click();void 0;');check('Typed compiler error links reopen the original imported editor',await ui('ltProofUI.connect()===helperEditor&&helperEditor.getCursor().line===0'));
   await ui('helperEditor.replaceRange("",{line:0,ch:0},{line:1,ch:0});void 0;');assert.equal(await ui('helperEditor.getValue()'),repairedHelper);await refresh();await until(async()=>await widget('helperEditor')==='63');
   check('Repair and Refresh recover the typed graph without leaving failed widgets or errors',await currentWidgets()&&await ui('!document.querySelector(".preview-error-link")')&&await value('document.querySelector("output").textContent')==='63');
   const selectionPid=preview.status(owner).rendererPid,typedSelection=await browserSelection('typedDouble(21) as number');
   check('Original preview selection evaluates typed expressions against the actual imported globals',typedSelection.result==='63'&&preview.status(owner).rendererPid===selectionPid&&await currentWidgets());
   await browserSelection('document.body.append(<aside id="selection-jsx">{typedDouble(21) as number}</aside>)');
   check('Original preview selection compiles whole JSX using captured configuration and the live imported factory',await value('document.querySelector("#selection-jsx").textContent')==='63'&&preview.status(owner).rendererPid===selectionPid&&memory.status().jobs===1);
   await open(routes[0]);const syntaxSelection='document.body.append(<aside id="syntax-selected">{typedDouble(21) as number}</aside>)';
   await ui('var syntaxEditor=ltProofUI.connect();lt.objs.command.exec_BANG_(cljs.core.keyword("set-syntax"),cljs.core.hash_map(cljs.core.keyword("mime"),"text/typescript-jsx",cljs.core.keyword("tags"),cljs.core.vector(cljs.core.keyword("editor.javascript"),cljs.core.keyword("editor.typescript"),cljs.core.keyword("editor.jsx"))));syntaxEditor.setValue('+JSON.stringify(syntaxSelection)+');syntaxEditor.setSelection({line:0,ch:0},syntaxEditor.posFromIndex(syntaxEditor.getValue().length));lt.objs.menu.main_menu();testMenuClick("Evaluate selection in preview");ltPreview.pending()');
   check('Original Set syntax preserves TSX preview selection grammar in an unsaved JS-named buffer',await value('document.querySelector("#syntax-selected").textContent')==='63'&&await ui('syntaxEditor.getMode().name==="jsx"&&ltProofUI.sourceLoader()==="tsx"')&&fs.readFileSync(routes[0],'utf8')==='42;'&&preview.status(owner).rendererPid===selectionPid);
   await ui('syntaxEditor.setValue("42;");lt.objs.command.exec_BANG_(cljs.core.keyword("set-syntax"),cljs.core.hash_map(cljs.core.keyword("mime"),"text/javascript",cljs.core.keyword("tags"),cljs.core.vector(cljs.core.keyword("editor.javascript"))));void 0;');
   const selectedFailureSource='<aside>{((): number=>{throw new Error("typed JSX selection failed");})()}</aside>',selectedFailurePoint=html.originalLocation(authored,authored.indexOf('new Error("typed JSX selection failed")'));
   const selectedFailure=await browserSelection(selectedFailureSource);await until(()=>ui('Array.from(document.querySelectorAll(".preview-error-link")).at(-1)?.textContent.includes("main.tsx:")'));const selectedError=await ui('ltPreview.state().errors.find(item=>item.message.includes("typed JSX selection failed"))');
   check('Typed JSX selection errors undo both transforms to the exact original source coordinates',selectedFailure.accepted===false&&selectedError.location?.path===entry&&selectedError.location.line===selectedFailurePoint.line&&selectedError.location.column===selectedFailurePoint.column+1&&selectedError.location.source===authored&&preview.status(owner).rendererPid===selectionPid);
   await ui('Array.from(document.querySelectorAll(".preview-error-link")).at(-1).click();void 0;');check('Original typed JSX selection error links select their exact authored comment snippet',await ui('ltProofUI.connect()===typedEditor&&typedEditor.getCursor().line==='+JSON.stringify(selectedFailurePoint.line-1)+'&&typedEditor.getCursor().ch==='+JSON.stringify(selectedFailurePoint.column)));
   await refresh();await until(currentWidgets);
   await ui('lt.objs.tabs.active_BANG_(typedObject);ltProofUI.connect();typedEditor.refresh();void 0;');await sleep(100);fs.writeFileSync(path.join(policy.root,'typed-original-editor.png'),(await captureNativePage(window.webContents)).toPNG());
   fs.writeFileSync(path.join(policy.root,'typed-native-page.png'),(await capturePreviewPage(preview,owner)).image.toPNG());preview.bounds(owner,{x:0,y:0,width:1,height:1,visible:false});
   await ui('lt.objs.menu.main_menu();testMenuClick(["Run","Stop"]);ltPreview.pending()');
   check('Original Stop releases the typed preview and all browser quotas',preview.activeCount()===0&&memory.status().jobs===0&&quotaSamples.length>=6&&quotaSamples.every(sample=>sample.metadata?.hardPrivateCommit&&sample.jobs===1));
   await open(isolated);await ui('var isolatedEditor=ltProofUI.connect();var isolatedObject=lt.objs.editor.pool.last_active();var isolatedAt=isolatedEditor.getValue().indexOf("n * 2");isolatedEditor.setSelection(isolatedEditor.posFromIndex(isolatedAt),isolatedEditor.posFromIndex(isolatedAt+5));lt.objs.menu.main_menu();testMenuClick("Watch selection");ltProofUI.pending()');await until(async()=>await widget('isolatedEditor')==='42');
   check('Original isolated TypeScript evaluation retains watch values and verified quota cleanup',await ui('ltProofUI.getLast().result==="42"&&ltProofUI.getLast().source===isolatedEditor.getValue()&&ltProofUI.getLast().memory.hardPrivateCommit&&ltProofUI.getLast().memory.processExited')&&memory.status().jobs===0);
   await open(selection);const selected=await ui('var selectionEditor=ltProofUI.connect();var selectionAt=selectionEditor.getValue().indexOf("({answer:");selectionEditor.setSelection(selectionEditor.posFromIndex(selectionAt),selectionEditor.posFromIndex(selectionEditor.getValue().indexOf(";",selectionAt)));lt.objs.command.exec_BANG_(cljs.core.keyword("eval-editor-form"));ltProofUI.pending()');
   check('Original Eval form dispatch transforms a typed selection in its fresh isolated context',selected.accepted&&selected.result.result==='{"answer":42}'&&selected.result.memory.hardPrivateCommit&&selected.result.memory.processExited&&memory.status().jobs===0);
   for(const item of nodeFiles){
    await open(item.path);await ui('var nodeEditor=ltProofUI.connect();var nodeAt=nodeEditor.getValue().indexOf("n * 2");nodeEditor.setSelection(nodeEditor.posFromIndex(nodeAt),nodeEditor.posFromIndex(nodeAt+5));lt.objs.menu.main_menu();testMenuClick("Watch selection");ltProofUI.pending()');
    const actual=await ui('lt.objs.menu.main_menu();testMenuClick("Run file with Node");ltProofUI.pending()');await until(async()=>await widget('nodeEditor')==='42');
    check('Original '+item.extension.toUpperCase()+' Node execution keeps native module format and typed watches',actual.accepted&&actual.result.result==='42'&&actual.result.logs.join('\n').includes('NODE_FORMAT:'+item.extension+':'+(item.extension==='mts'?'undefined':'function'))&&actual.result.memory.hardPrivateCommit&&actual.result.memory.contextFilesRemoved&&memory.status().jobs===0);
   }
   await ui('nodeEditor.setValue("const amount: number = 42;\\nthrow new Error(\\"node typed failed\\");\\n");lt.objs.menu.main_menu();testMenuClick("Run file with Node");void 0;');const nodeFailure=await ui('ltProofUI.pending()'),nodeSource=await ui('nodeEditor.getValue()'),nodePoint=html.originalLocation(nodeSource,nodeSource.indexOf('new Error'));
   check('Native typed Node errors map through erased annotations to original editor source',!nodeFailure.accepted&&nodeFailure.location?.path===nodeFiles.at(-1).path&&nodeFailure.location.line===nodePoint.line&&nodeFailure.location.column===nodePoint.column+1&&nodeFailure.location.source===nodeSource&&memory.status().jobs===0);
   await ui('document.getElementById("proof-error-open").click();void 0;');check('Typed Node error links select the original editor coordinates',await ui('ltProofUI.connect()===nodeEditor&&nodeEditor.getCursor().line==='+JSON.stringify(nodePoint.line-1)+'&&nodeEditor.getCursor().ch==='+JSON.stringify(nodePoint.column)));
   await ui('nodeEditor.setValue("const amount: number=42;console.log(\\"NODE_TYPED_READY\\");new Promise(()=>{});\\n");lt.objs.menu.main_menu();testMenuClick("Run file with Node");void 0;');await until(()=>ui('document.getElementById("proof-output").textContent.includes("NODE_TYPED_READY")'));await ui('lt.objs.menu.main_menu();testMenuClick(["Run","Stop"]);ltProofUI.pending()');
   check('Original Stop cancels a live typed Node run and closes its complete quota',node.activeCount()===0&&memory.status().jobs===0&&await ui('!ltProofUI.isRunning()&&document.querySelectorAll("#proof-calculation button").length===0'));
   check('Only the trusted fixture Node project receives its explicit native consent response',trustRequests===1);
   result={passed:true,checks,root,quotaSamples,trustRequests};
  }catch(error){result={passed:false,checks,root,quotaSamples,error:error.stack,snapshot:preview.status(owner)};try{result.display=await ui('({activity:document.getElementById("preview-activity").textContent,state:ltPreview.state(),output:document.getElementById("proof-output").textContent,widgets:Array.from(document.querySelectorAll(".watch-result")).map(item=>({status:item.dataset.status,text:item.textContent}))})');}catch(_){}if(result.snapshot?.status==='running')try{result.previewDOM=await value('document.documentElement.outerHTML');}catch(diagnostic){result.previewDOMError=diagnostic.message;}console.error(error);}
  dialog.showMessageBox=originalDialog;await preview.shutdown();await npm.shutdown();await node.shutdown();await js.shutdown();memory.attach=originalAttach;result.cleanup={previewActive:preview.activeCount(),npmActive:npm.activeCount(),nodeActive:node.activeCount(),jsActive:js.activeCount(),...js.diagnostics()};delete result.cleanup.recent;result.passed=result.passed&&result.cleanup.previewActive===0&&result.cleanup.npmActive===0&&result.cleanup.nodeActive===0&&result.cleanup.jsActive===0&&result.cleanup.jobs===0&&result.cleanup.pending===0&&!result.cleanup.helperPid;
  fs.writeFileSync(path.join(policy.root,'typed-editor-result.json'),JSON.stringify(result,null,2));clearTimeout(deadline);app.exit(result.passed?0:1);
 },250));
});
require('../../deploy/core/main.js');
