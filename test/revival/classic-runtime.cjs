'use strict';
const assert=require('assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const runtime=require('../../deploy/core/revival-classic-runtime.cjs'),compiler=require('../../deploy/core/node_modules/esbuild');
const key='__lt_classic_'+'c'.repeat(32),checks=[];
async function check(label,fn){await fn();checks.push(label);}
function setup(kinds=['require','require-call','dynamic-import','require','require']){
 const state={loads:[],imports:[],failures:0,namespace:{value:42}};
 const context=vm.createContext({
  __probeLoad(id){if(id===3&&state.failures++===0)throw Error('factory failure');state.loads.push(id);return id===4?undefined:{id,state:{count:0}};},
  __probeImport(id){state.imports.push(id);return Promise.resolve(state.namespace);}
 });
 const source=runtime.source(key,kinds.map(kind=>({kind})));
 // Replace only compiler-created dependency thunks. Authored call sites below
 // execute unchanged in a browser-like global environment without Node require.
 const executable=source.replace(/require\("lt-classic-root:(\d+)"\)/g,'__probeLoad($1)').replace(/import\("lt-classic-root:(\d+)"\)/g,'__probeImport($1)');
 vm.runInContext(executable,context);
 return {context,state,source,registry:context[key],fallback:context.require};
}
function configure(run){run.registry.configure(['file:shared','file:shared','file:shared','file:retry','file:undefined']);return run;}
(async()=>{
 await check('Generated bootstrap preserves require versus dynamic import resolver kinds',()=>{
  const run=setup();assert.match(run.source,/require\("lt-classic-root:0"\)/);assert.match(run.source,/require\("lt-classic-root:1"\)/);assert.match(run.source,/import\("lt-classic-root:2"\)/);
  assert.throws(()=>runtime.source('__invalid',[]),/registry key/);assert.throws(()=>runtime.source(key,[{kind:'invalid'}]),/root kind/);assert.throws(()=>runtime.source(key,Array(257).fill({kind:'require'})),/at most 256/);
 });
 await check('Import-only and empty bootstraps retain the native absence of global require',()=>{
  for(const kinds of [[],['import'],['dynamic-import']]){const run=setup(kinds);assert.equal(vm.runInContext('typeof require',run.context),'undefined');assert.equal(Object.hasOwn(run.context,'require'),false);assert.deepEqual(run.state.loads,[]);assert.deepEqual(run.state.imports,[]);}
 });
 await check('Bootstrap, alias configuration and callee selection do not evaluate package bodies',()=>{
  const run=setup();assert.deepEqual(run.state.loads,[]);assert.deepEqual(run.state.imports,[]);assert.throws(()=>run.registry.select(0,run.fallback),/aliases are not configured/);
  configure(run);run.registry.select(0,run.fallback);assert.deepEqual(run.state.loads,[]);assert.deepEqual(run.state.imports,[]);
  const descriptor=vm.runInContext('Object.getOwnPropertyDescriptor(globalThis,"require")',run.context);assert.equal(descriptor.enumerable,false);assert.equal(descriptor.configurable,true);assert.equal(descriptor.writable,true);
 });
 await check('Stable root callees share successful require namespaces by canonical module identity',()=>{
  const run=configure(setup()),selected=run.registry.select(0,run.fallback);assert.equal(selected,run.registry.select(0,run.fallback));
  const first=selected('package');assert.equal(run.registry.select(1,run.fallback)('alias'),first);assert.equal(run.registry.call(0,run.fallback,[]),first);assert.deepEqual(run.state.loads,[0]);
  first.state.count++;assert.equal(run.registry.select(1,run.fallback)().state.count,1);
  assert.equal(run.registry.select(4,run.fallback)(),undefined);assert.equal(run.registry.select(4,run.fallback)(),undefined);assert.deepEqual(run.state.loads,[0,4]);
 });
 await check('Custom callees retain direct-call this, argument values and optional-call short circuit',()=>{
  const run=configure(setup()),custom=function(a,b){'use strict';return {self:this,args:[a,b]};};run.context.custom=custom;
  assert.equal(run.registry.select(99,custom),custom);assert.equal(run.registry.select(99,null),null);assert.equal(run.registry.select(99,undefined),undefined);
  const direct=vm.runInContext(key+'.select(99,custom)("one","two")',run.context);assert.equal(direct.self,undefined);assert.deepEqual(direct.args,['one','two']);
  const called=run.registry.call(99,custom,['one','two']);assert.equal(called.self,undefined);assert.deepEqual(called.args,['one','two']);
  run.context.sideEffects=0;vm.runInContext(key+'.select(99,undefined)?.(++sideEffects);'+key+'.select(99,null)?.(++sideEffects)',run.context);assert.equal(run.context.sideEffects,0);assert.deepEqual(run.state.loads,[]);
 });
 await check('Token replacement preserves argument evaluation, spread order and the captured original callee',()=>{
  const run=configure(setup());run.context.effects=[];
  vm.runInContext('globalThis.result='+key+'.select(0,require)(...((effects.push("spread"),["package"])),(effects.push("last"),require=()=>"replacement"));',run.context);
  assert.deepEqual(Array.from(run.context.effects),['spread','last']);assert.equal(run.context.result.id,0);assert.deepEqual(run.state.loads,[0]);assert.equal(vm.runInContext(key+'.select(0,require)("package")',run.context),'replacement');
 });
 await check('Classic lexical and global function declarations shadow or replace the writable fallback',()=>{
  for(const declaration of ['let require=(arg)=>"lexical:"+arg;','function require(arg){return "global:"+arg;}']){
   const run=configure(setup());vm.runInContext(declaration,run.context);vm.runInContext('globalThis.result='+key+'.select(0,require)("package")',run.context);assert.equal(run.context.result,(declaration.startsWith('let')?'lexical:':'global:')+'package');assert.deepEqual(run.state.loads,[]);
  }
  const run=configure(setup());vm.runInContext('var require;',run.context);assert.equal(run.context.require,run.fallback);assert.equal(run.registry.select(0,run.context.require)().id,0);
 });
 await check('Captured runtime intrinsics survive authored global builtin replacement',async()=>{
  const run=configure(setup());vm.runInContext('Object=Reflect=Map=Promise=Function=Array=Number=Error=TypeError=null',run.context);
  const first=run.registry.call(0,run.fallback,[]);assert.equal(run.registry.select(1,run.fallback)(),first);run.registry.configure(['file:shared','file:shared','file:shared','file:retry','file:undefined']);assert.equal(await run.registry.import(2,'package'),run.state.namespace);await assert.rejects(run.registry.import(2,'package',{}),/import options are not supported yet/);
 });
 await check('Dynamic imports stay lazy and preserve the native cached namespace returned by their thunk',async()=>{
  const run=configure(setup());assert.deepEqual(run.state.imports,[]);const first=await run.registry.import(2,'package');assert.equal(first,run.state.namespace);assert.equal(await run.registry.import(2,'package'),first);assert.deepEqual(run.state.imports,[2,2]);assert.deepEqual(run.state.loads,[]);
 });
 await check('Provided import options reject a Promise after original argument evaluation',async()=>{
  const run=configure(setup());run.context.effects=[];
  const promise=vm.runInContext(key+'.import(2,(effects.push("specifier"),"package"),(effects.push("options"),{}))',run.context);assert.equal(typeof promise.then,'function');await assert.rejects(promise,/import options are not supported yet/);assert.deepEqual(Array.from(run.context.effects),['specifier','options']);assert.deepEqual(run.state.imports,[]);
  await assert.rejects(run.registry.import(2,'package',null),/import options are not supported yet/);assert.equal(await run.registry.import(2,'package',undefined),run.state.namespace);
 });
 await check('Invalid roots and unplanned require calls fail explicitly without publishing a package value',async()=>{
  const run=configure(setup());assert.throws(()=>run.fallback('computed'),/Computed and aliased require calls are not supported yet/);assert.throws(()=>run.registry.select(2,run.fallback),/Invalid planned/);assert.throws(()=>run.registry.select('0',run.fallback),/Invalid planned/);await assert.rejects(run.registry.import(0,'package'),/Invalid planned/);await assert.rejects(run.registry.import(99,'package'),/Invalid planned/);assert.deepEqual(run.state.loads,[]);assert.deepEqual(run.state.imports,[]);
  assert.throws(()=>run.registry.select(3,run.fallback)('retry'),/factory failure/);assert.equal(run.registry.select(3,run.fallback)('retry').id,3);assert.deepEqual(run.state.loads,[3]);
 });
 await check('Canonical aliases are copied, can be configured idempotently and cannot change after installation',()=>{
  const run=setup(),aliases=['file:shared','file:shared','file:shared','file:retry','file:undefined'];run.registry.configure(aliases);aliases[0]='file:other';const value=run.registry.select(0,run.fallback)();assert.equal(run.registry.select(1,run.fallback)(),value);
  run.registry.configure(['file:shared','file:shared','file:shared','file:retry','file:undefined']);assert.throws(()=>run.registry.configure(aliases),/cannot change/);assert.throws(()=>setup().registry.configure(['only one']),/Invalid classic/);assert.throws(()=>setup().registry.configure({0:'file:first'}),/Invalid classic/);
 });
 await check('Per-root memoization is copied, validated and immutable after configuration',()=>{
  const aliases=['file:shared','file:shared','file:shared','file:retry','file:undefined'],flags=[false,true,true,true,false],run=setup();run.registry.configure(aliases,flags);flags[0]=true;
  const first=run.registry.select(0,run.fallback)(),second=run.registry.select(0,run.fallback)();assert.notEqual(first,second);assert.deepEqual(run.state.loads,[0,0]);run.registry.configure(aliases,[false,true,true,true,false]);assert.throws(()=>run.registry.configure(aliases,flags),/memoization cannot change/);assert.throws(()=>run.registry.configure(aliases),/memoization cannot change/);
  assert.equal(run.registry.select(4,run.fallback)(),undefined);assert.equal(run.registry.select(4,run.fallback)(),undefined);assert.deepEqual(run.state.loads,[0,0,4,4]);
  for(const invalid of [[],{},[true,true,true,true,0],[true,true,true,true,undefined]])assert.throws(()=>setup().registry.configure(aliases,invalid),/Invalid classic dependency memoization/);
 });
 await check('Actual esbuild CJS factories expose replacement exports while ESM require namespaces remain stable',async()=>{
  const modules={replacement:'globalThis.cjsModuleLoads=(globalThis.cjsModuleLoads||0)+1;module.exports={value:42,replace(){module.exports={value:63};}};',stable:'globalThis.esmModuleLoads=(globalThis.esmModuleLoads||0)+1;export const value=42;'};
  let built;try{built=await compiler.build({stdin:{contents:'globalThis.cjsFactoryCalls=0;globalThis.esmFactoryCalls=0;globalThis.loadCJS=()=>{globalThis.cjsFactoryCalls++;return require("replacement")};globalThis.loadESM=()=>{globalThis.esmFactoryCalls++;return require("stable")};',resolveDir:__dirname},bundle:true,write:false,format:'iife',platform:'browser',logLevel:'silent',plugins:[{name:'actual-module-exports-fixture',setup(build){build.onResolve({filter:/^(replacement|stable)$/},args=>({path:args.path,namespace:'fixture'}));build.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:modules[args.path],loader:'js'}));}}]});}finally{compiler.stop();}
  const context=vm.createContext({});vm.runInContext(built.outputFiles[0].text,context);const executable=runtime.source(key,[{kind:'require'},{kind:'require'}]).replace('require("lt-classic-root:0")','loadCJS()').replace('require("lt-classic-root:1")','loadESM()');vm.runInContext(executable,context);const registry=context[key],fallback=context.require;registry.configure(['file:replacement.cjs','file:stable.mjs'],[false,true]);
  const initial=registry.select(0,fallback)();assert.equal(initial.value,42);initial.replace();const replacement=registry.select(0,fallback)();assert.equal(replacement.value,63);assert.notEqual(replacement,initial);assert.equal(initial.value,42);assert.equal(registry.select(0,fallback)(),replacement);assert.equal(context.cjsModuleLoads,1);assert.equal(context.cjsFactoryCalls,3);
  const namespace=registry.select(1,fallback)();assert.equal(namespace.value,42);assert.equal(registry.select(1,fallback)(),namespace);assert.equal(context.esmModuleLoads,1);assert.equal(context.esmFactoryCalls,1);
 });
 const result={passed:true,checks};fs.mkdirSync(path.resolve(__dirname,'../../.revival'),{recursive:true});fs.writeFileSync(path.resolve(__dirname,'../../.revival/classic-runtime-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
})().catch(error=>{console.error(error);process.exitCode=1;});
