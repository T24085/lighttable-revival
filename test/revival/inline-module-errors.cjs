'use strict';
process.env.LT_REVIVAL_TEST='1';
const assert=require('assert/strict'),fs=require('fs'),path=require('path'),crypto=require('crypto'),vm=require('vm');
const policy=require('../../deploy/core/proof-policy.cjs'),projects=require('../../deploy/core/revival-projects.cjs'),preview=require('../../deploy/core/revival-preview-files.cjs'),regions=require('../../deploy/core/revival-html-regions.cjs'),compiler=require('../../deploy/core/node_modules/esbuild'),fixture=require('./package-fixtures.cjs');
const root=path.join(policy.root,'inline-module-error-tests',crypto.randomUUID()),receipt=path.resolve(__dirname,'../../.revival/inline-module-errors-result.json'),beforeReceipt=path.resolve(__dirname,'../../.revival/inline-module-errors-before-result.json');
const saved=fs.existsSync(projects.statePath)?fs.readFileSync(projects.statePath):null,checks=[],cases=[];
const hash=source=>crypto.createHash('sha256').update(source).digest('hex');
const trigger='<script type="module">import answer from "inline-leaf";globalThis.packageAnswer=answer;</script>';
const prefix='<!doctype html>\r\n<title>Original 😀 page</title>\r\n<!-- The error must belong to the later authored script, past this document prefix. -->\r\n';
function write(folder,name,source){return fixture.write(folder,name,source);}
function watch(source,text,id){const from=source.indexOf(text);assert(from>=0);return {id,from,to:from+text.length};}
function pointAt(source,index){const lines=source.slice(0,index).split(/\r\n|\r|\n/);return {line:lines.length,column:lines.at(-1).length+1,sourceLine:source.split(/\r\n|\r|\n/)[lines.length-1]};}
function invalidIndex(source){const at=source.indexOf('const invalid = ;');assert(at>=0);return at+'const invalid = '.length;}
function expectedLocation(file,source,index){return {path:file,name:'index.html',...pointAt(source,index),source,sha256:hash(source),loader:null};}
function assertLocation(actual,expected){
 assert(actual,'Compiler failure needs an original HTML location');assert.equal(actual.path,expected.path);assert.equal(actual.name,expected.name);assert.equal(actual.source,expected.source);assert.equal(actual.sha256,expected.sha256);assert.equal(actual.loader,undefined);
 assert.equal(actual.line,expected.line,'Failure must use the authored HTML line');assert.equal(actual.column,expected.column,'Failure must use the authored UTF-16 column');assert.equal(actual.sourceLine,expected.sourceLine,'Failure must include the exact original physical line');
}
function locationView(location){if(!location)return null;const {path:filename,name,line,column,sourceLine,source,sha256,loader}=location;return {path:filename,name,line,column,sourceLine,source,sha256,loader:loader??null};}
function errorView(error){return {name:error.name,message:error.message,location:locationView(error.location),compilerErrors:(error.errors||[]).map(item=>({text:item.text,location:item.location,detailLocation:locationView(item.detail?.location)})).slice(0,4)};}
async function check(name,fn){
 const folder=path.join(root,String(cases.length+1).padStart(2,'0')),detail={name};fs.mkdirSync(folder,{recursive:true});projects.activate(folder);
 fixture.install(folder,'inline-leaf',{exports:'./index.mjs'},{'index.mjs':'export default 42;'});
 try{await fn(folder,detail);checks.push(name);cases.push({...detail,passed:true});}catch(error){cases.push({...detail,passed:false,error:error.stack});}
}
function assertCaptured(page,file,source,disk){
 const item=page.snapshot().files.find(item=>item.path.toLowerCase()===file.toLowerCase());assert(item,'Original HTML snapshot is missing');
 assert.equal(item.source,source);assert.equal(item.sha256,hash(source));assert.equal(item.loader,undefined);assert.equal(item.type,'text/html');
 assert.equal(fs.readFileSync(file,'utf8'),disk,'Compilation must preserve the saved HTML bytes');
}
async function failure(folder,detail,source,options={},disk=source,index=invalidIndex(source)){
 const file=write(folder,'index.html',disk),expected=expectedLocation(file,source,index);detail.expected=expected;
 let page,error,phase='prepare';
 try{
  try{page=preview.prepare({path:file,...options},'lt-preview://inline-module-errors');phase='compile';await page.compile();}catch(caught){error=caught;}
  assert(error,'Malformed authored module must reject before browser execution');detail.phase=phase;detail.actual=errorView(error);
  if(page)assertCaptured(page,file,source,disk);else assert.equal(fs.readFileSync(file,'utf8'),disk);
  assertLocation(error.location,expected);
  if(phase==='compile'){assert.equal(error.message,'index.html:'+expected.line+':'+expected.column+' - Unexpected token');assert.doesNotMatch(error.message,/acorn[\\/]dist|Build failed/);assert(error.errors?.length,'Detailed compiler diagnostics must remain available');assert(error.errors.some(item=>/Unexpected token/.test(item.text)));}
 }finally{await page?.close();}
}
async function executeModules(page){
 const observed=[],context=vm.createContext(page.watch?{[page.watch.key]:(id,value)=>{observed.push({id,value});return value;}}:{}),modules=new Map();
 async function module(address){if(modules.has(address))return modules.get(address);const item=new vm.SourceTextModule(page.response(page.fromURL(address)).toString('utf8'),{context,identifier:address,initializeImportMeta:meta=>{meta.url=address;}});modules.set(address,item);return item;}
 const link=(specifier,owner)=>module(new URL(specifier,owner.identifier).href);
 for(const match of page.html.matchAll(/<script\b([^>]*)>[\s\S]*?<\/script>/g)){if(!/\btype="module"/.test(match[1]))continue;const address=match[1].match(/\bsrc="([^"]+)"/)?.[1];assert(address,'Compiled fixture modules must have captured entries');const item=await module(new URL(address,page.url).href);if(item.status==='unlinked')await item.link(link);await item.evaluate();}
 return observed;
}
(async()=>{let result;try{
 await check('An earlier installed-package module forces actual compilation while retaining original HTML identity',async(folder,detail)=>{
  const source=prefix+trigger+'\r\n<script type="module">globalThis.laterAnswer=42;</script>',file=write(folder,'index.html',source),page=preview.prepare({path:file},'lt-preview://inline-module-errors');
  try{await page.compile();assert.match(page.snapshot().compiler,/^esbuild /);assert(page.snapshot().outputs.some(item=>item.type==='text/javascript'));assert(page.snapshot().files.some(item=>item.path===path.join(folder,'node_modules','inline-leaf','index.mjs')));assertCaptured(page,file,source,source);detail.compiler=page.snapshot().compiler;}finally{await page.close();}
 });
 await check('A later no-watch module parser error links to exact authored CRLF and emoji coordinates',async(folder,detail)=>{
  const source=prefix+trigger+'\r\n<h1>🦉 Later module</h1>\r\n<script type="module">const label="😀"; const invalid = ;</script>';await failure(folder,detail,source);
 });
 await check('A malformed module with its own valid import reports the bad const token rather than a script-grammar import error',async(folder,detail)=>{
  const source=prefix+trigger+'\r\n<script type="module">import answer from "inline-leaf";const label="😀"; const invalid = ;</script>';await failure(folder,detail,source);
  assert.match(detail.actual.message,/Unexpected token/);assert.doesNotMatch(detail.actual.message,/only with 'sourceType: module'/);
 });
 await check('A later module parser error preserves lone-CR physical lines and exact original sourceLine',async(folder,detail)=>{
  const source=prefix.replace(/\r\n/g,'\r')+trigger+'\r<script type="module">const label="😀";\rconst invalid = ;</script>';await failure(folder,detail,source);
  assert.equal(detail.actual.location.sourceLine,'const invalid = ;</script>');
 });
 await check('Earlier valid inline watches and source annotations do not shift a later module parser error',async(folder,detail)=>{
  const source=prefix+'<script>globalThis.classicAnswer=21 * 2;</script>\r\n'+trigger.replace('globalThis.packageAnswer=answer;','globalThis.packageAnswer=answer;globalThis.watched=(20 + 22);')+'\r\n<script type="module">const label="😀"; const invalid = ;</script>';
  await failure(folder,detail,source,{watches:[watch(source,'21 * 2','classic'),watch(source,'20 + 22','module')]});
 });
 await check('An SVG module parser error restores CDATA, decoded entities and authored UTF-16 coordinates',async(folder,detail)=>{
  const source=prefix+trigger+'\r\n<svg>\r\n<script type="module"><![CDATA[const cdata="😀";const comparison=21 < 22;]]>\r\nconst label=&quot;🦉&quot;; const invalid = ;</script>\r\n</svg>',block=regions.blocks(source).at(-1);
  assert.equal(block.module,true);assert.equal(block.namespace,'http://www.w3.org/2000/svg');assert(block.source.includes('const label="🦉"'));assert(block.source.includes('21 < 22'));await failure(folder,detail,source);
 });
 for(const [entity,label] of [['&#x2028;','U+2028'],['&#x2029;','U+2029']])await check('An SVG module decoded '+label+' error retains physical HTML coordinates',async(folder,detail)=>{
  const source=prefix+trigger+'\r\n<svg><script type="module">const label=&quot;😀&quot;;'+entity+'const invalid = ;</script></svg>',block=regions.blocks(source).at(-1);
  assert.equal(block.module,true);assert(block.source.includes(label==='U+2028'?'\u2028':'\u2029'));await failure(folder,detail,source);
 });
 await check('Unsaved later-module failures retain current HTML hashes without modifying the saved page',async(folder,detail)=>{
  const disk=prefix+trigger+'\r\n<script type="module">const valid=42;</script>',source=prefix+trigger+'\r\n<script type="module">const label="😀"; const invalid = ;</script>',file=path.join(folder,'index.html');
  await failure(folder,detail,source,{buffers:[{path:file,source}]},disk);
 });
 await check('An HTML module EOF error after sourceURL annotations maps to the original executable boundary',async(folder,detail)=>{
  const source=prefix+'<script>globalThis.earlier=21 * 2;</script>\r\n'+trigger+'\r\n<script type="module">import answer from "inline-leaf";\r\nconst label="😀";const unfinished = </script>',index=source.indexOf('</script>',source.indexOf('const unfinished'));
  await failure(folder,detail,source,{watches:[watch(source,'21 * 2','before-eof')]},source,index);assert.match(detail.actual.message,/Unexpected token/);assert.doesNotMatch(detail.actual.message,/only with 'sourceType: module'/);
 });
 await check('An SVG CDATA module EOF error maps before the closing delimiter after sourceURL annotations',async(folder,detail)=>{
  const source=prefix+'<script>globalThis.earlier=21 * 2;</script>\r\n'+trigger+'\r\n<svg>\r\n<script type="module"><![CDATA[import answer from "inline-leaf";\r\nconst label="😀";const unfinished = ]]></script>\r\n</svg>',index=source.indexOf(']]>',source.indexOf('const unfinished')),block=regions.blocks(source).at(-1);
  assert.equal(block.module,true);assert.equal(block.namespace,'http://www.w3.org/2000/svg');assert(block.source.endsWith('const unfinished = '));
  await failure(folder,detail,source,{watches:[watch(source,'21 * 2','before-svg-eof')]},source,index);assert.match(detail.actual.message,/Unexpected token/);assert.doesNotMatch(detail.actual.message,/only with 'sourceType: module'/);
 });
 await check('An esbuild missing export in a valid later inline module retains lone-CR sourceLine and exact cursor',async(folder,detail)=>{
  const source=prefix.replace(/\r\n/g,'\r')+trigger+'\r<script type="module">\rconst label="😀";import {missing} from "inline-leaf";globalThis.later=missing;</script>',file=write(folder,'index.html',source),expected=expectedLocation(file,source,source.indexOf('{missing}')+1),page=preview.prepare({path:file},'lt-preview://inline-module-errors');detail.expected=expected;
  try{let error;try{await page.compile();}catch(caught){error=caught;}assert(error);detail.actual=errorView(error);assert.match(error.message,/No matching export/);assertLocation(error.location,expected);assertCaptured(page,file,source,source);}finally{await page.close();}
 });
 await check('A compiled inline runtime throw restores lone-CR physical snippets after original watch instrumentation',async(folder,detail)=>{
  const source=prefix.replace(/\r\n/g,'\r')+trigger+'\r<script type="module">const watched=21 * 2;\rconst label="😀";throw new Error("compiled inline runtime failure");</script>',file=write(folder,'index.html',source),expected=expectedLocation(file,source,source.indexOf('new Error(')),page=preview.prepare({path:file,watches:[watch(source,'21 * 2','before-runtime-error')]},'lt-preview://inline-module-errors');detail.expected=expected;
  try{await page.compile();assert.match(page.snapshot().compiler,/^esbuild /);let error;try{await executeModules(page);}catch(caught){error=caught;}assert(error);assert.equal(error.message,'compiled inline runtime failure');const match=String(error.stack).match(/(lt-preview:\/\/[^\s)]+):(\d+):(\d+)/);assert(match,String(error.stack));const location=page.mapLocation(match[1],Number(match[2]),Number(match[3]));detail.actual={message:error.message,location:locationView(location),stack:error.stack};assertLocation(location,expected);assertCaptured(page,file,source,source);}finally{await page.close();}
 });
 await check('A watch in the malformed module rejects during planning with the exact authored HTML location',async(folder,detail)=>{
  const source=prefix+trigger+'\r\n<script type="module">const label="😀"; const invalid = ;globalThis.later=21 * 2;</script>';
  await failure(folder,detail,source,{watches:[watch(source,'21 * 2','later')]});assert.equal(detail.phase,'prepare');
 });
 await check('Malformed typed MIME data blocks remain inert while an earlier installed-package module compiles',async(folder,detail)=>{
  const source=prefix+trigger+'\r\n<script type="text/typescript">const invalid = ;</script><script type="text/jsx"><broken></script>',file=write(folder,'index.html',source),page=preview.prepare({path:file},'lt-preview://inline-module-errors');
  try{assert.equal(regions.blocks(source).length,1);await page.compile();assert.match(page.snapshot().compiler,/^esbuild /);assert(page.html.includes('<script type="text/typescript">const invalid = ;</script>'));assert(page.html.includes('<script type="text/jsx"><broken></script>'));assertCaptured(page,file,source,source);detail.compiler=page.snapshot().compiler;}finally{await page.close();}
 });
 const failures=cases.filter(item=>!item.passed);result={passed:!failures.length,checks,checkCount:checks.length,caseCount:cases.length,cases,root};if(failures.length)process.exitCode=1;
 }catch(error){result={passed:false,checks,checkCount:checks.length,caseCount:cases.length,cases,root,error:error.stack};process.exitCode=1;}finally{
  compiler.stop();if(saved)fs.writeFileSync(projects.statePath,saved);else if(fs.existsSync(projects.statePath))fs.unlinkSync(projects.statePath);
  result.sourceSha256={previewPackages:hash(fs.readFileSync(path.resolve(__dirname,'../../deploy/core/revival-preview-packages.cjs'))),htmlRegions:hash(fs.readFileSync(path.resolve(__dirname,'../../deploy/core/revival-html-regions.cjs'))),test:hash(fs.readFileSync(__filename))};
  fs.mkdirSync(path.dirname(receipt),{recursive:true});fs.writeFileSync(receipt,JSON.stringify(result,null,2));if(!result.passed&&!fs.existsSync(beforeReceipt))fs.writeFileSync(beforeReceipt,JSON.stringify(result,null,2));process.stdout.write(JSON.stringify(result,null,2)+'\n');
 }
})();
