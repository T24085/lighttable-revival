'use strict';
// Source capture is installed separately in every real Node execution context.
// Private files carry configuration/snapshots; project IPC/stdin stays untouched.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Module=require('node:module'),threads=require('node:worker_threads'),children=require('node:child_process'),{fileURLToPath}=require('node:url');
const {normalizeArgv}=require('./revival-preload-argv.cjs');
const rawRead=fs.readFileSync.bind(fs),rawWrite=fs.writeFileSync.bind(fs),rawStat=fs.statSync.bind(fs),rawExists=fs.existsSync.bind(fs),rawRename=fs.renameSync.bind(fs),rawUnlink=fs.unlinkSync.bind(fs);
const base=path.resolve(__dirname,'../..','.revival/node-contexts'),childPreload=path.join(__dirname,'revival-node-child.cjs'),environmentKey='LightTable.revival.node.context';
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const nativeNow=Date.now.bind(Date);
const watchSupport=require('./proof-watches.cjs');
function synchronousCompiler(){
 // esbuild reads this switch once while initializing its API. Restore the
 // project's environment before any authored code or inherited worker starts.
 const previous=process.env.ESBUILD_WORKER_THREADS;
 try{process.env.ESBUILD_WORKER_THREADS='0';return require('esbuild');}
 finally{if(previous===undefined)delete process.env.ESBUILD_WORKER_THREADS;else process.env.ESBUILD_WORKER_THREADS=previous;}
}
const syntax=require('./revival-syntax.cjs'),compiler=synchronousCompiler(),compilerConfig=require('./revival-compiler-config.cjs');
const analyze=require('./proof-modules.cjs').analysis;
const inside=(file,root)=>{const relative=path.relative(root,file);return relative===''||(!path.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith('..'+path.sep));};
function transformSource(source,file,format,raw={compilerOptions:{}},loader=syntax.loader(file)){
 if(loader==='js')return {code:source,map:null};if(Buffer.byteLength(source)>2*1024*1024+256*1024)throw Error('Typed Node source exceeds its instrumentation budget');
 const started=nativeNow();let built;try{built=compiler.transformSync(source,{loader,tsconfigRaw:raw,...(['preserve','react-native'].includes(raw.compilerOptions?.jsx)?{jsx:'transform'}:{}),format:format==='module'?'esm':'cjs',target:'es2022',sourcefile:file,sourcemap:'external',sourcesContent:false,legalComments:'none',logLevel:'silent'});}catch(error){if(error.code==='ETIMEDOUT')throw Error('Typed Node compilation exceeded 5000 ms');const point=error.errors?.[0]?.location;if(point){const column=Buffer.from(point.lineText||'').subarray(0,point.column).toString('utf8').length;error.stack=String(error.message)+'\n at '+file+':'+point.line+':'+(column+1);}throw error;}
 if(nativeNow()-started>5000)throw Error('Typed Node compilation exceeded 5000 ms');if(Buffer.byteLength(built.code)>4*1024*1024||Buffer.byteLength(built.map)>8*1024*1024)throw Error('Typed Node compilation exceeds 4 MiB code / 8 MiB maps');return {code:built.code,map:JSON.parse(built.map)};
}
function create(){fs.mkdirSync(base,{recursive:true});const directory=path.join(base,crypto.randomUUID());fs.mkdirSync(directory);return {directory,file:path.join(directory,'context.json'),baseReal:fs.realpathSync(base)};}
function initialize(family,config){rawWrite(family.file,JSON.stringify({root:config.root,entry:config.entry,key:config.key,buffers:config.buffers,watch:config.watch,family:{directory:family.directory,file:family.file},owner:config.owner}),{flag:'wx'});}
function cleanup(family){
 if(!family||!rawExists(family.directory))return;
 const resolved=fs.realpathSync(family.directory);if(resolved.toLowerCase()===family.baseReal.toLowerCase()||!inside(resolved,family.baseReal))throw Error('Refusing to remove a Node context directory outside its allocated runtime root');
 fs.rmSync(family.directory,{recursive:true,force:true});
}
function childConfiguration(){
 const file=threads.isMainThread?process.env.LT_REVIVAL_NODE_CONTEXT:threads.getEnvironmentData(environmentKey);if(typeof file!=='string'||!path.isAbsolute(file))throw Error('Missing Node child source context');
 if(rawStat(file).size>64*1024*1024)throw Error('Node child configuration exceeds 64 MiB');const config=JSON.parse(rawRead(file,'utf8'));delete process.env.LT_REVIVAL_NODE_CONTEXT;
 if(!config||typeof config.root!=='string'||typeof config.key!=='string'||!Array.isArray(config.buffers)||config.family?.file!==file||path.dirname(file)!==config.family.directory)throw Error('Invalid Node child source context');return config;
}
function diagnosticChecked(file,root){
 file=path.resolve(file);if(!inside(file,root))throw Error('Node configuration leaves the open project');let ancestor=file;
 while(!rawExists(ancestor)){const next=path.dirname(ancestor);if(next===ancestor)throw Error('Invalid Node configuration ancestor');ancestor=next;}
 if(!inside(fs.realpathSync(ancestor),fs.realpathSync(root)))throw Error('Node configuration leaves the open project');return file;
}
function persistDiagnostic(config,error){
 const raw=compilerConfig.fromError(error);if(!raw)return null;
 const location=compilerConfig.validateLocation(raw,{root:config.root,checked:file=>diagnosticChecked(file,config.root)});if(!location)return null;
 // JSON escaping can expand each raw control character to six bytes. Carry
 // the source once; the parent reconstructs sourceLine and coordinates.
 const configurationLocation={kind:location.kind,path:location.path,source:location.source,sha256:location.sha256,offset:location.offset};
 const record={key:config.key,pid:process.pid,threadId:threads.threadId,error:String(error.message||error).slice(0,2048),configurationLocation},bytes=JSON.stringify(record);
 if(Buffer.byteLength(bytes)>512*1024)throw Error('Node configuration diagnostic exceeds its report budget');
 const file=path.join(config.family.directory,'diagnostic-'+process.pid+'-'+threads.threadId+'.json');rawWrite(file+'.tmp',bytes);rawRename(file+'.tmp',file);return location;
}
function diagnosticRecords(config,context){
 if(!config.family||!rawExists(config.family.directory))return [];
 const files=fs.readdirSync(config.family.directory),names=files.filter(file=>/^diagnostic-\d+-\d+\.json$/.test(file));if(names.length>33)throw Error('Node configuration diagnostics exceed 32 child contexts');let bytes=0;
 // Diagnostics share the existing private family-report allowance.
 for(const name of files.filter(file=>/^(?:snapshot-\d+-\d+-[\w-]+|diagnostic-\d+-\d+)\.json$/.test(file))){const stat=fs.lstatSync(path.join(config.family.directory,name));if(!stat.isFile()||stat.isSymbolicLink()||(bytes+=stat.size)>64*1024*1024)throw Error('Node child snapshots exceed 64 MiB');}
 const records=[];
 for(const name of names){if(context&&name!=='diagnostic-'+context.pid+'-'+context.threadId+'.json')continue;const file=path.join(config.family.directory,name);if(rawStat(file).size>512*1024)throw Error('Node configuration diagnostic exceeds its report budget');const record=JSON.parse(rawRead(file,'utf8'));
  if(!record||record.key!==config.key||!Number.isInteger(record.pid)||record.pid<=0||!Number.isInteger(record.threadId)||record.threadId<0||name!=='diagnostic-'+record.pid+'-'+record.threadId+'.json'||typeof record.error!=='string'||!record.error||record.error.length>2048)throw Error('Invalid Node configuration diagnostic');records.push(record);
 }return records;
}
function diagnostic(config,error,stack='',context){
 const explicit=compilerConfig.fromError(error);if(explicit)return explicit;
 const message=String(error?.message||error||'').slice(0,2048),text=message+'\n'+String(stack||'').slice(-32768),records=diagnosticRecords(config,context);
 const matches=records.filter(record=>text.includes(record.error));if(matches.length!==1)return null;return matches[0].configurationLocation;
}
function installInheritedWorker(){
 // Workers inherit Node's parsed runtime options, including the parent's
 // preload. Preserve that native path instead of converting inherited flags
 // into an explicit execArgv list, where process-only flags are rejected.
 if(typeof threads.getEnvironmentData(environmentKey)==='string'){const config=childConfiguration();try{install(config,true);}catch(error){persistDiagnostic(config,error);throw error;}}
}
function mergeFamily(config,snapshots,metadata,watchContexts=[]){
 const contexts=[{pid:config.owner||process.pid,threadId:0}];let total=[...snapshots.values()].reduce((sum,item)=>sum+(item.source===null?item.byteLength:Buffer.byteLength(item.source)),0),metadataBytes=[...metadata.values()].reduce((sum,item)=>sum+(item.source===null?0:Buffer.byteLength(item.source)),0),wireBytes=0;
 const files=fs.readdirSync(config.family.directory).filter(file=>/^snapshot-\d+-\d+-[\w-]+\.json$/.test(file));diagnosticRecords(config);if(files.length>33)throw Error('Node snapshot exceeds 32 child contexts');let childCount=0,primarySeen=false;
 for(const name of files){
  const file=path.join(config.family.directory,name),stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||(wireBytes+=stat.size)>64*1024*1024)throw Error('Node child snapshots exceed 64 MiB');
  const record=JSON.parse(rawRead(file,'utf8'));if(record.key!==config.key||!Number.isInteger(record.pid)||record.pid<=0||!Number.isInteger(record.threadId)||record.threadId<0||!Array.isArray(record.snapshots)||record.snapshots.length>256||!Array.isArray(record.metadata)||record.metadata.length>256)throw Error('Invalid Node child snapshot');const primary=record.pid===contexts[0].pid&&record.threadId===0;if(primary){if(primarySeen)throw Error('Duplicate primary Node context');primarySeen=true;}else{if(++childCount>32)throw Error('Node snapshot exceeds 32 child contexts');contexts.push({pid:record.pid,threadId:record.threadId});}
  if(record.watchFailure){if(typeof record.watchFailure!=='string'||record.watchFailure.length>2048)throw Error('Invalid child watch failure');throw Error(record.watchFailure+' (pid '+record.pid+', thread '+record.threadId+')');}
  const values=watchSupport.validate(record.watches||[],config.watch);if(primary){const index=watchContexts.findIndex(item=>item.pid===record.pid&&item.threadId===0);if(index>=0)watchContexts.splice(index,1);}if(values.length)watchContexts.push({pid:record.pid,threadId:record.threadId,values});
  for(const item of record.snapshots){
   if(typeof item.path!=='string'||!inside(item.path,config.root)||typeof item.sha256!=='string'||!/^[a-f0-9]{64}$/.test(item.sha256))throw Error('Invalid Node child source');if(item.loader!==undefined)syntax.effectiveLoader(item.path,item.loader);const previous=snapshots.get(item.path.toLowerCase());if(previous){if(previous.sha256!==item.sha256||previous.loader!==item.loader)throw Error('Different Node contexts used different sources or grammars: '+path.relative(config.root,item.path));if(!previous.transformMap&&item.transformMap)previous.transformMap=item.transformMap;if(!previous.secondaryTransformMap&&item.secondaryTransformMap)previous.secondaryTransformMap=item.secondaryTransformMap;continue;}
   let size;if(item.kind==='binary'&&item.source===null&&Number.isInteger(item.byteLength)&&item.byteLength>=0)size=item.byteLength;else{if(typeof item.source!=='string'||hash(item.source)!==item.sha256)throw Error('Invalid Node child source hash');size=Buffer.byteLength(item.source);}
   if(size>2*1024*1024||snapshots.size>=256||(total+=size)>8*1024*1024)throw Error('Node family input snapshot exceeds its source budget');snapshots.set(item.path.toLowerCase(),item);
  }
  for(const item of record.metadata){
   if(typeof item.path!=='string'||!inside(item.path,config.root)||(item.source!==null&&typeof item.source!=='string')||item.sha256!==(item.source===null?null:hash(item.source)))throw Error('Invalid Node child metadata');const previous=metadata.get(item.path.toLowerCase());if(previous){if(previous.sha256!==item.sha256)throw Error('Different Node contexts used different package metadata: '+path.relative(config.root,item.path));continue;}
   const size=item.source===null?0:Buffer.byteLength(item.source);if(metadata.size>=256||size>65536||(metadataBytes+=size)>1024*1024)throw Error('Node family package metadata exceeds its budget');metadata.set(item.path.toLowerCase(),item);
  }
 }return contexts;
}
function mergeReport(prepared,report){
 const snapshots=new Map(report.snapshots.map(item=>[item.path.toLowerCase(),item])),metadata=new Map(report.metadata.map(item=>[item.path.toLowerCase(),item]));
 const watchContexts=report.watches.length?[{pid:report.contexts[0].pid,threadId:0,values:report.watches}]:[];
 report.contexts=mergeFamily({root:prepared.root,key:prepared.key,family:prepared.context,owner:report.contexts[0].pid,watch:prepared.watch},snapshots,metadata,watchContexts);report.snapshots=[...snapshots.values()];report.metadata=[...metadata.values()];if(prepared.watch){report.watches=watchSupport.mergeContexts(prepared.watch,watchContexts);report.watchContexts=watchContexts;}
 report.packages=report.metadata.filter(item=>item.source!==null&&item.path.split(path.sep).includes('node_modules')).flatMap(item=>{try{const json=JSON.parse(item.source.replace(/^\uFEFF/,''));return typeof json.name==='string'?[{name:json.name.slice(0,256),version:String(json.version||'unversioned').slice(0,128),path:path.dirname(item.path),manifest:item.path,sha256:item.sha256}]:[];}catch(_){return [];}});
}
function install(config,secondary=false){
 const snapshots=new Map(),metadata=new Map(),buffers=new Map(config.buffers.map(item=>[item.path.toLowerCase(),item])),secondaryErrors=new WeakSet(),secondaryDiagnostics=new WeakMap(),workerContexts=new WeakMap();let total=0,metadataBytes=0,dirty=false,generatedBytes=0,mapBytes=0,trustedCompiler=false;
 const jsFamily=file=>/\.(?:[cm]?js|jsx|[cm]?ts|tsx)$/i.test(file),loaderFor=file=>syntax.effectiveLoader(file,buffers.get(file.toLowerCase())?.loader);
 for(const item of buffers.values())syntax.effectiveLoader(item.path,item.loader);
 function checked(file){file=path.resolve(file);if(!inside(file,config.root))throw Error('Node module leaves the open project: '+file);if(rawExists(file)&&!inside(fs.realpathSync(file),config.root))throw Error('Node module leaves the open project: '+file);return file;}
 const configurations=compilerConfig.create({root:config.root,buffers:new Map([...buffers].map(([key,item])=>[key,item.source])),checked});
 function configured(fn){try{return fn();}catch(error){persistDiagnostic(config,error);throw error;}}
 function configurationMetadata(){return configured(()=>{for(const item of configurations.finish().metadata){const key=item.path.toLowerCase(),old=metadata.get(key);if(old&&old.sha256!==item.sha256)throw Error('Compiler configuration changed during Node execution');if(!old){const bytes=item.source===null?0:Buffer.byteLength(item.source);if(metadata.size>=256||(metadataBytes+=bytes)>1024*1024)throw Error('Node package/compiler metadata exceeds its budget');metadata.set(key,{path:item.path,source:item.source,sha256:item.sha256});dirty=true;}}});}
 function resolveTyped(input){const candidates=path.extname(input)?[input]:[input,...['.js','.mjs','.cjs','.jsx','.ts','.tsx','.mts','.cts','.json'].map(extension=>input+extension),...['js','mjs','cjs','jsx','ts','tsx','mts','cts'].map(extension=>path.join(input,'index.'+extension))];for(const candidate of candidates){checked(candidate);if(buffers.has(candidate.toLowerCase())||rawExists(candidate)&&rawStat(candidate).isFile())return candidate;}throw Error('Module not found: '+path.relative(config.root,input));}
 function formatFor(file,source){const extension=path.extname(file).toLowerCase();if(['.mjs','.mts'].includes(extension))return 'module';if(['.cjs','.cts'].includes(extension))return 'commonjs';for(let dir=path.dirname(file);inside(dir,config.root);dir=path.dirname(dir)){const manifest=path.join(dir,'package.json');if(rawExists(manifest)){const json=JSON.parse(rawRead(manifest,'utf8'));if(['module','commonjs'].includes(json.type))return json.type;break;}if(dir.toLowerCase()===config.root.toLowerCase())break;}let parsed;try{parsed=analyze(source,{filename:file,loader:loaderFor(file)});}catch(error){if(error.loc)error.stack=error.message+'\n at '+file+':'+error.loc.line+':'+(error.loc.column+1);throw error;}return parsed.staticImports||parsed.esmExports||parsed.topLevelAwait?'module':'commonjs';}
 const stateFile=secondary||config.watch?path.join(config.family.directory,'snapshot-'+process.pid+'-'+threads.threadId+'-'+crypto.randomUUID()+'.json'):null;
 function flush(){
  if(!stateFile||!dirty)return;dirty=false;const bytes=JSON.stringify({key:config.key,pid:process.pid,threadId:threads.threadId,watches:[...watchValues].map(([id,result])=>({id,result})),...(watchValues.failure?{watchFailure:String(watchValues.failure.message||watchValues.failure).slice(0,2048)}:{}),snapshots:[...snapshots.values()],metadata:[...metadata.values()]});if(Buffer.byteLength(bytes)>64*1024*1024)throw Error('Node child snapshot exceeds 64 MiB');
  // The reader sees a complete record even if a worker is terminated while its
  // next record is being written. Each context owns a different file.
  rawWrite(stateFile+'.tmp',bytes);rawRename(stateFile+'.tmp',stateFile);
 }
 let lastWatchFlush=0;const watchValues=watchSupport.installNative(config.watch,failed=>{dirty=true;const now=nativeNow();if(failed||!lastWatchFlush||now-lastWatchFlush>=25||process._exiting){lastWatchFlush=now;flush();}});
 // Coalesce repeated expression observations without adding timers or handles.
 // A normal child/thread exit writes its final value synchronously.
 if(config.watch)process.on('exit',()=>flush());
 function snapshot(file,source,origin='disk'){
  if(!inside(file,config.root))return;const key=file.toLowerCase(),previous=snapshots.get(key);if(previous&&origin!=='editor')return;
  const bytes=Buffer.byteLength(source);if(bytes>2*1024*1024||(!previous&&snapshots.size>=256)||(total+=bytes-(previous?(previous.source===null?previous.byteLength:Buffer.byteLength(previous.source)):0))>8*1024*1024)throw Error('Node source snapshot exceeds 256 files / 2 MiB per file / 8 MiB total');
  snapshots.set(key,{path:file,name:path.relative(config.root,file),source,sha256:hash(source),origin,...(jsFamily(file)?{loader:loaderFor(file)}:{})});dirty=true;flush();
 }
 function dataSnapshot(file,result){
  if(!inside(file,config.root)||snapshots.has(file.toLowerCase()))return;const bytes=Buffer.isBuffer(result)?result:rawRead(file),source=bytes.toString('utf8');
  if(Buffer.from(source).equals(bytes)){snapshot(file,source);return;}
  if(bytes.length>2*1024*1024||snapshots.size>=256||(total+=bytes.length)>8*1024*1024)throw Error('Node input snapshot exceeds its source budget');
  snapshots.set(file.toLowerCase(),{path:file,name:path.relative(config.root,file),source:null,sha256:hash(bytes),byteLength:bytes.length,kind:'binary',origin:'disk'});dirty=true;flush();
 }
 function manifests(dir){
  for(let current=dir;inside(current,config.root);current=path.dirname(current)){
   const file=path.join(current,'package.json'),key=file.toLowerCase();if(!metadata.has(key)){
    if(metadata.size>=256)throw Error('Node metadata exceeds 256 paths');let source=null;
    if(rawExists(file)){if(rawStat(file).size>65536)throw Error('Node package.json exceeds 64 KiB');source=rawRead(file,'utf8');metadataBytes+=Buffer.byteLength(source);if(metadataBytes>1024*1024)throw Error('Node package metadata exceeds 1 MiB');}
    metadata.set(key,{path:file,source,sha256:source===null?null:hash(source)});dirty=true;
   }if(current.toLowerCase()===config.root.toLowerCase())break;
  }
 }
 function requestedPackage(specifier,dir){
  if(Module.isBuiltin(specifier)||!/^(?:@[\w.~+-]+\/)?[\w.~+-]+(?:\/[^\0]*)?$/.test(specifier))return;
  const pieces=specifier.split('/'),name=specifier.startsWith('@')?pieces.slice(0,2).join('/'):pieces[0];
  for(let current=dir;inside(current,config.root);current=path.dirname(current)){
   if(path.basename(current).toLowerCase()!=='node_modules'){const candidate=path.join(current,'node_modules',name);manifests(candidate);if(rawExists(candidate))break;}
   if(current.toLowerCase()===config.root.toLowerCase())break;
  }
 }
 manifests(path.dirname(config.entry));flush();
 Module.registerHooks({
  resolve(specifier,context,next){
   if(trustedCompiler)return next(specifier,context);
   const dir=context.parentURL?.startsWith('file:')?path.dirname(fileURLToPath(context.parentURL)):config.root;manifests(dir);requestedPackage(specifier,dir);
   if(context.parentURL?.startsWith('file:')&&!Module.isBuiltin(specifier)){const importer=fileURLToPath(context.parentURL),alias=configured(()=>configurations.resolve(specifier,importer,resolveTyped));configurationMetadata();if(alias)return {url:require('node:url').pathToFileURL(alias).href,shortCircuit:true};}
   try{let result;try{result=next(specifier,context);}catch(error){if(!['MODULE_NOT_FOUND','ERR_MODULE_NOT_FOUND'].includes(error.code)||!/^\.\.?\//.test(specifier)||!context.parentURL?.startsWith('file:'))throw error;const requested=new URL(specifier,context.parentURL),file=resolveTyped(fileURLToPath(requested)),resolved=require('node:url').pathToFileURL(file);resolved.search=requested.search;resolved.hash=requested.hash;result={url:resolved.href,shortCircuit:true};}if(result.url.startsWith('file:')){const file=fileURLToPath(result.url);if(!inside(file,config.root))throw Error('Node module leaves the open project: '+file);manifests(path.dirname(file));}return result;}finally{flush();}
  },
  load(url,context,next){
   if(trustedCompiler)return next(url,context);
   if(!url.startsWith('file:'))return next(url,context);const file=fileURLToPath(url),buffer=buffers.get(file.toLowerCase());if(!inside(file,config.root))return next(url,context);const loader=loaderFor(file),typed=loader!=='js',override=jsFamily(file)&&buffer?.loader!==undefined;
   const result=typed||override?{source:buffer?.source??rawRead(checked(file),'utf8'),format:buffer?.format,shortCircuit:true}:next(url,context);
   if(typeof result.source==='string'||Buffer.isBuffer(result.source)||result.source instanceof Uint8Array){const source=buffer?.source??String(Buffer.isBuffer(result.source)||result.source instanceof Uint8Array?Buffer.from(result.source).toString('utf8'):result.source);snapshot(file,source,buffer?'editor':'disk');let working;trustedCompiler=typed;try{working=!secondary&&file.toLowerCase()===config.entry.toLowerCase()?config.code:watchSupport.apply(config.watch,file,source);}finally{trustedCompiler=false;}let code=working,format=buffer?.format||result.format;
    if(typed){let built;trustedCompiler=true;try{configured(()=>{format=format||formatFor(file,working);built=transformSource(working,file,format,configurations.forFile(file).raw,loader);});}finally{trustedCompiler=false;}configurationMetadata();const item=snapshots.get(file.toLowerCase()),mapKey=secondary&&file.toLowerCase()===config.entry.toLowerCase()?'secondaryTransformMap':'transformMap';if(!item[mapKey]){generatedBytes+=Buffer.byteLength(built.code);mapBytes+=Buffer.byteLength(JSON.stringify(built.map));if(generatedBytes>4*1024*1024||mapBytes>8*1024*1024)throw Error('Typed Node graph exceeds 4 MiB code / 8 MiB maps');}item[mapKey]=built.map;dirty=true;flush();code=built.code;}
    if(!format&&override)format=formatFor(file,working);return {...result,source:code,...(format?{format}:{})};}return result;
  }
 });
 fs.readFileSync=function(file,...args){const result=rawRead(file,...args);if(typeof file==='string'||file instanceof URL)dataSnapshot(path.resolve(file instanceof URL?fileURLToPath(file):file),result);return result;};
 const read=fs.readFile.bind(fs);fs.readFile=function(file,...args){const callback=args.pop();if(typeof callback!=='function')return read(file,...args,callback);return read(file,...args,(error,result)=>{try{if(!error&&(typeof file==='string'||file instanceof URL))dataSnapshot(path.resolve(file instanceof URL?fileURLToPath(file):file),result);}catch(failure){callback(failure);return;}callback(error,result);});};
 const promiseRead=fs.promises.readFile.bind(fs.promises);fs.promises.readFile=async function(file,...args){const result=await promiseRead(file,...args);if(typeof file==='string'||file instanceof URL)dataSnapshot(path.resolve(file instanceof URL?fileURLToPath(file):file),result);return result;};
 function reserve(){for(let index=0;index<32;index++){const file=path.join(config.family.directory,'slot-'+index);try{rawWrite(file,String(process.pid),{flag:'wx'});return ()=>rawUnlink(file);}catch(error){if(error.code!=='EEXIST')throw error;}}throw Error('Node run exceeds 32 child execution contexts');}
 function launch(fn){const release=reserve();try{const result=fn();if(result&&typeof result==='object'&&!result.pid&&(result instanceof children.ChildProcess||result.error))release();return result;}catch(error){if(!Number.isInteger(error.pid)||error.pid<=0)release();throw error;}}
 function argsWithPreload(args){return Array.isArray(args)?['--require',childPreload,...args]:args;}
 function validOptions(options){return options==null||typeof options==='object'&&!Array.isArray(options);}
 function childOptions(options={}){const source=options?.env||process.env,env={};for(const key in source)env[key]=source[key];env.LT_REVIVAL_NODE_CONTEXT=config.family.file;return {...options,env};}
 const NativeWorker=threads.Worker;
 threads.setEnvironmentData(environmentKey,config.family.file);
 threads.Worker=class Worker extends NativeWorker {
  constructor(filename,options={}){
   // esbuild's synchronous API starts a private worker with execArgv:[] then
   // blocks on Atomics.wait. Its worker must retain that empty preload list.
   if(trustedCompiler){super(filename,options);return;}
   const next=options!=null&&Array.isArray(options.execArgv)?{...options,execArgv:argsWithPreload(options.execArgv)}:options,release=reserve();try{super(filename,next);workerContexts.set(this,{pid:process.pid,threadId:this.threadId});}catch(error){release();throw error;}
  }
  emit(event,...args){if(['error','message'].includes(event)&&args[0] instanceof Error){secondaryErrors.add(args[0]);const context=workerContexts.get(this);if(event==='error'&&context){const location=diagnostic(config,args[0],'',context);if(location)secondaryDiagnostics.set(args[0],location);}}return super.emit(event,...args);}
 };
 const nativeFork=children.fork;
 children.fork=function fork(file,args=[],options){
  if(args!=null&&typeof args==='object'&&!Array.isArray(args)){options=args;args=[];}args??=[];options??={};
  if(!validOptions(options)||options.execPath&&(typeof options.execPath!=='string'||path.resolve(options.execPath).toLowerCase()!==process.execPath.toLowerCase()))return nativeFork(file,args,options);
  let execArgv=options.execArgv||process.execArgv;
  // Match Node's default fork guard before adding our private preload. An
  // explicit user-supplied copy still keeps its own requested --eval behavior.
  if(execArgv===process.execArgv&&process._eval!=null){const index=execArgv.lastIndexOf(process._eval);if(index>0){execArgv=execArgv.slice();execArgv.splice(index-1,2);}}
  return launch(()=>nativeFork(file,args,{...childOptions(options),execArgv:argsWithPreload(execArgv)}));
 };
 function directNode(executable,options){return typeof executable==='string'&&!options?.shell&&(executable.toLowerCase()==='node'||executable.toLowerCase()==='node.exe'||path.isAbsolute(executable)&&path.resolve(executable).toLowerCase()===process.execPath.toLowerCase());}
 for(const name of ['spawn','spawnSync']){const native=children[name];children[name]=function(executable,args,options){const original=[...arguments];if(args!=null&&typeof args==='object'&&!Array.isArray(args)){options=args;args=[];}args??=[];if(!Array.isArray(args)||!validOptions(options)||options===null||!directNode(executable,options))return native(...original);return launch(()=>native(executable,argsWithPreload(args),childOptions(options)));};Object.defineProperty(children[name],'name',{value:native.name,configurable:true});}
 const nativeExec=children.execFile;children.execFile=function execFile(executable,args,options,callback){
  const original=[...arguments];if(args!=null&&typeof args==='object'&&!Array.isArray(args)){callback=options;options=args;args=[];}else if(typeof args==='function'){callback=args;options=undefined;args=[];}args??=[];if(typeof options==='function'){callback=options;options=undefined;}
  if(!Array.isArray(args)||!validOptions(options)||!directNode(executable,options))return nativeExec(...original);return launch(()=>nativeExec(executable,argsWithPreload(args),childOptions(options),callback));
 };
 const promiseKey=require('node:util').promisify.custom;
 Object.defineProperty(children.execFile,promiseKey,{...Object.getOwnPropertyDescriptor(nativeExec,promiseKey),value:function execFile(...args){
  const {promise,resolve,reject}=Promise.withResolvers();promise.child=children.execFile(...args,(error,stdout,stderr)=>{if(error!==null){error.stdout=stdout;error.stderr=stderr;reject(error);}else resolve({stdout,stderr});});return promise;
 }});
 const nativeExecSync=children.execFileSync;children.execFileSync=function execFileSync(executable,args,options){const original=[...arguments];if(args!=null&&typeof args==='object'&&!Array.isArray(args)){options=args;args=[];}args??=[];
  if(trustedCompiler&&typeof executable==='string'&&path.isAbsolute(executable)&&/^esbuild(?:\.exe)?$/i.test(path.basename(executable)))return nativeExecSync(executable,args,{...options,timeout:5000});
  if(!Array.isArray(args)||!validOptions(options)||options===null||!directNode(executable,options))return nativeExecSync(...original);return launch(()=>nativeExecSync(executable,argsWithPreload(args),childOptions(options)));};
 Module.syncBuiltinESMExports();
 function collect(){
  return secondary?[{pid:process.pid,threadId:threads.threadId}]:mergeFamily(config,snapshots,metadata);
 }
 function configurationDiagnostic(error){const direct=compilerConfig.fromError(error);if(direct)return direct;const seen=new Set(),pending=[error];for(let index=0;index<pending.length&&index<16;index++){const item=pending[index];if(!item||typeof item!=='object'||seen.has(item))continue;seen.add(item);const found=secondaryDiagnostics.get(item);if(found)return found;const cause=Object.getOwnPropertyDescriptor(item,'cause');if(cause&&'value' in cause)pending.push(cause.value);}return null;}
 if(secondary)process.on('uncaughtExceptionMonitor',error=>{
  // Observe only a fatal configuration failure. Native project handlers and
  // capture callbacks keep their original behavior; this never handles it.
  if(process.hasUncaughtExceptionCaptureCallback()||process.listenerCount('uncaughtException'))return;
  const location=configurationDiagnostic(error);if(location)persistDiagnostic(config,{message:String(error.message||error),location});
 });
 return {snapshots,metadata,watchValues,collect,configurationDiagnostic,isSecondaryError:error=>!!error&&typeof error==='object'&&secondaryErrors.has(error)};
}
module.exports={create,initialize,cleanup,normalizeArgv,childConfiguration,installInheritedWorker,mergeReport,install,transformSource,persistDiagnostic,diagnostic};
