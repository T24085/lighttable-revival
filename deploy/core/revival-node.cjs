'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),{spawn,execFileSync}=require('child_process');
const {StringDecoder}=require('string_decoder');
const watchSupport=require('./proof-watches.cjs');
const sourceContext=require('./revival-node-context.cjs');
const policy=require('./proof-policy.cjs'),projects=require('./revival-projects.cjs'),modules=require('./proof-modules.cjs'),packages=require('./proof-packages.cjs'),memory=require('./proof-memory.cjs');
const active=new Map(),recent=[];let runtime;
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const syntax=require('./revival-syntax.cjs'),mapping=require('@jridgewell/trace-mapping'),compilerConfig=require('./revival-compiler-config.cjs');
const inside=(file,root)=>{const r=path.relative(root,file);return r===''||(!path.isAbsolute(r)&&r!=='..'&&!r.startsWith('..'+path.sep));};
function environment(executable){
 const result={};for(const name of ['SystemRoot','WINDIR','COMSPEC','ProgramFiles','ProgramFiles(x86)','USERPROFILE','APPDATA','LOCALAPPDATA','TEMP','TMP','HOMEDRIVE','HOMEPATH'])if(typeof process.env[name]==='string')result[name]=process.env[name];
 result.PATH=[path.dirname(executable),...(process.env.PATH||'').split(path.delimiter).filter(dir=>dir&&path.isAbsolute(dir))].join(path.delimiter);
 result.NO_COLOR='1';return result;
}
function discover(){
 if(runtime)return runtime;
 const candidates=[process.env.LT_NODE_EXECUTABLE,...(process.env.PATH||'').split(path.delimiter).filter(dir=>dir&&path.isAbsolute(dir)).map(dir=>path.join(dir,'node.exe')),path.join(process.env.ProgramFiles||'C:/Program Files','nodejs/node.exe')].filter(Boolean);
 for(const candidate of [...new Set(candidates)])try{
  const executable=path.resolve(candidate);if(!fs.statSync(executable).isFile())continue;
  const version=execFileSync(executable,['--version'],{windowsHide:true,timeout:3000,maxBuffer:4096,env:environment(executable)}).toString().trim();
  if(!/^v(?:2[4-9]|[3-9]\d)\.\d+\.\d+$/.test(version))continue;
  const cli=path.join(path.dirname(executable),'node_modules/npm/bin/npm-cli.js'),manifest=path.join(path.dirname(executable),'node_modules/npm/package.json');
  let npm=null;try{if(fs.statSync(cli).isFile())npm={cli,version:JSON.parse(packages.readText(manifest,65536,'npm manifest exceeds bound')).version};}catch(_){}
  return runtime={executable,version,npm};
 }catch(_){}
 throw Error('Node.js 24 or newer was not found. Install Node or set LT_NODE_EXECUTABLE before launching Light Table.');
}
function rootFor(file){const roots=projects.info(),current=roots.current?.path;if(current&&inside(file,current))return policy.directory(current);const root=roots.recents.map(item=>item.path).filter(root=>inside(file,root)).sort((a,b)=>b.length-a.length)[0];if(!root)throw Error('Open the containing project before running Node.');return policy.directory(root);}
function scripts(root=projects.info().current?.path){
 if(!root)return [];try{const json=JSON.parse(packages.readText(policy.checked(path.join(root,'package.json')),65536,'package.json exceeds 64 KiB'));return Object.entries(json.scripts||{}).filter(([name,command])=>name.length>0&&name.length<=80&&!/[\x00-\x1f]/.test(name)&&typeof command==='string'&&command.length<=8192).map(([name])=>name).slice(0,64);}catch(_){return [];}
}
function info(){try{const node=discover();return {available:true,path:node.executable,version:node.version,npmVersion:node.npm?.version||null,scripts:scripts()};}catch(error){return {available:false,error:error.message,scripts:[]};}}
function initialInputs(root){
 const inputs=[];let bytes=0,paths=0;
 function visit(dir,depth){if(depth>20)throw Error('Project nesting exceeds 20 folders');for(const item of fs.readdirSync(policy.checked(dir),{withFileTypes:true})){
  if(++paths>4096)throw Error('Project input scan exceeds 4096 paths');if(['node_modules','.git','.revival','dist','build'].includes(item.name))continue;
  const file=policy.checked(path.join(dir,item.name));if(item.isDirectory())visit(file,depth+1);else if(item.isFile()&&/\.(?:js|mjs|cjs|json|ts|tsx|mts|cts|jsx|html|css|scss|md|yml|yaml)$/.test(item.name)){
   if(inputs.length>=256)throw Error('Project input snapshot exceeds 256 files');const source=packages.readText(file,2*1024*1024,'Project input exceeds 2 MiB: '+item.name);bytes+=Buffer.byteLength(source);if(bytes>8*1024*1024)throw Error('Project inputs exceed 8 MiB');inputs.push({path:file,name:path.relative(root,file),source,sha256:hash(source),origin:'disk',...(/\.(?:[cm]?js|jsx|[cm]?ts|tsx)$/i.test(file)?{loader:syntax.effectiveLoader(file)}:{})});
  }
 }}visit(root,0);return inputs;
}
function prepare(options){
 if(!options||typeof options!=='object'||Array.isArray(options)||typeof options.path!=='string')throw Error('Invalid Node run');
 const entry=policy.checked(options.path),root=rootFor(entry),node=discover();
 if(options.loader!==undefined&&!/\.(?:[cm]?js|jsx|[cm]?ts|tsx)$/i.test(entry))throw Error('Source grammar is only available for JavaScript-family files');
 const loaders=new Map();for(const [items,limit] of [[options.buffers,256],[options.watchFiles,64]]){if(items!==undefined&&(!Array.isArray(items)||items.length>limit))throw Error('Node buffers or watched files exceed their path limit');for(const item of items||[]){if(!item||typeof item.path!=='string')throw Error('Invalid Node source path');if(item.loader!==undefined&&!/\.(?:[cm]?js|jsx|[cm]?ts|tsx)$/i.test(item.path))throw Error('Source grammar is only available for JavaScript-family files');const loader=syntax.effectiveLoader(item.path,item.loader),key=path.resolve(item.path).toLowerCase();if(item.loader!==undefined){if(loaders.has(key)&&loaders.get(key)!==loader)throw Error('Watched grammar differs from its Node buffer');loaders.set(key,loader);}}}
 const sourceLoader=syntax.effectiveLoader(entry,options.loader===undefined?loaders.get(entry.toLowerCase()):options.loader);loaders.set(entry.toLowerCase(),sourceLoader);
 const loaderFor=file=>syntax.effectiveLoader(file,loaders.get(file.toLowerCase()));
 if(typeof options.source!=='string'||Buffer.byteLength(options.source)>2*1024*1024)throw Error('Node source exceeds 2 MiB');
 const source=options.source,buffers=new Map();let bytes=Buffer.byteLength(source);
 if(options.buffers!==undefined){if(!Array.isArray(options.buffers)||options.buffers.length>256)throw Error('Node buffers exceed 256 files');for(const item of options.buffers){if(typeof item?.source!=='string')throw Error('Invalid Node buffer');const file=policy.checked(item.path);if(!inside(file,root))continue;const size=Buffer.byteLength(item.source);bytes+=size;if(size>2*1024*1024||bytes>8*1024*1024)throw Error('Node buffers exceed the source budget');buffers.set(file.toLowerCase(),{path:file,source:item.source});}}
 buffers.set(entry.toLowerCase(),{path:entry,source});
 function formatFor(file,content){
  const extension=path.extname(file).toLowerCase();if(['.mjs','.mts'].includes(extension))return 'module';if(['.cjs','.cts'].includes(extension))return 'commonjs';if(!['.js','.jsx','.ts','.tsx'].includes(extension))return;
  for(let dir=path.dirname(file);inside(dir,root);dir=path.dirname(dir)){
   const manifest=policy.checked(path.join(dir,'package.json'));if(fs.existsSync(manifest)){const json=JSON.parse(packages.readText(manifest,65536,'package.json exceeds 64 KiB'));if(json.type==='module'||json.type==='commonjs')return json.type;break;}if(dir.toLowerCase()===root.toLowerCase())break;
  }
  const parsed=modules.analysis(content,{filename:file,loader:loaderFor(file)});return parsed.staticImports||parsed.esmExports||parsed.topLevelAwait?'module':'commonjs';
 }
 const key='__lt_node_result_'+crypto.randomBytes(16).toString('hex');let watch;try{watch=options.script===undefined?watchSupport.plan(source,options.watches,options.watchFiles||[],entry,file=>{const checked=policy.checked(file);if(!inside(checked,root))throw Error('Watched file leaves the open project');return checked;},undefined,(text,specs,key,tokens,file,hint)=>watchSupport.instrument(text,specs,key,tokens,{filename:file,loader:file.toLowerCase()===entry.toLowerCase()?sourceLoader:syntax.effectiveLoader(file,hint===undefined?loaders.get(file.toLowerCase()):hint)}),sourceLoader):null;}catch(error){if(error.loc){const file=error.watchPath||entry,original=error.watchSource||source;error.location=location({path:file,name:path.relative(root,file),source:original,sha256:hash(original)},error.loc.line,error.loc.column);}throw error;}const working=watch?.source||source;let code=working,edit=null,input;
 for(const item of watch?.files||[]){if(item.path.toLowerCase()===entry.toLowerCase())continue;const previous=buffers.get(item.path.toLowerCase());if(previous&&previous.source!==item.originalSource)throw Error('Watched source differs from its Node buffer');if(!previous){bytes+=Buffer.byteLength(item.originalSource);if(buffers.size>=256||bytes>8*1024*1024)throw Error('Node buffers exceed the source budget');buffers.set(item.path.toLowerCase(),{path:item.path,source:item.originalSource});}}
 if(options.script!==undefined){
  if(typeof options.script!=='string'||!scripts(root).includes(options.script))throw Error('Choose a script defined in this project package.json.');
  if(!node.npm)throw Error('npm was not found beside the selected Node executable.');
  const manifest=policy.checked(path.join(root,'package.json')),disk=packages.readText(manifest,65536,'package.json exceeds 64 KiB');
  if(entry.toLowerCase()!==manifest.toLowerCase()||source.replace(/\r\n?/g,'\n')!==disk.replace(/\r\n?/g,'\n'))throw Error('Save package.json before running npm scripts.');
  for(const item of buffers.values())if(item.path.toLowerCase()!==entry.toLowerCase()&&item.source.replace(/\r\n?/g,'\n')!==packages.readText(item.path,2*1024*1024,'Project input exceeds 2 MiB').replace(/\r\n?/g,'\n'))throw Error('Save project files before running npm scripts: '+path.relative(root,item.path));
  input=initialInputs(root);
 }else{
  let parsed;try{parsed=modules.analysis(working,{filename:entry,loader:sourceLoader});}catch(error){const point=watchSupport.position(watch,error.loc?.line||1,error.loc?.column||0,source),failure=Error(path.basename(entry)+':'+point.line+':'+(point.column+1)+' - '+error.message);failure.location=location({path:entry,name:path.relative(root,entry),source,sha256:hash(source)},point.line,point.column);throw failure;}
  const last=parsed.ast.body.findLast(modules.runtimeStatement);
  if(!parsed.exports&&last?.type==='ExpressionStatement'){
   const prefix=key+'(';
   code=working.slice(0,last.start)+prefix+working.slice(last.expression.start,last.expression.end)+');'+working.slice(last.end);edit={start:last.start,expressionStart:last.expression.start,expressionEnd:last.expression.end,end:last.end,prefixLength:prefix.length,code};
  }else if(parsed.esmExports){const namespace=key+'_exports';code+='\nimport * as '+namespace+' from '+JSON.stringify(require('url').pathToFileURL(entry).href)+';\n'+key+'('+ (parsed.defaultExport?namespace+'.default':namespace)+');';}
 }
 for(const item of buffers.values()){
  if(path.basename(item.path).toLowerCase()==='package.json'&&item.source.replace(/\r\n?/g,'\n')!==packages.readText(item.path,65536,'package.json exceeds 64 KiB').replace(/\r\n?/g,'\n'))throw Error('Save package.json before running Node.');
  if(options.script===undefined){const extension=path.extname(item.path).toLowerCase();if(item.path.toLowerCase()===entry.toLowerCase())item.format=formatFor(item.path,item.source);else if(['.mjs','.mts'].includes(extension))item.format='module';else if(['.cjs','.cts'].includes(extension))item.format='commonjs';if(/\.(?:[cm]?js|jsx|[cm]?ts|tsx)$/i.test(item.path))item.loader=loaderFor(item.path);}
 }
 return {entry,root,node,source,loader:sourceLoader,code,key,edit,watch,buffers:[...buffers.values()],script:options.script,input,runId:typeof options.runId==='string'?options.runId.slice(0,128):null};
}
function location(item,line,column){const lines=item.source.split('\n');line=Math.max(1,Math.min(lines.length,line));column=Math.max(0,Math.min(lines[line-1].replace(/\r$/,'').length,column));return {path:item.path,name:item.name,line,column:column+1,source:item.source,sourceLine:lines[line-1].replace(/\r$/,''),sha256:item.sha256};}
function failure(prepared,message,stack,snapshots,instrumented=true,configurationLocation){
 const error=Error(message.slice(0,2048));
 const configuration=compilerConfig.validateLocation(configurationLocation,{root:prepared.root,checked:policy.checked});if(configuration){error.location=configuration;error.message=configuration.name+':'+configuration.line+':'+configuration.column+' - '+error.message;return error;}
 const positions=snapshots.filter(item=>item.source).map(item=>{const escaped=item.path.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),url=require('url').pathToFileURL(item.path).href.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');return {item,match:new RegExp('(?:'+escaped+'|'+url+'):(\\d+)(?::(\\d+))?').exec(stack||'')};}).filter(position=>position.match).sort((a,b)=>a.match.index-b.match.index);
 for(const {item,match} of positions){
  let line=Number(match[1]),column=Math.max(0,Number(match[2]||1)-1);
  const transformMap=!instrumented&&item.secondaryTransformMap?item.secondaryTransformMap:item.transformMap;
  if(transformMap){const point=mapping.originalPositionFor(new mapping.TraceMap(transformMap),{line,column});if(point.source===null||point.line===null||path.normalize(point.source).toLowerCase()!==path.normalize(item.path).toLowerCase())continue;line=point.line;column=point.column;}
  if(instrumented&&item.path.toLowerCase()===prepared.entry.toLowerCase()&&prepared.edit){const edit=prepared.edit,lines=edit.code.split('\n');let offset=column;for(let i=0;i<line-1;i++)offset+=(lines[i]?.length||0)+1;const expression=edit.start+edit.prefixLength,end=expression+edit.expressionEnd-edit.expressionStart,trailer=end+2;if(offset>=trailer)offset=edit.end+offset-trailer;else if(offset>=end)offset=edit.expressionEnd;else if(offset>=expression)offset=edit.expressionStart+offset-expression;else if(offset>=edit.start)offset=edit.expressionStart;offset=watchSupport.offset(prepared.watch,offset);const before=item.source.slice(0,offset);line=before.split('\n').length;column=offset-(before.lastIndexOf('\n')+1);}
  if(!(instrumented&&item.path.toLowerCase()===prepared.entry.toLowerCase()&&prepared.edit)){const point=watchSupport.position(watchSupport.forFile(prepared.watch,item.path),line,column,item.source);line=point.line;column=point.column;}error.location=location(item,line,column);error.message=error.location.name+':'+error.location.line+':'+error.location.column+' - '+error.message;break;
 }return error;
}
function cancel(owner){return active.get(owner)?.finish(Error('Execution cancelled'))||Promise.resolve();}
function run(owner,options,progress=()=>{}){
 const previous=cancel(owner);return new Promise((resolve,reject)=>{
  let prepared,child,done=false,timer,attachment,cleanup,report,stdout='',stderr='',outputBytes=0,reportBytes=0,diagnosticFailure=false,diagnosticStack='';const reportChunks=[];
  const job={finish,pid:0};active.set(owner,job);
  function finish(error){
   if(done)return cleanup;done=true;clearTimeout(timer);
   cleanup=(async()=>{await previous;let quota,accounting;try{quota=await attachment;}catch(failure){error=error||failure;}
    if(quota)try{accounting=await quota.release();}catch(failure){error=error||failure;}
    else if(child&&child.exitCode===null&&!child.killed)child.kill();
    if(child&&child.exitCode===null&&child.signalCode===null)await new Promise(res=>{const timeout=setTimeout(res,2000);child.once('close',()=>{clearTimeout(timeout);res();});});
    try{if(report&&prepared?.context)sourceContext.mergeReport(prepared,report);}catch(failure){error=error||failure;}
    // Prior handled child stderr cannot give Stop, timeout, output or quota
    // failures a configuration link. Only an actual failed execution can.
    if(error&&diagnosticFailure&&prepared?.context&&error.location?.kind!=='compiler-configuration')try{const diagnostic=compilerConfig.validateLocation(sourceContext.diagnostic({root:prepared.root,key:prepared.key,family:prepared.context},error,diagnosticStack),{root:prepared.root,checked:policy.checked});if(diagnostic){error.location=diagnostic;error.message=diagnostic.name+':'+diagnostic.line+':'+diagnostic.column+' - '+error.message;}}catch(failure){error=error||failure;}
    try{sourceContext.cleanup(prepared?.context);if(accounting)accounting.contextFilesRemoved=true;}catch(failure){error=error||failure;}
    if(active.get(owner)===job)active.delete(owner);
    if(error){error.logs=[stdout&&'stdout: '+stdout,stderr&&'stderr: '+stderr].filter(Boolean);recent.push({pid:job.pid,error:error.message,memory:quota?{...quota.metadata,...accounting}:null});if(recent.length>16)recent.shift();reject(error);return;}
    const snapshots=prepared.script?prepared.input:validateSnapshots(report?.snapshots||[],prepared),metadata=report?.metadata?validateSnapshots(report.metadata,prepared,true):[];
    const byName=(a,b)=>a.name.localeCompare(b.name);const graphHash=hash(JSON.stringify({modules:snapshots.map(item=>({name:item.name,sha256:item.sha256,...(item.loader?{loader:item.loader}:{})})).sort(byName),metadata:metadata.map(item=>({name:item.name,sha256:item.sha256})).sort(byName)}));
    const project={root:prepared.root,entry:prepared.entry,sha256:graphHash,compiler:'Node '+prepared.node.version+(prepared.script?' / npm '+prepared.node.npm.version:''),modules:snapshots,metadata,packages:report?.packages||[],...(prepared.script?{snapshotKind:'inputs'}:{})};
    const watches=watchSupport.validate(report?.watches||[],prepared.watch);const result={contexts:report?.contexts||[],watches,...(prepared.watch?{watchSnapshot:{specs:prepared.watch.specs,sha256:prepared.watch.sha256},watchContexts:report?.watchContexts||[]}:{}),source:prepared.source,sha256:hash(prepared.source),result:prepared.script?JSON.stringify({script:prepared.script,exitCode:0}):report?.result||'undefined',logs:[stdout&&'stdout: '+stdout,stderr&&'stderr: '+stderr].filter(Boolean),mode:prepared.script?'npm-script':'node-javascript',trustedLocalProcess:true,nodeIntegration:false,runtime:{node:prepared.node.version,executable:prepared.node.executable,...(prepared.script?{npm:prepared.node.npm.version,script:prepared.script}:{})},project,pid:job.pid,memory:{...quota.metadata,...accounting}};
    recent.push({pid:job.pid,passed:true,memory:result.memory});if(recent.length>16)recent.shift();resolve(result);
   })().catch(reject);return cleanup;
  }
  (async()=>{
   await previous;if(done)return;prepared=prepare(options);await memory.start();if(done)return;if(!prepared.script)prepared.context=sourceContext.create();
   const args=['--require',path.join(__dirname,'revival-node-preload.cjs'),...(prepared.script?[prepared.node.npm.cli,'run','--',prepared.script]:[prepared.entry])];
   child=spawn(prepared.node.executable,args,{cwd:prepared.root,windowsHide:true,shell:false,env:environment(prepared.node.executable),stdio:['pipe','pipe','pipe','ignore','pipe']});job.pid=child.pid;
   child.on('error',finish);child.stdin.on('error',error=>{if(!done)finish(error);});
   for(const stream of ['stdout','stderr']){const decoder=new StringDecoder('utf8');child[stream].on('data',data=>{
    if(done)return;outputBytes+=data.length;if(outputBytes>1024*1024){finish(Error('Node output exceeded 1 MiB'));return;}
    const text=decoder.write(data);if(stream==='stdout')stdout=(stdout+text).slice(-32768);else stderr=(stderr+text).slice(-32768);
    progress({runId:prepared.runId,stream,text:text.slice(-8192),pid:job.pid});
   });}
   child.stdio[4].on('error',error=>{if(!done)finish(error);});
   child.stdio[4].on('data',data=>{if(done)return;reportBytes+=data.length;if(reportBytes>64*1024*1024){finish(Error('Node report exceeded 64 MiB'));return;}reportChunks.push(data);});
   // close follows the closure of every stdio stream. Validate the completed
   // exit report then, preserving project cleanup output and Node's exit code.
   child.on('close',code=>{if(done)return;try{
    if(!prepared.script&&reportBytes){const message=JSON.parse(Buffer.concat(reportChunks,reportBytes).toString('utf8'));if(!message||message.ltNode!==prepared.key||typeof message.result!=='string'||Buffer.byteLength(message.result)>16384||!Array.isArray(message.contexts)||message.contexts.length>33||message.contexts.some(item=>!Number.isInteger(item.pid)||item.pid<=0||!Number.isInteger(item.threadId)||item.threadId<0))throw Error('Invalid Node result');validateSnapshots(message.snapshots||[],prepared);validateSnapshots(message.metadata||[],prepared,true);watchSupport.validate(message.watches||[],prepared.watch);report=message;}
    // Node exits with 7 when its exception handler/monitor throws. Its stderr
    // identifies that second failure, rather than the first observed error.
    if(report?.error&&code!==7){diagnosticFailure=true;diagnosticStack=String(report.stack||'');finish(failure(prepared,String(report.error),String(report.stack||'').slice(0,8192),validateSnapshots(report.snapshots||[],prepared),report.errorInstrumented!==false,report.configurationLocation));return;}
    if(code!==0){diagnosticFailure=true;diagnosticStack=stderr;finish(failure(prepared,'Node exited with code '+code+(stderr?'\n'+stderr.slice(-2048):''),stderr+'\n'+stdout,prepared.script?prepared.input:report?validateSnapshots(report.snapshots||[],prepared):[{path:prepared.entry,name:path.relative(prepared.root,prepared.entry),source:prepared.source,sha256:hash(prepared.source)}]));}else if(!prepared.script&&!report)finish(Error('Node exited before its source snapshot was captured.'));else finish();
   }catch(error){finish(error);}});
   timer=setTimeout(()=>finish(Error('Node startup exceeded 5000 ms')),5000);
   attachment=memory.attach(job.pid,[process.pid],prepared.node.executable);await attachment;if(done)return;
   clearTimeout(timer);timer=setTimeout(()=>finish(Error('Node execution exceeded 30000 ms; use Stop to end a running program.')),30000);
   if(prepared.context)sourceContext.initialize(prepared.context,{root:prepared.root,entry:prepared.entry,key:prepared.key,buffers:prepared.buffers,watch:prepared.watch,owner:job.pid});
   // The preload blocks on stdin. Project/npm code can only start after quota
   // assignment and readback; descendants inherit the kill-on-close job.
   child.stdin.end(JSON.stringify({root:prepared.root,entry:prepared.entry,source:prepared.source,code:prepared.code,key:prepared.key,buffers:prepared.buffers,script:prepared.script,family:prepared.context?{directory:prepared.context.directory,file:prepared.context.file}:null,watch:prepared.watch}));
  })().catch(finish);
 });
}
function validateSnapshots(items,prepared,metadata=false){
 if(!Array.isArray(items)||items.length>256)throw Error('Invalid Node snapshot');let bytes=0,mapBytes=0;
 return items.map(item=>{const file=policy.checked(item.path),binary=!metadata&&item.kind==='binary'&&item.source===null&&Number.isInteger(item.byteLength)&&item.byteLength>=0&&item.byteLength<=2*1024*1024;
  if(!inside(file,prepared.root)||typeof item.source!=='string'&&!(metadata&&item.source===null)&&!binary||typeof item.sha256!=='string'&&!(metadata&&item.sha256===null)||item.sha256!==null&&!/^[a-f0-9]{64}$/.test(item.sha256))throw Error('Invalid Node snapshot file');
  if(item.source!==null){const size=Buffer.byteLength(item.source);bytes+=size;if(size>(metadata?65536:2*1024*1024)||bytes>(metadata?1024*1024:8*1024*1024)||hash(item.source)!==item.sha256)throw Error('Node snapshot exceeds its source budget');}else if(binary){bytes+=item.byteLength;if(bytes>8*1024*1024)throw Error('Node snapshot exceeds its source budget');}
  for(const name of ['transformMap','secondaryTransformMap'])if(item[name]){const map=item[name];if(metadata||map.version!==3||!Array.isArray(map.sources)||map.sources.length!==1||path.normalize(map.sources[0]).toLowerCase()!==path.normalize(file).toLowerCase()||typeof map.mappings!=='string'||(mapBytes+=Buffer.byteLength(JSON.stringify(map)))>8*1024*1024)throw Error('Invalid typed Node source map');new mapping.TraceMap(map);}
  let loader;if(!metadata&&!binary&&/\.(?:[cm]?js|jsx|[cm]?ts|tsx)$/i.test(file)){const expected=syntax.effectiveLoader(file,prepared.buffers?.find(buffer=>buffer.path.toLowerCase()===file.toLowerCase())?.loader);loader=syntax.effectiveLoader(file,item.loader===undefined?expected:item.loader);if(loader!==expected)throw Error('Node snapshot grammar differs from the captured source');}else if(item.loader!==undefined)throw Error('Invalid Node snapshot grammar');
  return {path:file,name:path.relative(prepared.root,file),source:item.source,sha256:item.sha256,origin:item.origin==='editor'?'editor':'disk',...(loader?{loader}:{}),...(item.transformMap?{transformMap:item.transformMap}:{}),...(item.secondaryTransformMap?{secondaryTransformMap:item.secondaryTransformMap}:{}),...(binary?{kind:'binary',byteLength:item.byteLength}:{}),...(metadata?{exists:item.source!==null}:{})};});
}
async function shutdown(){await Promise.all([...active.values()].map(job=>job.finish(Error('Application closing'))));}
module.exports={discover,info,scripts,rootFor,prepare,run,cancel,shutdown,activeCount:()=>active.size,diagnostics:()=>({active:active.size,recent:[...recent]}),environment,initialInputs,failure,validateSnapshots};
