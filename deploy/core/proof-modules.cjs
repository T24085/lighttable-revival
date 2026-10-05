'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),esbuild=require('esbuild'),syntax=require('./revival-syntax.cjs');
const {TraceMap,originalPositionFor}=require('@jridgewell/trace-mapping');
const policy=require('./proof-policy.cjs'),projects=require('./revival-projects.cjs');
const packageSupport=require('./proof-packages.cjs');
const watchSupport=require('./proof-watches.cjs');
const compilerConfig=require('./revival-compiler-config.cjs');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
function inside(file,root){const r=path.relative(root,file);return r===''||(!path.isAbsolute(r)&&r!=='..'&&!r.startsWith('..'+path.sep));}
function runtimeStatement(node){return !!node&&!syntax.isTypeOnly(node)&&!(node.type==='ImportDeclaration'&&node.specifiers.length&&node.specifiers.every(item=>item.importKind==='type'))&&!(node.type==='ExportNamedDeclaration'&&node.declaration&&!runtimeStatement(node.declaration));}
function analysis(source,options={}){
 let ast;try{ast=syntax.parse(source,{...options,sourceType:'script',locations:true});}catch(_){ast=syntax.parse(source,{...options,sourceType:'module',locations:true});}
 let imports=false,staticImports=false,cjs=false,exports=false,esmExports=false,defaultExport=false,topLevelAwait=false,dependencies=false;
 function visit(node,depth=0,namespaceDepth=0){
  if(!node||typeof node!=='object'||node.type&&!runtimeStatement(node))return;
  if(node.type==='ImportDeclaration'||node.type==='ImportExpression'||!namespaceDepth&&['ExportAllDeclaration','ExportNamedDeclaration','ExportDefaultDeclaration'].includes(node.type))imports=true;
  if(node.type==='ImportDeclaration')staticImports=true;
  if(node.type==='ImportDeclaration'||node.type==='ImportExpression'||node.type==='ExportAllDeclaration'||(node.type==='ExportNamedDeclaration'&&node.source))dependencies=true;
  if(depth===0&&(node.type==='AwaitExpression'||(node.type==='ForOfStatement'&&node.await)))topLevelAwait=true;
  if(!namespaceDepth&&node.type?.startsWith('Export')){exports=true;esmExports=true;}
  if(!namespaceDepth&&(node.type==='ExportDefaultDeclaration'||node.exported?.name==='default'||node.specifiers?.some(s=>s.exported?.name==='default'||s.exported?.value==='default')))defaultExport=true;
  if(node.type==='CallExpression'&&node.callee?.type==='Identifier'&&node.callee.name==='require'){cjs=true;dependencies=true;}
  if(node.type==='TSImportEqualsDeclaration'&&node.moduleReference?.type==='TSExternalModuleReference'){cjs=true;dependencies=true;}
  if(node.type==='TSExportAssignment'){cjs=true;exports=true;defaultExport=true;}
  if(node.type==='MemberExpression'&&((node.object?.name==='module'&&(node.property?.name==='exports'||node.property?.value==='exports'))||node.object?.name==='exports')){cjs=true;exports=true;}
  const next=depth+(/^(FunctionDeclaration|FunctionExpression|ArrowFunctionExpression)$/.test(node.type)?1:0);
  const nextNamespace=namespaceDepth+(node.type==='TSModuleDeclaration'?1:0);
  for(const [key,value] of Object.entries(node)){if(key==='loc')continue;if(Array.isArray(value))value.forEach(child=>visit(child,next,nextNamespace));else if(value&&typeof value==='object')visit(value,next,nextNamespace);}
 }
 visit(ast);return {ast,imports,staticImports,cjs,exports,esmExports,defaultExport,topLevelAwait,dependencies};
}
async function prepare(source,options={},signal){
 if(!options||typeof options!=='object'||Array.isArray(options))throw Error('Invalid JavaScript run options');
 const started=Date.now();let timedOut=false;
 function aborted(){if(signal?.aborted)throw Error('Execution cancelled');if(timedOut||Date.now()-started>=5000)throw Error('Project compilation exceeded 5 seconds');}
 const entry=options.path?policy.checked(options.path):null,chosenRoot=entry?projects.info().recents.map(p=>p.path).filter(p=>inside(entry,p)).sort((a,b)=>b.length-a.length)[0]:null,root=chosenRoot||(entry?path.dirname(entry):null);
 if(entry&&options.loader!==undefined&&!/\.(?:[cm]?js|jsx|[cm]?ts|tsx)$/i.test(entry))throw Error('Source grammar is only available for JavaScript-family files');
 if(options.watchFiles?.length&&(!chosenRoot||options.inline))throw Error('Run an opened project file to capture watches in other files.');
 const filename=entry||options.filename||'Untitled.js',loaders=new Map();
 for(const [items,limit] of [[options.buffers,288],[options.watchFiles,64]]){if(items!==undefined&&(!Array.isArray(items)||items.length>limit))throw Error('Project buffers or watched files exceed their path limit');for(const item of items||[]){if(!item||typeof item.path!=='string')throw Error('Invalid project source path');if(item.loader!==undefined&&!/\.(?:[cm]?js|jsx|[cm]?ts|tsx)$/i.test(item.path))throw Error('Source grammar is only available for JavaScript-family files');const selected=syntax.effectiveLoader(item.path,item.loader),key=path.resolve(item.path).toLowerCase();if(item.loader!==undefined){if(loaders.has(key)&&loaders.get(key)!==selected)throw Error('Watched grammar differs from its project buffer');loaders.set(key,selected);}}}
 const sourceLoader=syntax.effectiveLoader(filename,options.loader===undefined?loaders.get(entry?.toLowerCase()):options.loader);if(entry)loaders.set(entry.toLowerCase(),sourceLoader);
 const loaderFor=file=>syntax.effectiveLoader(file,loaders.get(file.toLowerCase()));
 let watch;try{watch=watchSupport.plan(source,options.watches,options.watchFiles||[],entry,file=>{const checked=policy.checked(file);if(!chosenRoot||!inside(checked,root))throw Error('Watched file leaves the open project');return checked;},undefined,(text,specs,key,tokens,file,hint)=>watchSupport.instrument(text,specs,key,tokens,{filename:file||filename,loader:!file||file.toLowerCase()===entry?.toLowerCase()?sourceLoader:syntax.effectiveLoader(file,hint===undefined?loaders.get(file.toLowerCase()):hint)}),sourceLoader);}catch(error){if(error.loc){const p=error.watchPath||entry,original=error.watchSource||source,item={path:p,name:p?path.basename(p):'Untitled',source:original,sha256:hash(original),loader:p?loaderFor(p):sourceLoader};error.location=location(item,error.loc.line,error.loc.column);}throw error;}
 if(!options.path||(options.inline&&(sourceLoader==='js'||!chosenRoot)))return prepareInline(source,{...options,loader:sourceLoader},signal,watch);
 const working=watch?.source||source;
 let parsed;
 try{parsed=analysis(working,{filename,loader:sourceLoader});}catch(error){const point=watchSupport.position(watch,error.loc?.line||1,error.loc?.column||0,source);const failure=Error(path.basename(entry)+':'+point.line+':'+(point.column+1)+' - '+error.message);failure.location=location({path:entry,name:path.basename(entry),source,sha256:hash(source)},point.line,point.column);throw failure;}
 if(sourceLoader==='js'&&!parsed.imports&&!parsed.cjs&&!parsed.topLevelAwait&&!/\.(mjs|cjs)$/i.test(entry))return {code:working+'\n//# sourceURL=light-table-script.js',watch,entry:{path:entry,name:path.basename(entry),source,sha256:hash(source),loader:sourceLoader}};
 if(!chosenRoot&&parsed.dependencies)throw Error('Open the containing folder with Open project before running modules.');
 const buffers=new Map(),snapshots=new Map(),accountedSources=new Map();let total=0,packageTotal=0,packageFiles=0,localFiles=0;
 if(options.buffers!==undefined||watch?.files?.some(item=>item.path!==entry)){
  if(options.buffers!==undefined&&(!Array.isArray(options.buffers)||options.buffers.length>288))throw Error('At most 288 open project and package buffers can be included');
  const input=[...(options.buffers||[])];for(const item of watch?.files||[]){if(item.path===entry)continue;const buffer=input.find(buffer=>buffer.path?.toLowerCase()===item.path.toLowerCase());if(buffer&&buffer.source!==item.originalSource)throw Error('Watched source differs from its project buffer');if(item.loader!==undefined)loaders.set(item.path.toLowerCase(),item.loader);if(!buffer)input.push({path:item.path,source:item.originalSource,loader:item.loader});}
  let bufferBytes=0,packageBufferBytes=0,localBuffers=0;
  for(const buffer of input){
   if(!buffer||typeof buffer.path!=='string'||typeof buffer.source!=='string')throw Error('Invalid project buffer');
   const p=policy.checked(buffer.path);if(!inside(p,root))continue;
   const size=Buffer.byteLength(buffer.source);
   if(packageSupport.inPackage(p,root)){packageBufferBytes+=size;if(size>packageSupport.limits.fileBytes||packageBufferBytes>packageSupport.limits.sourceBytes)throw Error('Open package buffers exceed the source budget');}
   else{bufferBytes+=size;if(++localBuffers>32||size>16384||bufferBytes>65536)throw Error('Open project buffers exceed the source budget');}
   buffers.set(p.toLowerCase(),buffer.source);
  }
 }
 buffers.set(entry.toLowerCase(),source);
 function boundedPath(input){const p=path.resolve(input);if(!inside(p,root))throw Error('Module path leaves the project folder: '+input);return policy.checked(p);}
 function accountSource(p,content){
  const key=p.toLowerCase(),isPackage=packageSupport.inPackage(p,root),size=Buffer.byteLength(content),previous=accountedSources.get(key),max=isPackage?packageSupport.limits.fileBytes:16384;
  if(size>max)throw Error('Module exceeds '+(isPackage?'2 MiB':'16 KiB')+': '+path.relative(root,p));
  if(previous===undefined){if(isPackage){if(++packageFiles>packageSupport.limits.files)throw Error('Project exceeds 256 package module files');}else if(++localFiles>32)throw Error('Project exceeds 32 module files');}
  const increase=Math.max(size,previous||0)-(previous||0);if(isPackage){packageTotal+=increase;if(packageTotal>packageSupport.limits.sourceBytes)throw Error('Package sources exceed 8 MiB');}else{total+=increase;if(total>65536)throw Error('Project sources exceed 64 KiB');}accountedSources.set(key,Math.max(size,previous||0));
 }
 const packages=packageSupport.tracker(root,buffers,aborted,{onDiscovery:accountSource});
 const configs=compilerConfig.create({root,buffers,checked:boundedPath,aborted});
 function read(input){
  aborted();const p=boundedPath(input),key=p.toLowerCase();if(snapshots.has(key))return snapshots.get(key).source;
  const isPackage=packageSupport.inPackage(p,root);
  if(chosenRoot)packages.chain(path.dirname(p));
  let content=buffers.get(key);
  const max=isPackage?packageSupport.limits.fileBytes:16384;
  if(content===undefined)content=packageSupport.readText(p,max,'Module exceeds '+(isPackage?'2 MiB':'16 KiB')+': '+path.relative(root,p));
  accountSource(p,content);
  snapshots.set(key,{path:p,name:path.relative(root,p),source:content,sha256:hash(content),origin:buffers.has(key)?'editor':'disk',...(/\.(?:[cm]?js|jsx|[cm]?ts|tsx)$/i.test(p)?{loader:loaderFor(p)}:{})});return content;
 }
 const resolve=require('./revival-local-resolve.cjs').create({root,checked:boundedPath,buffers,manifest:packages.manifest,negative:packages.negative,aborted}).resolve;
 read(entry);let entryCode=working,hasDefault=parsed.defaultExport||(parsed.cjs&&!parsed.esmExports),edit=null;
 const last=parsed.ast.body.findLast(runtimeStatement);
 if(!parsed.exports&&last?.type==='ExpressionStatement'){
  const expression=working.slice(last.expression.start,last.expression.end);
  const prefix=parsed.cjs?'module.exports = (':'export default (';
  entryCode=working.slice(0,last.start)+prefix+expression+');'+working.slice(last.end);hasDefault=true;
  edit={start:last.start,expressionStart:last.expression.start,expressionEnd:last.expression.end,end:last.end,prefixLength:prefix.length,code:entryCode};
 }
 let context,timer;
 const abort=()=>{context?.cancel().catch(()=>{});};signal?.addEventListener('abort',abort,{once:true});
 try{
  aborted();
  context=await esbuild.context({absWorkingDir:root,tsconfigRaw:{},nodePaths:[],entryPoints:['lt-evaluation-entry'],bundle:true,write:false,platform:'browser',format:'esm',outfile:'light-table-project.js',sourcemap:'external',sourcesContent:false,target:'es2022',metafile:true,treeShaking:false,legalComments:'none',logLevel:'silent',plugins:[{name:'light-table-project',setup(build){
   build.onResolve({filter:/.*/},async args=>{
    try{
    if(args.pluginData?.ltNativeResolve)return;
    aborted();if(args.kind==='entry-point')return {path:'lt-evaluation-entry',namespace:'lt-wrapper'};
    if(args.namespace==='lt-wrapper'&&args.path==='lt:entry')return {path:entry,namespace:'lt-project'};
    const configured=configs.resolve(args.path,args.importer,resolve);if(configured)return {path:configured,namespace:'lt-project'};
    return await packages.resolve(args,build,resolve);
    }catch(error){return {errors:[{text:error.message,detail:error}]};}
   });
   build.onLoad({filter:/.*/,namespace:'lt-project'},async args=>{
    const contents=args.path.toLowerCase()===entry.toLowerCase()?entryCode:watchSupport.apply(watch,args.path,read(args.path));
    const extension=path.extname(args.path).toLowerCase();if(!['.js','.mjs','.cjs','.jsx','.ts','.tsx','.mts','.cts','.json'].includes(extension))throw Error('Unsupported project module type: '+extension);
    const loader=loaderFor(args.path);let converted=contents;
    if(loader!=='js'&&extension!=='.json'){const raw=configs.forFile(args.path).raw,built=await esbuild.transform(contents,{loader,tsconfigRaw:raw,...(['preserve','react-native'].includes(raw.compilerOptions?.jsx)?{jsx:'transform'}:{}),sourcefile:'lt-project:'+args.path,sourcemap:'external',sourcesContent:false,target:'es2022',legalComments:'none',logLevel:'silent'});aborted();converted=built.code+'\n//# sourceMappingURL=data:application/json;base64,'+Buffer.from(built.map).toString('base64');}
    return {contents:converted,loader:extension==='.json'?'json':'js',resolveDir:path.dirname(args.path)};
   });
   build.onLoad({filter:/.*/,namespace:'lt-wrapper'},()=>({contents:'import * as entry from "lt:entry"; export default '+(hasDefault?'entry.default':'entry')+';',loader:'js'}));
   build.onLoad({filter:/.*/,namespace:'lt-empty'},()=>({contents:'module.exports={};',loader:'js'}));
  }}]});
  aborted();timer=setTimeout(()=>{timedOut=true;context.cancel().catch(()=>{});},Math.max(1,5000-(Date.now()-started)));
  const build=await context.rebuild();aborted();const bundle=build.outputFiles.find(f=>f.path.endsWith('.js')).text,map=build.outputFiles.find(f=>f.path.endsWith('.js.map')).text;
  if(Buffer.byteLength(bundle)>(packageFiles?packageSupport.limits.bundleBytes:131072))throw Error('Project bundle exceeds '+(packageFiles?'4 MiB':'128 KiB'));
  if(Buffer.byteLength(map)>(packageFiles?packageSupport.limits.mapBytes:262144))throw Error('Project source map exceeds '+(packageFiles?'8 MiB':'256 KiB'));
  const modules=[...snapshots.values()].sort((a,b)=>a.path.localeCompare(b.path));
  aborted();const tracked=packages.finish();aborted();const configuration=configs.finish();aborted();tracked.metadata=[...new Map([...tracked.metadata,...configuration.metadata].map(item=>[item.path.toLowerCase(),item])).values()].sort((a,b)=>a.path.localeCompare(b.path));
  if(tracked.metadata.length>packageSupport.limits.manifests)throw Error('Project exceeds 256 package/compiler metadata paths');
  if(tracked.metadata.reduce((bytes,item)=>bytes+Buffer.byteLength(item.source||''),0)>packageSupport.limits.metadataBytes)throw Error('Package/compiler metadata exceeds 1 MiB');
  const graphHash=hash(JSON.stringify({modules:modules.map(m=>({name:m.name,sha256:m.sha256,...(m.loader?{loader:m.loader}:{})})),metadata:tracked.metadata.map(m=>({name:m.name,sha256:m.sha256,exists:m.exists}))}));
  const inlineEntry=options.inline?snapshots.get(entry.toLowerCase()):null;
  aborted();
  return {code:bundle+'\n//# sourceURL=light-table-project.js',module:true,map:JSON.parse(map),edit,watch,...(inlineEntry?{entry:inlineEntry}:{}),project:{root,entry,sha256:graphHash,compiler:'esbuild '+esbuild.version,modules:inlineEntry?modules.filter(item=>item.path.toLowerCase()!==entry.toLowerCase()):modules,...tracked,warnings:build.warnings.map(w=>w.text).slice(0,8)}};
 }catch(error){
  if(signal?.aborted)throw Error('Execution cancelled');
  aborted();
  const configured=compilerConfig.validateLocation(compilerConfig.fromError(error),{root,checked:boundedPath});
  if(configured){const diagnostic=(error.errors||[]).slice(0,16).find(item=>{const location=compilerConfig.validateLocation(compilerConfig.fromError(item),{root,checked:boundedPath});return location?.path===configured.path&&location.sha256===configured.sha256&&location.offset===configured.offset;}),failure=Error(diagnostic?.text||error.message,{cause:error});failure.location=configured;throw failure;}
  const first=error.errors?.[0];if(first){const l=first.location||first.notes?.find(n=>n.location?.file.startsWith('lt-project:'))?.location;const failure=Error((l?l.file.replace(/^lt-project:/,'')+':'+l.line+':'+(l.column+1)+' - ':'')+first.text);if(l){const p=l.file.replace(/^lt-project:/,'');const module=snapshots.get(path.normalize(p).toLowerCase());if(module){const column=Buffer.from(l.lineText||'').subarray(0,l.column).toString('utf8').length,position=restoreEntryPosition({edit,watch,project:{entry}},module,l.line,column);failure.location=location(module,position.line,position.column);}}throw failure;}
  throw error;
 }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);if(context)await context.dispose();}
}
function location(module,line,column){
 const lines=module.source.split('\n');line=Math.max(1,Math.min(lines.length,line));column=Math.max(0,Math.min(lines[line-1].replace(/\r$/,'').length,column));
 return {path:module.path,name:module.name,line,column:column+1,source:module.source,sourceLine:lines[line-1].replace(/\r$/,''),sha256:module.sha256};
}
function restoreEntryPosition(prepared,module,line,column){
 const edit=prepared.edit,entry=prepared.project?.entry||prepared.entry?.path,watch=watchSupport.forFile(prepared.watch,module.path);if(String(module.path).toLowerCase()!==String(entry).toLowerCase())return watchSupport.position(watch,line,column,module.source);
 if(!edit)return watchSupport.position(watch,line,column,module.source);
 const lines=edit.code.split('\n');let offset=column;for(let i=0;i<line-1;i++)offset+=lines[i].length+1;
 const expression=edit.start+edit.prefixLength,expressionEnd=expression+edit.expressionEnd-edit.expressionStart,trailer=expressionEnd+2;
 if(offset>=trailer)offset=edit.end+offset-trailer;
 else if(offset>=expressionEnd)offset=edit.expressionEnd;
 else if(offset>=expression)offset=edit.expressionStart+offset-expression;
 else if(offset>=edit.start)offset=edit.expressionStart;
 offset=watchSupport.offset(watch,offset);const before=module.source.slice(0,offset),originalLine=before.split('\n').length;
 return {line:originalLine,column:offset-(before.lastIndexOf('\n')+1)};
}
function runtimeError(prepared,value){
 const error=Error(typeof value.error==='string'?value.error.slice(0,1024):'JavaScript execution failed');
 const stack=typeof value.stack==='string'?value.stack.slice(0,4096):'';
 const frames=[...stack.matchAll(/light-table-(project|script)\.js:(\d+):(\d+)/g)].filter(frame=>Number.isSafeInteger(Number(frame[2]))&&Number(frame[2])>0&&Number.isSafeInteger(Number(frame[3]))&&Number(frame[3])>0);
 if(prepared?.map){
  const trace=new TraceMap(prepared.map);
  for(const frame of frames){if(frame[1]!=='project')continue;
   const point=originalPositionFor(trace,{line:Number(frame[2]),column:Number(frame[3])-1});
   if(!point.source||!point.line)continue;
   const source=point.source.replace(/^lt-project:/,'');
   const module=point.source==='lt-inline:Untitled'?prepared.entry:prepared.project?.modules.find(m=>path.normalize(m.path).toLowerCase()===path.normalize(source).toLowerCase())||(prepared.entry&&path.normalize(prepared.entry.path||'').toLowerCase()===path.normalize(source).toLowerCase()?prepared.entry:null);
   if(!module)continue;
   const position=restoreEntryPosition(prepared,module,point.line,point.column);
   error.location={...location(module,position.line,position.column),...(prepared.project?{graphHash:prepared.project.sha256}:{})};break;
  }
 }else if(prepared?.entry&&frames.some(f=>f[1]==='script')){
  const frame=frames.find(f=>f[1]==='script'),point=restoreEntryPosition(prepared,prepared.entry,Number(frame[2]),Number(frame[3])-1);error.location=location(prepared.entry,point.line,point.column);
 }
 if(error.location)error.message=error.location.name+':'+error.location.line+':'+error.location.column+' - '+error.message;
 return error;
}
function runtimeLocation(prepared,line,column){return runtimeError(prepared,{error:'JavaScript execution failed',stack:'at light-table-project.js:'+line+':'+(column+1)}).location;}
module.exports={prepare,analysis,runtimeStatement,runtimeError,runtimeLocation,restoreEntryPosition,location,stop:()=>esbuild.stop()};
async function prepareInline(source,options,signal,watch){
 const entryPath=options.path?policy.checked(options.path):null;
 const working=watch?.source||source;
 const filename=entryPath||options.filename||'Untitled.js',loader=syntax.effectiveLoader(filename,options.loader),entry={path:entryPath,name:entryPath?path.basename(entryPath):'Untitled',source,sha256:hash(source),loader};
 let parsed;try{parsed=analysis(working,{filename,loader});}catch(error){if(loader!=='js'){const point=watchSupport.position(watch,error.loc?.line||1,error.loc?.column||0,source);error.location=location(entry,point.line,point.column);throw error;}return {code:working+'\n//# sourceURL=light-table-script.js',entry,watch};}
 if(loader==='js'&&!parsed.imports&&!parsed.topLevelAwait&&!(parsed.cjs&&parsed.exports))return {code:working+'\n//# sourceURL=light-table-script.js',entry,watch};
 if(parsed.dependencies)throw Error('Save this code in a project file before running its imports.');
 let code=working,hasDefault=parsed.defaultExport||(parsed.cjs&&!parsed.esmExports),edit=null;
 const last=parsed.ast.body.findLast(runtimeStatement);
 if(!parsed.exports&&last?.type==='ExpressionStatement'){
  const prefix=parsed.cjs?'module.exports = (':'export default (';
  code=working.slice(0,last.start)+prefix+working.slice(last.expression.start,last.expression.end)+');'+working.slice(last.end);hasDefault=true;
  edit={start:last.start,expressionStart:last.expression.start,expressionEnd:last.expression.end,end:last.end,prefixLength:prefix.length,code};
 }
 if(signal?.aborted)throw Error('Execution cancelled');
 const inlineRoot=entryPath?projects.info().recents.map(item=>item.path).filter(root=>inside(entryPath,root)).sort((a,b)=>b.length-a.length)[0]:null,configuration=inlineRoot?compilerConfig.create({root:inlineRoot,buffers:new Map((options.buffers||[]).map(item=>[item.path.toLowerCase(),item.source])),checked:input=>policy.checked(input),aborted:()=>{if(signal?.aborted)throw Error('Execution cancelled');}}):null;
 let compiled,metadata;try{const raw=configuration?.forFile(entryPath).raw||{compilerOptions:{}};compiled=await esbuild.transform(code,{loader,tsconfigRaw:raw,...(['preserve','react-native'].includes(raw.compilerOptions?.jsx)?{jsx:'transform'}:{}),format:'esm',target:'es2022',sourcemap:'external',sourcefile:'lt-inline:Untitled',sourcesContent:false,legalComments:'none',logLevel:'silent'});metadata=configuration?.finish().metadata||[];}catch(error){const configured=compilerConfig.validateLocation(compilerConfig.fromError(error),{root:inlineRoot,checked:policy.checked});if(configured)error.location=configured;throw error;}
 if(signal?.aborted)throw Error('Execution cancelled');
 if(Buffer.byteLength(compiled.code)>131072||Buffer.byteLength(compiled.map)>262144)throw Error('Compiled code exceeds the source budget');
 // Selection identity belongs to its editor version; only compiler metadata is
 // checked against project disk/buffers, never the selection against a full file.
 const project=inlineRoot?{root:inlineRoot,entry:entryPath,modules:[],metadata,packages:[],sha256:hash(JSON.stringify({source:entry.sha256,loader,metadata:metadata.map(item=>({name:item.name,sha256:item.sha256}))})),compiler:'esbuild '+esbuild.version}:null;
 return {code:compiled.code+'\n//# sourceURL=light-table-project.js',module:true,resultExport:hasDefault?'default':'namespace',map:JSON.parse(compiled.map),edit,entry,watch,...(project?{project}:{})};
}
