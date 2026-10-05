'use strict';
process.env.LT_REVIVAL_TEST='1';
const assert=require('assert/strict'),fs=require('fs'),path=require('path'),crypto=require('crypto'),vm=require('vm'),{createRequire}=require('module');
const policy=require('../../deploy/core/proof-policy.cjs'),projects=require('../../deploy/core/revival-projects.cjs'),loader=require('../../deploy/core/revival-preview-files.cjs'),html=require('../../deploy/core/revival-html-watches.cjs'),runtime=require('../../deploy/core/revival-classic-runtime.cjs'),fixture=require('./package-fixtures.cjs');
const root=path.join(policy.root,'classic-limits-'+crypto.randomUUID()),origin='lt-preview://classic-limits',checks=[];
const write=(name,source)=>fixture.write(root,name,source);
async function check(label,fn){await fn();checks.push(label);}
async function prepared(source,fn,options={}){
 const entry=write('index.html',source),page=loader.prepare({path:entry,...options},origin);
 try{await page.compile();return await fn(page,entry);}finally{await page.close();}
}
function controlledCompiler(repetitions,analysisMs){
 const file=path.resolve(__dirname,'../../deploy/core/revival-preview-packages.cjs'),nativeRequire=createRequire(file),analyzer=nativeRequire('./revival-browser-dependencies.cjs');
 const clock={now:1000,analyses:0},observed={...analyzer,analyze(source,options){clock.analyses++;clock.now+=analysisMs;return analyzer.analyze(source,options);}};
 // The compiler alone receives a controlled clock. Other tests and the process
 // retain native Date; no timers, native apps or quota helpers are started.
 const sandbox={module:{exports:{}},require:name=>name==='./revival-browser-dependencies.cjs'?observed:nativeRequire(name),Date:{now:()=>clock.now},Map,Set,Buffer,URL,setTimeout,clearTimeout};sandbox.exports=sandbox.module.exports;
 vm.runInNewContext(fs.readFileSync(file,'utf8'),sandbox,{filename:file});
 const entry=path.join(root,'controlled.html'),script=path.join(root,'repeated.js'),document=Array(repetitions).fill('<script src="./repeated.js"></script>').join(''),body='globalThis.repeatedValue=42;';
 const read=file=>{const source=file===entry?document:body;return {path:file,name:path.relative(root,file),source,exists:true,value:Buffer.from(source),byteLength:Buffer.byteLength(source)};};
 const compiler=sandbox.module.exports.create({root,entry,origin,read,checked:file=>path.resolve(file),url:file=>origin+'/'+path.relative(root,file).split(path.sep).join('/'),fromURL:address=>path.join(root,new URL(address).pathname.slice(1)),instrument:()=>({source:document,edits:[]}),watch:null,responseSource:()=>body});
 return {clock,compiler,document,script};
}
function runDeferredCallback(page,writer){
 const setup=page.bootstrap;assert(setup);assert.equal(setup.aliases.length,1);
 const context=vm.createContext({__unavailable(){throw Error('Unexpected fallback dependency execution');}});
 const source=runtime.source(setup.key,[{kind:'require'}]).replace(/require\("lt-classic-root:0"\)/g,'__unavailable()');
 vm.runInContext(source,context);context[setup.key].configure(setup.aliases,setup.memoize);
 for(const block of html.blocks(page.html))if(!block.module)vm.runInContext(block.source,context);
 vm.runInContext(writer,context);
 return vm.runInContext('later()',context);
}
(async()=>{let result;
 try{
  // All filesystem and project activation side effects are deferred until the
  // test executes, so node --check can run during the serialized editor suite.
  write('package.json',{name:'light-table-classic-limits',version:'1.0.0'});projects.activate(root);
  await check('Repeated external resources reuse dependency analysis instead of retaining one AST per tag',async()=>{
   const run=controlledCompiler(32,1);try{const compiled=await run.compiler.compile(run.document);assert.equal(compiled.html,run.document);assert.equal(compiled.outputs.length,0);assert(run.clock.analyses<=2,'One unchanged external resource was analyzed '+run.clock.analyses+' times');}finally{await run.compiler.close();}
  });
  await check('The 5000 ms compiler deadline stops classic planning before repeated work or a native early return',async()=>{
   const run=controlledCompiler(32,5001);try{await assert.rejects(run.compiler.compile(run.document),/5000 ms/);assert(run.clock.analyses<=2,'Expired planning continued analyzing repeated resources');}finally{await run.compiler.close();}
  });
  await check('A transitive native module writer can provide custom require to an earlier classic callback',async()=>{
   const writer='globalThis.require=name=>"transitive:"+name;',file=write('nested-writer.mjs',writer);write('writer-entry.mjs','import "./nested-writer.mjs";globalThis.writerLoaded=true;');
   await prepared('<script>function later(){return require("not-installed-transitive");}</script><script type="module" src="./writer-entry.mjs"></script>',page=>{assert(page.bootstrap);assert.equal(page.read(file).source,writer);assert(page.snapshot().files.some(item=>item.path===file&&item.exists));assert.equal(runDeferredCallback(page,writer),'transitive:not-installed-transitive');});
  });
  await check('Global require writes reached only through a transitive CJS package are analyzed before unresolved classic roots fail',async()=>{
   const dir=fixture.install(root,'writer-package',{}, {'index.cjs':'require("./nested.cjs");module.exports=42;','nested.cjs':'globalThis.require=name=>"package:"+name;'}),nested=path.join(dir,'nested.cjs');
   await prepared('<script>require("writer-package");function later(){return require("not-installed-package-writer");}</script>',page=>{assert(page.bootstrap);assert.equal(page.bootstrap.aliases.length,2);assert.equal(page.read(nested).source,'globalThis.require=name=>"package:"+name;');assert(page.snapshot().files.some(item=>item.path===nested&&item.exists));});
  });
  for(const separator of [8232,8233])for(const kind of ['failed-classic','native-esm'])await check('Native '+kind+' U+'+separator.toString(16).toUpperCase()+' locations restore the authored editor line and column',async()=>{
   const source=kind==='failed-classic'?'globalThis.ready=42;'+String.fromCharCode(separator)+'let = ;':'export const ready=42;'+String.fromCharCode(separator)+'throw new Error("native module failure");',name=kind+'-'+separator+(kind==='native-esm'?'.mjs':'.js'),file=write(name,source),anchor=kind==='failed-classic'?'let':'new Error';
   await prepared('<script'+(kind==='native-esm'?' type="module"':'')+' src="./'+name+'"></script>',page=>{assert.equal(page.bootstrap,undefined);assert.equal((page.snapshot().outputs||[]).length,0);const at=source.indexOf(anchor),engine=html.scriptLocation(source,at),expected=html.originalLocation(source,at),mapped=page.mapLocation(page.urlFor(file),engine.line,engine.column+1);assert.equal(engine.line,2);assert.equal(expected.line,1);assert.equal(mapped.path,file);assert.equal(mapped.line,expected.line);assert.equal(mapped.column,expected.column+1);assert.equal(mapped.source,source);assert.equal(mapped.sha256,crypto.createHash('sha256').update(source).digest('hex'));});
  });
  await check('Watched native ESM locations undo instrumentation and U+2028 script lines together',async()=>{
   const source='export function double(n){return n * 2;}\u2028throw new Error("watched native module failure");',name='watched-native.mjs',file=write(name,source),from=source.indexOf('n * 2');
   await prepared('<script type="module" src="./'+name+'"></script>',page=>{assert.equal(page.bootstrap,undefined);assert.equal((page.snapshot().outputs||[]).length,0);const served=page.response(file).toString('utf8'),engine=html.scriptLocation(served,served.indexOf('new Error')),expected=html.originalLocation(source,source.indexOf('new Error')),mapped=page.mapLocation(page.urlFor(file),engine.line,engine.column+1);assert.equal(mapped.path,file);assert.equal(mapped.line,expected.line);assert.equal(mapped.column,expected.column+1);assert.equal(mapped.source,source);},{watchFiles:[{path:file,source,watches:[{id:'native-double',from,to:from+5}]}]});
  });
  result={passed:true,checks,root};
 }catch(error){result={passed:false,checks,root,error:error.stack};process.exitCode=1;}
 fs.writeFileSync(path.join(policy.root,'classic-limits-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
})();
