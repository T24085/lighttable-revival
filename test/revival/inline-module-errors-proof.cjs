'use strict';
const {captureNativePage,capturePreviewPage}=require('./native-page-capture.cjs');
process.env.LT_REVIVAL_TEST='1';
const {app}=require('electron'),fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict');
const policy=require('../../deploy/core/proof-policy.cjs'),projects=require('../../deploy/core/revival-projects.cjs'),memory=require('../../deploy/core/proof-memory.cjs'),html=require('../../deploy/core/revival-html-watches.cjs'),fixture=require('./package-fixtures.cjs');
const root=path.join(policy.root,'inline-module-errors',crypto.randomUUID()),marker='INLINE_MODULE_ERRORS_START:'+path.basename(root),immutable=new Map();
const hash=source=>crypto.createHash('sha256').update(source).digest('hex'),crlf=source=>source.replace(/\r?\n/g,'\r\n');
const write=(name,source)=>{const file=fixture.write(root,name,source);immutable.set(file,fs.readFileSync(file));return file;};
const normalExamples=['bridge-test.txt','calculation.js','input-test.css','large-snapshot.txt','order-report-test.js','order-report.js'].map(name=>path.join(policy.root,'proof-files',name)).map(file=>({path:file,exists:fs.existsSync(file),sha256:fs.existsSync(file)?hash(fs.readFileSync(file)):null}));
const frozenFiles=[__filename,...['main.js','package.json','proof-ui.js','revival-preview.js','revival-preview.cjs','revival-preview-files.cjs','revival-preview-packages.cjs','revival-html-watches.cjs','revival-html-regions.cjs','revival-js-locations.cjs','revival-syntax.cjs'].map(name=>path.resolve(__dirname,'../../deploy/core',name))].map(file=>({path:file,sha256:hash(fs.readFileSync(file))}));
const savedProjects=fs.existsSync(projects.statePath)?fs.readFileSync(projects.statePath):null;
write('package.json',{name:'light-table-inline-module-errors',private:true,version:'1.0.0'});
write('node_modules/inline-leaf/package.json',{name:'inline-leaf',version:'1.0.0',type:'module',exports:'./index.js'});
write('node_modules/inline-leaf/index.js','export default 42;');
const laterBody='const label="😀"; const broken = ;\nglobalThis.inlineLater=broken;';
const ownImportBody='import other from "inline-leaf";\nconst label="😀"; const ownBad = ;\nglobalThis.inlineLater=ownBad;';
const pageSource=crlf([
 '\uFEFF<!doctype html><html><head><meta charset="utf-8"><title>Original inline module diagnostics</title></head><body style="font:20px system-ui;padding:24px;background:#f4f2e8;color:#24352d">',
 '<h1>Original inline module diagnostics</h1><p>Recovered report: <output id="answer">Ready</output></p>',
 '<script>console.log('+JSON.stringify(marker)+');</script>',
 '<script type="module">',
 'import answer from "inline-leaf";',
 'globalThis.inlineAnswer=answer * 1;document.querySelector("#answer").textContent=String(inlineAnswer);',
 '</script>',
 '',
 '<script type="module">'+laterBody+'</script>',
 '</body></html>'
].join('\n')+'\n'),page=write('inline.html',pageSource);
const svgSource=crlf([
 '<!doctype html><html><head><meta charset="utf-8"><title>Original SVG module diagnostics</title></head><body style="font:20px system-ui;padding:24px;background:#f4f2e8;color:#24352d">',
 '<h1>SVG module source recovery</h1><p>Recovered report: <output id="answer">Ready</output></p>',
 '<script>console.log('+JSON.stringify(marker)+');</script>',
 '<script type="module">import answer from "inline-leaf";document.querySelector("#answer").textContent=String(answer);</script>',
 '<svg width="140" height="40" aria-label="SVG module region"><rect width="140" height="40" fill="#517765"/>',
 '<script type="module"><![CDATA[const label="😀";]]><!-- omitted -->const entity=&quot;x&quot;;globalThis.svgCompare=21 &lt; 22;&#x2028;const svgBad = &#59;globalThis.inlineSvgLater=svgBad;</script>',
 '</svg></body></html>'
].join('\n')+'\n'),svg=write('svg.html',svgSource),other=write('other.js','// Error navigation starts from this different original editor.\n42;\n');
projects.activate(root);
const originalAttach=memory.attach,attached=new Map(),attachments=[],quotaSamples=[];
memory.attach=async(...args)=>{const quota=await originalAttach(...args);attached.set(args[0],quota.metadata);attachments.push({pid:args[0],metadata:quota.metadata});return quota;};
app.on('web-contents-created',(_event,wc)=>wc.debugger.on('message',(_event,method,params)=>{if(method!=='Runtime.consoleAPICalled'||!params.args?.some(arg=>arg.value===marker))return;const pid=wc.getOSProcessId();quotaSamples.push({pid,metadata:attached.get(pid)||null,jobs:memory.status().jobs});}));
let seen=false;const deadline=setTimeout(()=>app.exit(2),90000);
app.on('browser-window-created',(_event,window)=>{
 if(seen)return;seen=true;window.setOpacity(0);window.setSkipTaskbar(true);window.setContentSize(900,600);window.showInactive();
 window.webContents.once('did-finish-load',()=>setTimeout(async()=>{
  const preview=require('../../deploy/core/revival-preview.cjs'),npm=require('../../deploy/core/revival-npm.cjs'),node=require('../../deploy/core/revival-node.cjs'),js=require('../../deploy/core/proof-js.cjs'),owner=window.webContents.id,checks=[],locations=[];
  const ui=code=>window.webContents.executeJavaScript(code),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const until=async predicate=>{const end=Date.now()+6000;while(!await predicate()){if(Date.now()>end)throw Error('Inline module error editor condition timed out');await sleep(30);}};
  const check=(label,ok)=>{assert(ok,label);checks.push(label);console.error(label);fs.writeFileSync(path.join(policy.root,'inline-module-errors-editor-progress.json'),JSON.stringify({pid:process.pid,checks}));};
  const open=(file,key)=>ui('lt.objs.command.exec_BANG_(cljs.core.keyword("open-path"),'+JSON.stringify(file)+');var '+key+'Editor=ltProofUI.connect();var '+key+'Object=lt.objs.editor.pool.last_active();void 0;');
  const focus=key=>ui('lt.objs.tabs.active_BANG_('+key+'Object);ltProofUI.connect();'+key+'Editor.focus();void 0;');
  const menu=(labels,pending)=>ui('lt.objs.menu.main_menu();testMenuClick('+JSON.stringify(labels)+');'+(pending?pending+'.pending()':'void 0'));
  const start=()=>menu(['Run','Preview file'],'ltPreview'),refresh=()=>menu(['Run','Refresh preview'],'ltPreview'),stop=()=>menu(['Run','Stop'],'ltPreview');
  const value=async code=>JSON.parse((await preview.evaluate(owner,code)).result),widget=key=>ui(key+'Editor.getWrapperElement().querySelector(".watch-result .full")?.textContent');
  const watch=async(key,text)=>{await focus(key);await ui('var selectedAt='+key+'Editor.getValue().indexOf('+JSON.stringify(text)+');if(selectedAt<0)throw Error("Missing inline watch");'+key+'Editor.setSelection('+key+'Editor.posFromIndex(selectedAt),'+key+'Editor.posFromIndex(selectedAt+'+text.length+'));void 0;');return menu(['Run','Watch selection'],'ltPreview');};
  const error=()=>ui('ltPreview.state().errors.find(item=>item.location)?.location');
  const errorMessage=()=>ui('ltPreview.state().errors.find(item=>item.location)?.message');
  const publicDiagnostic=(message,location)=>typeof message==='string'&&message.startsWith(location.name+':'+location.line+':'+location.column+' - ')&&message.includes('Unexpected token')&&!/acorn|sourceType|\(\d+:\d+\)/i.test(message);
  const errorPoint=(source,text)=>{const offset=source.indexOf(text);assert(offset>=0,'Missing original error token');return {offset,...html.originalLocation(source,offset)};};
  const exact=(location,file,source,point,message)=>{assert(location,'Missing inline source location');assert.equal(location.path,file);assert.equal(location.name,path.relative(root,file));assert.equal(location.source,source);assert.equal(location.sha256,hash(source));assert.equal(location.line,point.line);assert.equal(location.column,point.column+1);assert.equal(location.sourceLine,source.split(/\r\n|\r|\n/)[point.line-1]);assert(!location.source.includes('__lt_watch_'));locations.push({...location,expectedOffset:point.offset,...(message===undefined?{}:{message})});return true;};
  const link=async(key,location,point)=>{await open(other,'other');await ui('Array.from(document.querySelectorAll(".preview-error-link")).find(link=>link.textContent==='+JSON.stringify(location.name+':'+location.line+':'+location.column)+').click();void 0;');return ui('ltProofUI.connect()==='+key+'Editor&&'+key+'Editor.getCursor().line==='+JSON.stringify(point.line-1)+'&&'+key+'Editor.getCursor().ch==='+JSON.stringify(point.column)+'&&document.getElementById("proof-notice").textContent.startsWith("Error at ")');};
  const insert=async(key,text,where)=>{await focus(key);await ui('var repairAt='+key+'Editor.getValue().indexOf('+JSON.stringify(where)+');if(repairAt<0)throw Error("Missing repair token");'+key+'Editor.replaceRange('+JSON.stringify(text)+','+key+'Editor.posFromIndex(repairAt));void 0;');};
  const snapshotFile=(state,file)=>state.project?.files.find(item=>item.path.toLowerCase()===file.toLowerCase());
  let result;
  try{
   await until(()=>ui('!!window.ltProofUI&&!!window.ltProofMenu&&!!window.ltPreview'));await ui(fs.readFileSync(path.join(__dirname,'menu-ui.js'),'utf8'));
   await open(page,'page');const authored=await ui('pageEditor.getValue()'),firstPoint=errorPoint(authored,';\nglobalThis.inlineLater');await start();await until(()=>ui('ltPreview.state()?.status==="stopped"&&ltPreview.state().errors.some(item=>item.location)'));const first=await error(),firstMessage=await errorMessage();
   check('An installed sibling module forces a malformed later inline module to fail before authored code and quota attachment',preview.activeCount()===0&&memory.status().jobs===0&&attachments.length===0&&quotaSamples.length===0&&await ui('ltPreview.state().errors.length>0'));
   check('The actual frontend diagnostic identifies full original HTML and the exact CRLF/emoji UTF16 token',exact(first,page,authored,firstPoint,firstMessage)&&publicDiagnostic(firstMessage,first)&&pageSource.includes('\r\n')&&first.sourceLine.includes('😀')&&first.source.startsWith('\uFEFF'));
   check('Clicking its real source link from another editor activates the original HTML at the authored cursor',await link('page',first,firstPoint));
   await insert('page','42',';\nglobalThis.inlineLater');await refresh();await until(async()=>await value('document.querySelector("#answer")?.textContent')==='42');const repaired=preview.status(owner);
   check('Unsaved repair recovers the actual native page without writing the malformed saved HTML',await value('inlineLater')===42&&snapshotFile(repaired,page)?.source===await ui('pageEditor.getValue()')&&snapshotFile(repaired,page)?.origin==='editor'&&fs.readFileSync(page,'utf8')===pageSource&&!await ui('ltPreview.state().stale'));
   await watch('page','answer * 1');await until(async()=>await widget('page')==='42');const watched=preview.status(owner),watchId=watched.watchSnapshot.specs[0].id;
   check('The original inline watch is current in the valid preceding module before testing a later unwatched failure',watched.watchSnapshot.specs.length===1&&await ui('pageEditor.getWrapperElement().querySelector(".watch-result").dataset.status==="current"')&&await value('document.querySelector("#answer").textContent')==='42');
   await focus('page');await ui('var laterAt=pageEditor.getValue().indexOf("const label=");var laterEnd=pageEditor.getValue().indexOf("</script>",laterAt);pageEditor.replaceRange('+JSON.stringify(ownImportBody)+',pageEditor.posFromIndex(laterAt),pageEditor.posFromIndex(laterEnd));void 0;');await ui('ltPreview.checkSources()');await until(()=>ui('ltPreview.state().stale'));
   check('Editing only the later inline module stales the original watch while the previous native report remains pinned',preview.status(owner).rendererPid===watched.rendererPid&&await value('document.querySelector("#answer").textContent')==='42'&&await ui('pageEditor.getWrapperElement().querySelector(".watch-result").dataset.status==="stale"'));
   const ownAuthored=await ui('pageEditor.getValue()'),ownPoint=errorPoint(ownAuthored,';\nglobalThis.inlineLater'),beforeOwnFailure=quotaSamples.length;await refresh();await until(()=>ui('ltPreview.state()?.status==="stopped"&&ltPreview.state().errors.some(item=>item.location)'));const own=await error(),ownMessage=await errorMessage();
   check('A malformed module after its own valid import preserves the real syntax cause despite earlier watch annotations',exact(own,page,ownAuthored,ownPoint,ownMessage)&&publicDiagnostic(ownMessage,own)&&own.line>ownAuthored.slice(0,ownAuthored.lastIndexOf('import other')).split(/\r\n|\r|\n/).length&&quotaSamples.length===beforeOwnFailure&&preview.activeCount()===0&&memory.status().jobs===0);
   check('The annotated-module error link still uses the raw HTML cursor and captured-source notice',await link('page',own,ownPoint));
   await insert('page','42',';\nglobalThis.inlineLater');await refresh();await until(async()=>await widget('page')==='42');
   check('Refresh after the second unsaved repair recovers page 42 and the same original inline watch ID',await value('inlineLater')===42&&await value('document.querySelector("#answer").textContent')==='42'&&preview.status(owner).watchSnapshot.specs[0].id===watchId&&await ui('pageEditor.getWrapperElement().querySelector(".watch-result").dataset.status==="current"')&&fs.readFileSync(page,'utf8')===pageSource);
   await stop();check('Original Stop releases the repaired annotated HTML preview before the SVG case',preview.activeCount()===0&&memory.status().jobs===0);await focus('page');await menu(['Run','Clear watches']);
   await open(svg,'svg');const svgAuthored=await ui('svgEditor.getValue()'),svgPoint=errorPoint(svgAuthored,'&#59;'),beforeSVGFailure=quotaSamples.length;await start();await until(()=>ui('ltPreview.state()?.status==="stopped"&&ltPreview.state().errors.some(item=>item.location)'));const svgError=await error();
   check('A malformed SVG-in-HTML module also fails before authored startup and releases all preview jobs',quotaSamples.length===beforeSVGFailure&&preview.activeCount()===0&&memory.status().jobs===0);
   check('SVG CDATA comments entities and a decoded Unicode separator restore physical HTML coordinates',exact(svgError,svg,svgAuthored,svgPoint)&&svgError.sourceLine.includes('&#x2028;')&&svgError.sourceLine.includes('<![CDATA[')&&svgError.sourceLine.includes('<!-- omitted -->')&&svgError.sourceLine.includes('😀')&&svgSource.includes('\r\n'));
   check('The real SVG module error link selects the entity in its original HTML rather than decoded script text',await link('svg',svgError,svgPoint));
   await insert('svg','42','&#59;');await refresh();await until(async()=>await value('document.querySelector("#answer")?.textContent')==='42');
   check('Unsaved SVG repair executes the recovered module and preserves the saved malformed markup',await value('inlineSvgLater')===42&&await value('svgCompare')===true&&snapshotFile(preview.status(owner),svg)?.source===await ui('svgEditor.getValue()')&&fs.readFileSync(svg,'utf8')===svgSource);
   await watch('svg','21 &lt; 22');await until(async()=>await widget('svg')==='true');const svgWatched=preview.status(owner),svgWatchId=svgWatched.watchSnapshot.specs[0].id;
   check('Original Watch selection evaluates an encoded SVG expression without changing its entity or CDATA source',await ui('svgEditor.getValue().includes("21 &lt; 22")&&svgEditor.getValue().includes("<![CDATA[")&&svgEditor.getWrapperElement().querySelector(".watch-result").dataset.status==="current"')&&await value('svgCompare')===true);
   await focus('svg');await ui('var compareAt=svgEditor.getValue().indexOf("21 &lt; 22");svgEditor.replaceRange("23",svgEditor.posFromIndex(compareAt),svgEditor.posFromIndex(compareAt+2));void 0;');await ui('ltPreview.checkSources()');await until(()=>ui('ltPreview.state().stale'));
   check('An unsaved encoded SVG edit stales its widget while the native module retains the previous true value',preview.status(owner).rendererPid===svgWatched.rendererPid&&await value('svgCompare')===true&&await ui('svgEditor.getWrapperElement().querySelector(".watch-result").dataset.status==="stale"'));
   await refresh();await until(async()=>await widget('svg')==='false');
   check('Original Refresh recaptures the encoded SVG edit and keeps the same watch at false with page 42',await value('svgCompare')===false&&await value('document.querySelector("#answer").textContent')==='42'&&preview.status(owner).watchSnapshot.specs[0].id===svgWatchId&&await ui('svgEditor.getWrapperElement().querySelector(".watch-result").dataset.status==="current"')&&fs.readFileSync(svg,'utf8')===svgSource);
   await focus('svg');await ui('svgEditor.setOption("lineWrapping",true);svgEditor.refresh();svgEditor.getWrapperElement().querySelector(".watch-result").scrollIntoView({block:"center",inline:"center"});void 0;');const editorImage=await captureNativePage(window.webContents);assert.deepEqual(editorImage.getSize(),{width:900,height:600});fs.writeFileSync(path.join(policy.root,'inline-module-errors-original-editor.png'),editorImage.toPNG());
   check('A nonempty native capture shows the original unsaved SVG editor and its current inline watch',await ui('ltProofUI.connect()===svgEditor&&svgEditor.getWrapperElement().querySelector(".watch-result").dataset.status==="current"')&&await widget('svg')==='false');
   // Let the actual frontend own the full-window capture layout, so its 100ms
   // bounds updates cannot race a backend-only resize back to the editor pane.
   await ui('var captureSlot=document.querySelector(".revival-preview-slot");if(!captureSlot)throw Error("Missing native preview slot");captureSlot.style.cssText="position:fixed;inset:0;visibility:visible;display:block";void 0;');
   await until(()=>{const bounds=preview.view(owner).getBounds();return bounds.x===0&&bounds.y===0&&bounds.width===900&&bounds.height===600;});
   const {image:pageImage}=await capturePreviewPage(preview,owner);assert.deepEqual(pageImage.getSize(),{width:900,height:600});fs.writeFileSync(path.join(policy.root,'inline-module-errors-native-page.png'),pageImage.toPNG());
   check('A nonempty native page capture shows the actual repaired installed-leaf report at 42',await value('document.querySelector("#answer").textContent')==='42'&&await value('inlineSvgLater')===42);
   await stop();check('Stop releases every preview and all authored starts follow verified hard 1 GiB quotas',preview.activeCount()===0&&memory.status().jobs===0&&quotaSamples.length>=6&&quotaSamples.every(sample=>sample.metadata?.hardPrivateCommit&&sample.metadata.limitBytes===1024*1024*1024&&sample.jobs===1)&&attachments.every(item=>item.metadata.hardPrivateCommit&&item.metadata.limitBytes===1024*1024*1024));
   check('Original app/source hashes all six normal example identities and every saved fixture byte remain unchanged',frozenFiles.every(item=>hash(fs.readFileSync(item.path))===item.sha256)&&normalExamples.every(item=>fs.existsSync(item.path)===item.exists&&(!item.exists||hash(fs.readFileSync(item.path))===item.sha256))&&[...immutable].every(([file,bytes])=>fs.readFileSync(file).equals(bytes)));
   result={passed:true,checks,root,locations,quotaSamples,attachments,frozenFiles,normalExamples};
  }catch(error){result={passed:false,checks,root,locations,quotaSamples,attachments,frozenFiles,normalExamples,error:error.stack,snapshot:preview.status(owner)};try{result.display=await ui('({activity:document.getElementById("preview-activity")?.textContent,state:ltPreview.state(),notice:document.getElementById("proof-notice")?.textContent,editors:['+['page','svg','other'].map(key=>'typeof '+key+'Editor==="undefined"?{name:'+JSON.stringify(key)+',opened:false}:{name:'+JSON.stringify(key)+',source:'+key+'Editor.getValue(),cursor:'+key+'Editor.getCursor()}').join(',')+'],widgets:Array.from(document.querySelectorAll(".watch-result")).map(item=>({status:item.dataset.status,text:item.textContent}))})');}catch(diagnostic){result.displayError=diagnostic.message;}if(result.snapshot?.status==='running')try{result.previewDOM=await value('document.documentElement.outerHTML');}catch(diagnostic){result.previewDOMError=diagnostic.message;}console.error(error);}
  try{await preview.shutdown();await npm.shutdown();await node.shutdown();await js.shutdown();}catch(error){result.passed=false;result.cleanupError=error.stack;}finally{memory.attach=originalAttach;if(savedProjects)fs.writeFileSync(projects.statePath,savedProjects);else if(fs.existsSync(projects.statePath))fs.unlinkSync(projects.statePath);}
  result.cleanup={previewActive:preview.activeCount(),npmActive:npm.activeCount(),nodeActive:node.activeCount(),jsActive:js.activeCount(),...js.diagnostics()};delete result.cleanup.recent;
  result.passed=result.passed&&result.cleanup.previewActive===0&&result.cleanup.npmActive===0&&result.cleanup.nodeActive===0&&result.cleanup.jsActive===0&&result.cleanup.jobs===0&&result.cleanup.pending===0&&!result.cleanup.helperPid;
  const firstFailure=path.join(policy.root,'inline-module-errors-editor-first-failure.json');if(!result.passed&&!fs.existsSync(firstFailure))fs.writeFileSync(firstFailure,JSON.stringify(result,null,2));
  fs.writeFileSync(path.join(policy.root,'inline-module-errors-editor-result.json'),JSON.stringify(result,null,2));clearTimeout(deadline);app.exit(result.passed?0:1);
 },250));
});
require('../../deploy/core/main.js');
