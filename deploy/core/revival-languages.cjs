'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),{spawn,spawnSync,execFileSync}=require('child_process'),{StringDecoder}=require('string_decoder');
const policy=require('./proof-policy.cjs'),projects=require('./revival-projects.cjs'),memory=require('./proof-memory.cjs');
const sessions=new Map(),versions=new Map(),recent=[],connections=new Map(),configurations=new Map();let runtimes;
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const inside=(file,root)=>{const relative=path.relative(root,file);return relative===''||relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative);};
function discover(){
 if(runtimes)return runtimes;runtimes={};
 const pythonCandidates=[process.env.LT_PYTHON_EXECUTABLE,...(process.env.PATH||'').split(path.delimiter).filter(p=>path.isAbsolute(p)).map(p=>path.join(p,'python.exe')),...['Python313','Python312','Python311'].map(p=>path.join(process.env.LOCALAPPDATA||'', 'Programs/Python',p,'python.exe'))].filter(p=>p&&!p.includes('WindowsApps'));
 for(const candidate of pythonCandidates)try{const executable=fs.realpathSync(candidate),version=execFileSync(executable,['--version'],{windowsHide:true,timeout:3000,maxBuffer:4096}).toString().trim();if(/^Python 3\.(?:1[1-9]|[2-9]\d)\./.test(version)){runtimes.python={executable,version,args:['-I','-S','-u',path.join(__dirname,'revival-python-worker.py')]};break;}}catch(_){}
 const toolchain=path.resolve(__dirname,'../../../toolchain'),jars=[['clojure','1.10.3'],['spec.alpha','0.2.194'],['core.specs.alpha','0.2.56'],['data.json','0.2.6']].map(([name,version])=>path.join(toolchain,'m2/org/clojure',name,version,name+'-'+version+'.jar'));
 const javaCandidates=[process.env.LT_JAVA_EXECUTABLE,...(process.env.PATH||'').split(path.delimiter).filter(p=>path.isAbsolute(p)).map(p=>path.join(p,'java.exe'))].filter(Boolean);
 if(jars.every(p=>fs.existsSync(p)))for(const candidate of javaCandidates)try{const probe=spawnSync(candidate,['-XshowSettings:properties','-version'],{windowsHide:true,timeout:3000,maxBuffer:16384,encoding:'utf8',env:{SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR,PATH:process.env.PATH}}),home=probe.stderr?.match(/^\s*java.home = (.+)$/m)?.[1].trim();if(probe.status!==0||!home)continue;const executable=fs.realpathSync(path.join(home,'bin/java.exe'));if(!fs.statSync(executable).isFile())continue;runtimes.clojure={executable,version:'Clojure 1.10.3',args:['-Xmx1g','-cp',jars.join(path.delimiter),'clojure.main',path.join(__dirname,'revival-clojure-worker.clj')]};break;}catch(_){}
 const node=require('./revival-node.cjs').info();if(node.available&&fs.existsSync(path.join(__dirname,'revival-cljs-worker.js')))runtimes.clojurescript={executable:node.path,version:'ClojureScript 1.10.844 (Node)',args:[path.join(__dirname,'revival-cljs-worker.js')]};
 return runtimes;
}
function languageFor(file){return /\.pyw?$/i.test(file)?'python':/\.cljs$/i.test(file)?'clojurescript':/\.cljc?$/i.test(file)?'clojure':null;}
function prepare(options){
 if(!options||typeof options!=='object'||!['python','clojure','clojurescript'].includes(options.language))throw Error('Choose Python, Clojure or ClojureScript');
 const file=options.path?policy.checked(options.path):null,root=file?projects.info().recents.map(p=>p.path).filter(p=>inside(file,p)).sort((a,b)=>b.length-a.length)[0]:projects.info().current?.path;
 if(!root)throw Error('Open the containing project before connecting a REPL');
 if(file&&languageFor(file)!==options.language)throw Error('Run a .py, .clj, .cljc or .cljs file in its matching language');
 const transport=options.transport||'local';if(!['local','nrepl','ipython'].includes(transport)||transport==='nrepl'&&options.language!=='clojure'||transport==='ipython'&&options.language!=='python')throw Error('Choose a matching REPL transport');
 const endpoint=transport==='nrepl'?require('./revival-nrepl.cjs').endpoint(options).label:transport==='ipython'?require('./revival-ipython.cjs').prepare(options).label:null;
 if(transport==='local'&&!discover()[options.language])throw Error(options.language==='python'?'Python 3.11 or newer was not found. Set LT_PYTHON_EXECUTABLE before launching.':options.language==='clojurescript'?'Rebuild the ClojureScript REPL target and install Node 24+.':'The existing Java/Clojure toolchain was not found. Set LT_JAVA_EXECUTABLE before launching.');
 if(options.source!==undefined&&(typeof options.source!=='string'||Buffer.byteLength(options.source)>2*1024*1024))throw Error('REPL source exceeds 2 MiB');
 if(options.bufferSource!==undefined&&(typeof options.bufferSource!=='string'||Buffer.byteLength(options.bufferSource)>2*1024*1024))throw Error('REPL editor buffer exceeds 2 MiB');
 return {language:options.language,path:file,root:policy.directory(root),transport,endpoint};
}
function info(){return Object.fromEntries(['python','clojure','clojurescript'].map(language=>[language,{available:!!discover()[language],version:discover()[language]?.version||null,executable:discover()[language]?.executable||null}]));}
function status(owner){return [...sessions.values()].filter(s=>s.owner===owner).map(s=>s.snapshot());}
async function connect(owner,options){
 const prepared=prepare(options),key=owner+':'+prepared.language,revision=versions.get(owner)||0;
 configurations.set(key,{root:prepared.root,language:prepared.language,transport:prepared.transport,...(prepared.transport==='nrepl'?{host:options.host,port:options.port}:prepared.transport==='ipython'?{connectionFile:options.connectionFile}:{})});
 if(connections.has(key)){await connections.get(key);return connect(owner,options);}
 const connection=connectSession(owner,options,prepared,key,revision);connections.set(key,connection);try{return await connection;}finally{if(connections.get(key)===connection)connections.delete(key);}
}
async function connectSession(owner,options,prepared,key,revision){
 for(const other of [...sessions.values()])if(other.owner===owner&&other.root!==prepared.root)await other.finish('Project changed');
 const existing=sessions.get(key);if(existing){const same=(existing.transport||'local')===prepared.transport&&(!prepared.endpoint||existing.snapshot().endpoint===prepared.endpoint);if(!same||existing.snapshot().status==='stopped'){await existing.finish('REPL connection changed');if(sessions.get(key)===existing)sessions.delete(key);}else{await existing.ready;return existing.snapshot();}}
 if(prepared.transport!=='local'){
  const track=external=>{external.options=prepared.transport==='nrepl'?{host:options.host,port:options.port}:{connectionFile:options.connectionFile};const finish=external.finish;external.finish=async reason=>{const result=await finish(reason);if(sessions.get(key)===external)sessions.delete(key);return result;};sessions.set(key,external);};
  const external=await require(prepared.transport==='nrepl'?'./revival-nrepl.cjs':'./revival-ipython.cjs').connect(owner,prepared,options,track);
  if((versions.get(owner)||0)!==revision){await external.finish('REPL connection cancelled');throw Error('REPL connection cancelled');}sessions.set(key,external);return external.snapshot();
 }
 const runtime=discover()[prepared.language],id=crypto.randomUUID(),args=[...runtime.args];if(prepared.language==='clojure'){const index=args.indexOf('-cp');args[index+1]+=[prepared.root,path.join(prepared.root,'src'),path.join(prepared.root,'resources')].map(file=>path.delimiter+file).join('');}const child=spawn(runtime.executable,args,{cwd:prepared.root,windowsHide:true,stdio:['pipe','pipe','pipe'],env:{SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR,USERPROFILE:process.env.USERPROFILE,TEMP:process.env.TEMP,TMP:process.env.TMP,PATH:process.env.PATH,PYTHONIOENCODING:'utf-8',JAVA_TOOL_OPTIONS:''}});
 let done=false,quota,readyResolve,readyReject,readyReceived=false,pending=null,readyTimer,lifetime,cleanup,stdout='',stderr='',totalBytes=0;const decoder=new StringDecoder('utf8');
 const gate=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});gate.catch(()=>{});
 const session={owner,root:prepared.root,language:prepared.language,child,id,ready:null,snapshot:()=>({id,root:prepared.root,language:prepared.language,status:done?'stopped':pending?'running':'connected',pid:child.pid,version:runtime.version,memory:quota?.metadata||null}),finish:async reason=>{
  if(done)return cleanup;done=true;clearTimeout(readyTimer);clearTimeout(lifetime);if(pending){clearTimeout(pending.timer);pending.reject(Error(reason));pending=null;}readyReject(Error(reason));
  cleanup=(async()=>{try{quota=await attachment;}catch(_){}child.stdin.destroy();if(quota)await quota.release();else child.kill();if(sessions.get(key)===session)sessions.delete(key);recent.push({...session.snapshot(),reason});if(recent.length>16)recent.shift();return session.snapshot();})();return cleanup;
 },evaluate:async request=>{
  await session.ready;if(done)throw Error('REPL stopped');if(pending)throw Error('REPL is already evaluating');
  const result=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>session.finish('Execution exceeded 1500 ms').catch(()=>{}),1500);pending={id:request.id,resolve,reject,timer};child.stdin.write(JSON.stringify(request)+'\n',error=>{if(error)session.finish(error.message).catch(()=>{});});});return result;
 }};
 sessions.set(key,session);const attachment=memory.attach(child.pid,[],runtime.executable,prepared.language==='clojure'?{limitBytes:memory.jvmLimitBytes}:{});
 const maybeReady=()=>{if(readyReceived&&quota&&!done){clearTimeout(readyTimer);readyResolve(session.snapshot());}};
 attachment.then(value=>{quota=value;maybeReady();},error=>session.finish(error.message).catch(()=>{}));
 session.ready=gate;readyTimer=setTimeout(()=>session.finish('REPL startup exceeded 10000 ms').catch(()=>{}),10000);lifetime=setTimeout(()=>session.finish('REPL session reached its 15-minute limit').catch(()=>{}),900000);
 child.stdout.on('data',chunk=>{try{
  totalBytes+=chunk.length;if(totalBytes>128*1024*1024)throw Error('REPL transfer exceeds 128 MiB');stdout+=decoder.write(chunk);if(Buffer.byteLength(stdout)>65536)throw Error('REPL response exceeds 64 KiB');
  let newline;while((newline=stdout.indexOf('\n'))>=0){const text=stdout.slice(0,newline);stdout=stdout.slice(newline+1);const reply=JSON.parse(text);if(reply.fatal)throw Error(reply.fatal);if(reply.ready){readyReceived=true;maybeReady();continue;}if(!pending||reply.id!==pending.id)throw Error('Unexpected REPL response identity');const request=pending;pending=null;clearTimeout(request.timer);request.resolve(reply);}
 }catch(error){session.finish(error.message).catch(()=>{});}});
 child.stderr.on('data',chunk=>{stderr+=chunk.toString();if(Buffer.byteLength(stderr)>32768)session.finish('REPL stderr exceeds 32 KiB').catch(()=>{});});
 child.on('error',error=>session.finish(error.message).catch(()=>{}));child.on('exit',(code,signal)=>{if(!done)session.finish('REPL process exited ('+(signal||code)+')'+(stderr?'\n'+stderr.slice(-4096):'')).catch(()=>{});});
 await gate;if((versions.get(owner)||0)!==revision){await session.finish('REPL connection cancelled');throw Error('REPL connection cancelled');}return session.snapshot();
}
function runOptions(owner,options){const key=owner+':'+options?.language,selected=sessions.get(key),configuration=configurations.get(key),current=selected?{root:selected.root,transport:selected.transport||'local',...selected.options}:configuration;return current&&current.transport!=='local'&&!options.transport&&(!options.path||inside(options.path,current.root))?{...options,...current}:options;}
async function run(owner,options){
 options=runOptions(owner,options);
 const prepared=prepare(options),source=options.source;if(typeof source!=='string')throw Error('Provide source to evaluate');
 await connect(owner,options);const session=sessions.get(owner+':'+prepared.language);if(!session)throw Error('REPL connection stopped');
 let response;try{response=await session.evaluate({id:crypto.randomUUID(),source,path:prepared.path,root:prepared.root});}catch(error){if(session.snapshot().status==='stopped')await session.finish(error.message);throw error;}const sourceHash=hash(source),logs=String(response.logs||'').slice(0,32768).split(/\r?\n/).filter(Boolean).slice(0,128);
 if(response.error){const location={path:prepared.path,name:path.basename(prepared.path),line:Math.max(1,response.error.line||1),column:Math.max(1,response.error.column||1),source,sha256:sourceHash,sourceLine:source.split(/\r\n?|\n/)[Math.max(0,(response.error.line||1)-1)]||''};const error=Error(response.error.message);error.location=location;error.logs=logs;throw error;}
 const value=String(response.value).slice(0,4096),bufferSource=options.bufferSource??source,bufferHash=hash(bufferSource),captured={path:prepared.path,name:path.basename(prepared.path),source:bufferSource,sha256:bufferHash,origin:'editor',exists:true};return {value,result:value,logs,source,sha256:sourceHash,runtime:prepared.language,runtimeVersion:session.snapshot().version,memory:session.snapshot().memory,session:session.snapshot(),watches:[],project:{root:prepared.root,entry:prepared.path,files:[captured],modules:[captured],metadata:[],packages:[],compiler:session.snapshot().version+' persistent REPL',sha256:bufferHash}};
}
async function stop(owner,language){if(language!==undefined&&!['python','clojure','clojurescript'].includes(language))throw Error('Unknown REPL language');versions.set(owner,(versions.get(owner)||0)+1);return Promise.all([...sessions.values()].filter(s=>(owner===undefined||s.owner===owner)&&(!language||s.language===language)).map(s=>s.finish('REPL stopped')));}
async function forget(owner){for(const key of configurations.keys())if(key.startsWith(owner+':'))configurations.delete(key);return stop(owner);}
async function shutdown(){configurations.clear();return stop();}
module.exports={prepare,runOptions,connect,run,stop,forget,shutdown,info,status,activeCount:()=>sessions.size,diagnostics:()=>({sessions:[...sessions.values()].map(s=>s.snapshot()),recent:[...recent],...memory.status()})};
