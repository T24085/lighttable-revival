'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),children=require('node:child_process');
if(process.env.LT_REVIVAL_NPM_GATE_PROBE==='1'){
 const Module=require('node:module'),threads=require('node:worker_threads');
 globalThis[Symbol.for('LightTable.npm.gate.before')]={execArgv:[...process.execArgv],heap:require('node:v8').getHeapStatistics().heap_size_limit,fs:{readFileSync:fs.readFileSync,readFile:fs.readFile,writeFileSync:fs.writeFileSync},module:{load:Module._load,resolve:Module._resolveFilename,register:Module.registerHooks},worker:threads.Worker,children:{spawn:children.spawn,fork:children.fork,execFile:children.execFile}};
 return;
}
const core=path.resolve(__dirname,'../../deploy/core'),preload=path.join(core,'revival-npm-preload.cjs'),argvHelper=path.join(core,'revival-preload-argv.cjs'),npmCli=path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js'),receipt=path.resolve(__dirname,'../../.revival/npm-preload-result.json'),checks=[],evidence=[];
const probe=String.raw`
(async()=>{
 const before=globalThis[Symbol.for('LightTable.npm.gate.before')],fs=require('node:fs'),Module=require('node:module'),threads=require('node:worker_threads'),children=require('node:child_process');
 const hooks={fs:before.fs.readFileSync===fs.readFileSync&&before.fs.readFile===fs.readFile&&before.fs.writeFileSync===fs.writeFileSync,module:before.module.load===Module._load&&before.module.resolve===Module._resolveFilename&&before.module.register===Module.registerHooks,worker:before.worker===threads.Worker,children:before.children.spawn===children.spawn&&before.children.fork===children.fork&&before.children.execFile===children.execFile};
 let streaming;
 if(process.env.LT_REVIVAL_NPM_GATE_INSTALL==='1'){
  const fetch=Module.createRequire(process.argv[1])('minipass-fetch'),body=require('node:stream').Readable.from([Buffer.from('{"answer":'),Buffer.from('42,"nested":{"items":[true,null,"ok"]}}')]),response=new fetch.Response(body),value=await response.json();
  let reused=false;try{await response.json();}catch(error){reused=/body used already/.test(error.message);}
  streaming={value,reused};
 }
 process.stdout.write(JSON.stringify({entered:true,cache:Object.keys(require.cache),before:before.execArgv,after:process.execArgv,hooks,heapUnchanged:before.heap===require('node:v8').getHeapStatistics().heap_size_limit,...(streaming?{streaming}:{})})+'\n');
})().catch(error=>{console.error(error.stack);process.exitCode=1;});`;
function run(signal,{install=false,duplicate=false}={}){
 const flags=[...(install?['--max-old-space-size=96','--max-semi-space-size=4']:[]),'--stack-trace-limit=17','--require',__filename,'--require',preload,...(duplicate?['-r',preload]:[]),'-e',probe,npmCli],env={...process.env,LT_REVIVAL_NPM_GATE_PROBE:'1',LT_REVIVAL_NPM_GATE_INSTALL:install?'1':'0'};delete env.NODE_OPTIONS;delete env.ELECTRON_RUN_AS_NODE;
 const result=children.spawnSync(process.execPath,flags,{cwd:core,windowsHide:true,input:typeof signal==='string'?signal:JSON.stringify(signal),encoding:'utf8',timeout:5000,maxBuffer:65536,env});
 if(result.error)throw result.error;return result;
}
function successful(signal,options){const result=run(signal,options);assert.equal(result.status,0,result.stderr);assert.equal(result.signal,null);const value=JSON.parse(result.stdout);assert.equal(value.entered,true);assert.deepEqual(value.hooks,{fs:true,module:true,worker:true,children:true});assert.equal(value.heapUnchanged,true);assert(!value.cache.some(file=>/revival-node-context|proof-watches|revival-syntax|proof-modules|revival-compiler-config|[\\/]esbuild[\\/]|[\\/]acorn[\\/]|[\\/]@babel[\\/]|[\\/]@jridgewell[\\/]/.test(file)),value.cache.join('\n'));assert(value.cache.includes(preload));assert(value.cache.includes(argvHelper));evidence.push({cache:value.cache,after:value.after,heapUnchanged:value.heapUnchanged});return value;}
function check(name,fn){fn();checks.push(name);}
let result;
try{
 check('Actual server launch gate loads only its argv helper and preserves native hooks and flags',()=>{const value=successful({ready:true});assert.deepEqual([...value.cache].sort(),[__filename,preload,argvHelper].sort());assert.deepEqual(value.after,['--stack-trace-limit=17','--require',__filename,'-e',probe]);});
 check('Repeated private preload pairs are removed while unrelated preload and runtime options remain',()=>{const value=successful({ready:true},{duplicate:true});assert.deepEqual(value.after,['--stack-trace-limit=17','--require',__filename,'-e',probe]);assert.equal(value.before.filter(value=>value===preload).length,2);});
 check('Actual install gate retains streaming JSON and lifecycle-visible flags without compiler imports',()=>{assert(fs.existsSync(npmCli),'The actual Node npm CLI is required for the install preload proof');const value=successful({ready:true,install:true},{install:true});assert(value.cache.includes(path.join(core,'revival-json-stream.cjs')));assert.deepEqual(value.after,['--stack-trace-limit=17','--require',__filename,'-e',probe]);assert.deepEqual(value.streaming,{value:{answer:42,nested:{items:[true,null,'ok']}},reused:true});});
 check('Absent or rejected release signals stop before the trusted entry executes',()=>{for(const signal of [{},null,{ready:false},{ready:1},{ready:false,install:true}]){const value=run(signal);assert.notEqual(value.status,0);assert.equal(value.signal,null);assert.match(value.stderr,/npm launch was not released by Light Table/);assert(!value.stdout.includes('"entered":true'));}});
 check('Malformed release JSON stops before entry execution',()=>{const value=run('{invalid');assert.notEqual(value.status,0);assert.equal(value.signal,null);assert.match(value.stderr,/SyntaxError/);assert(!value.stdout.includes('"entered":true'));});
 result={passed:true,checks,evidence};
}catch(error){result={passed:false,checks,evidence,error:error.stack};process.exitCode=1;}
fs.mkdirSync(path.dirname(receipt),{recursive:true});fs.writeFileSync(receipt,JSON.stringify(result,null,2));process.stdout.write(JSON.stringify(result,null,2)+'\n');
