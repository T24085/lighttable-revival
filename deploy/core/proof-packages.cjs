'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {builtinModules}=require('module');
const policy=require('./proof-policy.cjs');
const builtins=new Set(builtinModules.map(name=>name.replace(/^node:/,'')));
const digest=source=>crypto.createHash('sha256').update(source).digest('hex');
const limits=Object.freeze({files:256,fileBytes:2*1024*1024,sourceBytes:8*1024*1024,manifests:256,manifestBytes:65536,metadataBytes:1024*1024,bundleBytes:4*1024*1024,mapBytes:8*1024*1024});
function readText(file,limit,message){
 const fd=fs.openSync(file,'r');try{
  const stat=fs.fstatSync(fd);if(!stat.isFile()||stat.size>limit)throw Error(message);
  const buffer=Buffer.alloc(stat.size+1);let size=0,count;
  while(size<=stat.size&&(count=fs.readSync(fd,buffer,size,buffer.length-size,null))>0)size+=count;
  if(size>stat.size)throw Error('Source changed while reading. Run again: '+file);return buffer.subarray(0,size).toString('utf8');
 }finally{fs.closeSync(fd);}
}
function inside(file,root){const relative=path.relative(root,file);return relative===''||(!path.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith('..'+path.sep));}
function inPackage(file,root){return path.relative(root,file).split(path.sep).some(part=>part.toLowerCase()==='node_modules');}
function tracker(root,buffers,aborted,{onDiscovery}={}){
 if(onDiscovery!==undefined&&typeof onDiscovery!=='function')throw Error('Invalid discovery source accounting');
 const metadata=new Map();let bytes=0;
 function checked(input){const file=path.resolve(input);if(!inside(file,root))throw Error('Module path leaves the project folder: '+input);return policy.checked(file);}
 function savedManifest(file,source){const buffer=buffers.get(file.toLowerCase());if(buffer!==undefined){if(typeof buffer!=='string'&&!Buffer.isBuffer(buffer))throw Error('Invalid package manifest buffer');if(String(buffer).replace(/\r\n?/g,'\n')!==source?.replace(/\r\n?/g,'\n'))throw Error('Save package.json before running its imports: '+path.relative(root,file));}}
 function manifest(dir){
  aborted();const file=checked(path.join(dir,'package.json')),key=file.toLowerCase();if(metadata.has(key)){const previous=metadata.get(key);savedManifest(file,previous.source);if(previous.exists!==fs.existsSync(file))throw Error('Package metadata changed during compilation. Run again.');return previous;}
  if(metadata.size>=limits.manifests)throw Error('Project exceeds 256 package metadata paths');
  const exists=fs.existsSync(file);let source=null,json=null;
  if(exists){
   source=readText(file,limits.manifestBytes,'Package manifest exceeds 64 KiB: '+path.relative(root,file));bytes+=Buffer.byteLength(source);if(bytes>limits.metadataBytes)throw Error('Package metadata exceeds 1 MiB');
   try{json=JSON.parse(source.replace(/^\uFEFF/,''));}catch(_){throw Error('Invalid package.json: '+path.relative(root,file));}
   if(!json||typeof json!=='object'||Array.isArray(json))throw Error('Invalid package.json: '+path.relative(root,file));
  }
  savedManifest(file,source);
  const item={path:file,name:path.relative(root,file),exists,source,sha256:exists?digest(source):null};
  metadata.set(key,{...item,json});return metadata.get(key);
 }
 function chain(dir){
  const found=[];for(let current=checked(dir);inside(current,root);current=path.dirname(current)){
   const item=manifest(current);if(item.exists)found.push(item);if(current.toLowerCase()===root.toLowerCase())break;
  }return found;
 }
 function negative(input){
  aborted();const file=checked(input),key=file.toLowerCase();if(metadata.has(key))return metadata.get(key);
  try{fs.statSync(file);return null;}catch(error){if(error.code!=='ENOENT'&&error.code!=='ENOTDIR')throw error;}
  if(metadata.size>=limits.manifests)throw Error('Project exceeds 256 package metadata paths');
  const item={path:file,name:path.relative(root,file),exists:false,source:null,sha256:null,json:null};metadata.set(key,item);return item;
 }
 function positive(input){
  aborted();const file=checked(input),key=file.toLowerCase(),previous=metadata.get(key);
  if(previous){if(!previous.exists)throw Error('Package metadata changed during compilation. Run again.');return previous;}
  if(path.basename(file).toLowerCase()==='package.json')return manifest(path.dirname(file));
  if(metadata.size>=limits.manifests)throw Error('Project exceeds 256 package metadata paths');
  const source=readText(file,limits.fileBytes,'Resolution source exceeds 2 MiB: '+path.relative(root,file));aborted();onDiscovery?.(file,source);aborted();
  bytes+=Buffer.byteLength(source);if(bytes>limits.metadataBytes)throw Error('Package metadata exceeds 1 MiB');
  const item={path:file,name:path.relative(root,file),exists:true,source,sha256:digest(source),kind:'resolution-source',json:null};metadata.set(key,item);return item;
 }
 const localTrace=require('./revival-local-resolve.cjs').create({root,checked,buffers,manifest,negative,aborted});
 function browserOwner(dir){return chain(dir).find(item=>item.json.browser&&typeof item.json.browser==='object'&&!Array.isArray(item.json.browser));}
 function browserMatch(input,{bare=false,dir,scopeDir}={}){
  const owner=browserOwner(bare?dir:scopeDir||path.dirname(input));if(!owner)return null;
  const ownerDir=path.dirname(owner.path),map=owner.json.browser;
  function check(value,implicit=true){
   const names=[value,...(implicit?localTraceExtensions.map(extension=>value+extension):[]),path.posix.join(value,'index'),...(implicit?localTraceExtensions.map(extension=>path.posix.join(value,'index')+extension):[])];
   for(let name of names){aborted();if(value.startsWith('./')&&!name.startsWith('.'))name='./'+name;const mapped=map[name];if(Object.hasOwn(map,name)&&(mapped===false||typeof mapped==='string'))return {value:mapped,owner:ownerDir,file:checked(path.resolve(ownerDir,name))};}
   return null;
  }
  if(bare){const direct=check(input);if(direct)return direct;const relative=path.relative(ownerDir,dir);if(!relative.split(path.sep).some(part=>part.toLowerCase()==='node_modules')){const prefix=relative.split(path.sep).join('/');return check('./'+(prefix?prefix+'/':'')+input,false);}return null;}
  const relative=path.relative(ownerDir,input).split(path.sep).join('/');if(!relative)return null;
  return check(relative)||(!relative.startsWith('.')?check('./'+relative):null);
 }
 const localTraceExtensions=require('./revival-local-resolve.cjs').browserExtensions;
 function locate(specifier,dir){
  if(specifier.startsWith('node:')||builtins.has(specifier))throw Error('Node import is unavailable in isolated JavaScript: '+specifier);
  if(!/^(?:@[\w.~+-]+\/)?[\w.~+-]+(?:\/[\w.~+@-]+)*$/.test(specifier)||specifier.split('/').some(part=>part==='.'||part==='..'))throw Error('Unsupported package import: '+specifier);
  const pieces=specifier.split('/'),name=specifier.startsWith('@')?pieces.slice(0,2).join('/'):pieces[0];
  // Locate an installed package before asking esbuild to resolve exports. Never
  // fall back to the application's dependencies, NODE_PATH, or a parent project.
  for(let current=checked(dir);inside(current,root);current=path.dirname(current)){
   if(path.basename(current).toLowerCase()==='node_modules')continue;
   const candidate=checked(path.join(current,'node_modules',name));
   manifest(candidate); // A later nearer install also invalidates the snapshot.
   if(fs.existsSync(candidate)&&fs.statSync(candidate).isDirectory()){
    manifest(candidate);chain(path.dirname(candidate));
    const subpath=pieces.slice(name.startsWith('@')?2:1).join('/');if(subpath)chain(path.dirname(checked(path.join(candidate,subpath))));
    return candidate;
   }
   if(current.toLowerCase()===root.toLowerCase())break;
  }
  throw Error('Package not installed in this project: '+name);
 }
 async function resolve(args,build,localResolve){
  const dir=path.dirname(args.importer),relative=/^\.\.?[\\/]/.test(args.path),candidates=new Set(),nativeOptions={kind:args.kind,importer:args.importer,namespace:'file',resolveDir:dir,pluginData:{ltNativeResolve:true},with:args.with};
  chain(dir);let choice=null,fallback=null,nativeDisabled=null;
  function pin(file){for(const candidate of candidates){aborted();if(candidate.toLowerCase()===file.toLowerCase()&&!buffers.has(candidate.toLowerCase()))continue;if(!fs.existsSync(candidate)){negative(candidate);continue;}positive(candidate);}}
  function disabledEntry(input,specifier){
   if(specifier){if(manifest(input).json?.exports!==undefined)return;const pieces=specifier.split('/'),subpath=pieces.slice(specifier.startsWith('@')?2:1).join('/');if(subpath)input=checked(path.join(input,subpath));}
   const mapped=browserMatch(input);if(mapped?.value===false){negative(mapped.file);nativeDisabled={path:input};return;}
   const owner=browserOwner(localTrace.isDirectory(input)?input:path.dirname(input));if(owner&&Object.values(owner.json.browser).some(value=>value===false)){const overlay=localTrace.nativeChoice(input,{kind:args.kind,map:browserMatch,fileExtensions:require('./revival-local-resolve.cjs').packageExtensions});if(overlay.result?.disabled)nativeDisabled=overlay.result;}
  }
  function fallbackChoice(current){const alternate=current.fallback();for(const candidate of alternate.candidates)candidates.add(candidate);return alternate.result;}
  if(relative){
   const input=checked(path.resolve(dir,args.path));
   const mapped=browserMatch(input);if(mapped?.value===false){negative(mapped.file);return {path:mapped.file+':'+args.path,namespace:'lt-empty'};}
   if(!inPackage(args.importer,root)){
    // Retain the established local ordering when no enclosing browser map or
    // string entry participates. Otherwise choose native priorities with buffers.
    const owner=browserOwner(path.dirname(input));
    if(!owner){let legacy,missing;try{legacy=localResolve(input);}catch(error){if(error.code!=='LT_LOCAL_MODULE_NOT_FOUND')throw error;missing=error;}const directoryBrowser=(!legacy||inside(legacy,input))&&localTrace.browserDirectory(input);if(!directoryBrowser&&(!legacy||!browserOwner(path.dirname(legacy)))){if(missing)throw missing;candidates.add(legacy);pin(legacy);return {path:legacy,namespace:'lt-project'};}}
    const overlay=localTrace.nativeChoice(input,{kind:args.kind,map:browserMatch,trailing:args.path==='.'||args.path==='..'||/[\\/]$/.test(args.path)});
    for(const candidate of overlay.candidates)candidates.add(candidate);choice=overlay.result;
    if(!choice&&!overlay.blocked){fallback=localTrace.trace(input);if(fallback){const alternate=localTrace.nativeChoice(fallback,{kind:args.kind,map:browserMatch});for(const candidate of alternate.candidates)candidates.add(candidate);candidates.add(fallback);choice=alternate.result||{path:fallback};}}
   }else disabledEntry(input);
  }else{
   const mapped=browserMatch(args.path,{bare:true,dir});
   if(mapped?.value===false)return {path:mapped.file+':'+args.path,namespace:'lt-empty'};
   if(mapped&&/^\.\.?[\\/]/.test(mapped.value)){
    const overlay=localTrace.nativeChoice(checked(path.resolve(mapped.owner,mapped.value)),{kind:args.kind,map:browserMatch,skipInputMap:true});for(const candidate of overlay.candidates)candidates.add(candidate);choice=overlay.result;
   }else{const effective=mapped?mapped.value:args.path;disabledEntry(locate(effective,mapped?mapped.owner:dir),effective);}
  }
  if(choice?.disabled)return {path:choice.path+':'+args.path,namespace:'lt-empty'};
  if(choice?.bare){try{disabledEntry(locate(choice.bare,choice.owner),choice.bare);}catch(error){if(!/^Package not installed in this project: /.test(error.message))throw error;const alternate=fallbackChoice(choice);if(!alternate)throw error;choice=alternate;}}
  let result=await build.resolve(args.path,nativeOptions);aborted();
  // Native implicit extensions omit mjs/cjs. A supported local file remains
  // usable, but resolving its exact name natively preserves browser remaps.
  if(choice?.bare&&result.errors.length){
   const exactPath='./'+path.relative(dir,choice.nativePath).split(path.sep).join('/'),exact=await build.resolve(exactPath,nativeOptions);aborted();if(!exact.errors.length)result=exact;else choice=fallbackChoice(choice);
  }
  if(choice?.path){const file=checked(choice.path);chain(path.dirname(file));pin(file);return {path:file,namespace:'lt-project',warnings:result.errors.length?[]:result.warnings};}
  aborted();if(result.errors.length)return {errors:result.errors,warnings:result.warnings};
  if(result.external||result.suffix)throw Error('External or URL package imports are unavailable: '+args.path);
  if(result.namespace!=='file')throw Error('Unsupported package resolution: '+args.path);
  const file=checked(result.path);chain(path.dirname(file));
  if(nativeDisabled&&nativeDisabled.path.toLowerCase()===file.toLowerCase())return {path:file+':'+args.path,namespace:'lt-empty',warnings:result.warnings};
  pin(file);
  return {path:file,namespace:'lt-project',warnings:result.warnings};
 }
 function finish(){
  const items=[...metadata.values()].sort((a,b)=>a.path.localeCompare(b.path));
  // Resolution reads disk manifests. Reject a concurrent install/edit instead
  // of assigning a version to code resolved from a different manifest.
  for(const item of items){aborted();const file=checked(item.path),source=item.kind==='resolution-source';if(item.exists!==fs.existsSync(file)||(item.exists&&digest(readText(file,source?limits.fileBytes:limits.manifestBytes,source?'Resolution source exceeds 2 MiB':'Package manifest exceeds 64 KiB'))!==item.sha256))throw Error('Package metadata changed during compilation. Run again.');}
  const packages=items.filter(item=>item.exists&&inPackage(item.path,root)&&typeof item.json?.name==='string').map(item=>({name:item.json.name.slice(0,256),version:typeof item.json.version==='string'?item.json.version.slice(0,128):'unversioned',path:path.dirname(item.path),manifest:item.path,sha256:item.sha256}));
  return {metadata:items.map(({json,...item})=>item),packages};
 }
 return {resolve,chain,manifest,negative,positive,finish,requiresBrowser:input=>!!browserMatch(checked(input))};
}
module.exports={tracker,inPackage,limits,readText};
