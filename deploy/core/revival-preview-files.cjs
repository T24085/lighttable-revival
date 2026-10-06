'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const policy=require('./proof-policy.cjs'),projects=require('./revival-projects.cjs'),watches=require('./proof-watches.cjs'),syntax=require('./revival-syntax.cjs');
// Main-process-only fixture entry. Symbols cannot arrive over renderer IPC.
const reviewerFixtureRoot=Symbol('reviewer-fixture-root');
const javascriptFile=file=>/\.(?:[cm]?js|jsx|[cm]?ts|tsx)$/i.test(file);
const limits=Object.freeze({files:256,fileBytes:2*1024*1024,totalBytes:8*1024*1024});
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const types={'.html':'text/html','.htm':'text/html','.js':'text/javascript','.mjs':'text/javascript','.cjs':'text/javascript','.jsx':'text/javascript','.ts':'text/typescript','.tsx':'text/typescript-jsx','.mts':'text/typescript','.cts':'text/typescript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.avif':'image/avif','.bmp':'image/bmp','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf','.otf':'font/otf','.eot':'application/vnd.ms-fontobject','.txt':'text/plain'};
function inside(file,root){const rel=path.relative(root,file);return rel===''||(!path.isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+path.sep));}
function prepare(options,origin){
 if(!options||typeof options!=='object'||Array.isArray(options)||typeof options.path!=='string')throw Error('Choose an HTML or JavaScript file in an opened project.');
 const entry=policy.checked(options.path),fixture=options[reviewerFixtureRoot];
 if(fixture!==undefined){const fixtureBase=path.join(require('./revival-assistant-profile.cjs').directory(path.join(policy.user,'assistant')),'reviewer-fixtures');if(typeof fixture!=='string'||!inside(fixture,fixtureBase)||!inside(entry,fixture))throw Error('Invalid internal reviewer fixture root');}
 const root=fixture||projects.info().recents.map(p=>p.path).filter(p=>inside(entry,p)).sort((a,b)=>b.length-a.length)[0];
 if(!root)throw Error('Open the containing folder with File → Open project before previewing it.');
 if(!/\.(html?|[cm]?js|jsx|[cm]?ts|tsx)$/i.test(entry))throw Error('Preview an HTML, JavaScript, JSX, TypeScript or TSX file.');
 const buffers=new Map(),sources=new Map(),loaders=new Map(),sourceSizes=new Map();let bufferBytes=0,bytes=0;
 function checked(input){const file=path.resolve(input);if(!inside(file,root))throw Error('Preview path leaves the project.');return policy.checked(file);}
 function selectLoader(file,hint,replace=false){if(hint===undefined)return;if(!javascriptFile(file))throw Error('Source grammar overrides need a JavaScript, JSX or TypeScript file.');const selected=syntax.effectiveLoader(file,hint),key=file.toLowerCase();if(!replace&&loaders.has(key)&&loaders.get(key)!==selected)throw Error('Watched grammar differs from its preview buffer');loaders.set(key,selected);}
 function loaderFor(file){return syntax.effectiveLoader(file,loaders.get(file.toLowerCase()));}
 function typeFor(file){const loader=javascriptFile(file)?loaderFor(file):undefined;return loader?loader==='ts'?'text/typescript':loader==='tsx'?'text/typescript-jsx':'text/javascript':types[path.extname(file).toLowerCase()]||'application/octet-stream';}
 function chargeSource(file,size){const key=file.toLowerCase(),prior=sourceSizes.get(key);if(prior===undefined&&sourceSizes.size>=limits.files)throw Error('Preview exceeds 256 source paths.');if(size>limits.fileBytes)throw Error('Preview source exceeds 2 MiB: '+path.relative(root,file));const next=Math.max(prior||0,size);bytes+=next-(prior||0);if(bytes>limits.totalBytes)throw Error('Preview source graph exceeds 8 MiB.');sourceSizes.set(key,next);}
 if(options.buffers!==undefined){
  if(!Array.isArray(options.buffers)||options.buffers.length>limits.files)throw Error('Preview accepts at most 256 open buffers.');
  for(const item of options.buffers){
   if(!item||typeof item.path!=='string'||typeof item.source!=='string')throw Error('Invalid preview buffer.');
   const file=policy.checked(item.path);if(!inside(file,root))continue;
   selectLoader(file,item.loader);
   const value=Buffer.from(item.source);bufferBytes+=value.length;
   if(value.length>limits.fileBytes||bufferBytes>limits.totalBytes)throw Error('Preview buffers exceed the 2 MiB file / 8 MiB total limit.');
   if(buffers.has(file.toLowerCase()))throw Error('Duplicate preview buffer.');buffers.set(file.toLowerCase(),value);
  }
 }
 if(options.watchFiles!==undefined){if(!Array.isArray(options.watchFiles)||options.watchFiles.length>64)throw Error('At most 64 watched files are allowed');for(const item of options.watchFiles){if(!item||typeof item.path!=='string')throw Error('Invalid watched project file');selectLoader(checked(item.path),item.loader);}}
 selectLoader(entry,options.loader,true);
 function read(input){
  const file=checked(input),key=file.toLowerCase();if(sources.has(key))return sources.get(key);
  chargeSource(file,0);
  const name=path.relative(root,file),loader=javascriptFile(file)?loaderFor(file):undefined,type=typeFor(file);
  let value=buffers.get(key),origin=value?'editor':'disk';
  if(!value){
   let fd;try{
    fd=fs.openSync(file,'r');const stat=fs.fstatSync(fd);if(!stat.isFile()||stat.size>limits.fileBytes)throw Error('Preview source exceeds 2 MiB or is not a file: '+name);
    value=Buffer.alloc(stat.size+1);let count=0,n;while(count<value.length&&(n=fs.readSync(fd,value,count,value.length-count,null))>0)count+=n;
    if(count>stat.size)throw Error('Preview source changed while reading: '+name);value=value.subarray(0,count);
   }catch(error){if(error.code==='ENOENT'||error.code==='ENOTDIR'){const missing={path:file,name,exists:false,source:null,sha256:null,byteLength:0,type,...(loader?{loader}:{})};sources.set(key,missing);return missing;}throw error;}finally{if(fd!==undefined)fs.closeSync(fd);}
  }
  chargeSource(file,value.length);
  const text=/^(text\/|application\/json|image\/svg)/.test(type),item={path:file,name,exists:true,origin,source:text?value.toString('utf8'):null,sha256:hash(value),byteLength:value.length,type,value,...(loader?{loader}:{})};sources.set(key,item);return item;
 }
 function url(file){file=checked(file);return origin+'/'+path.relative(root,file).split(path.sep).map(encodeURIComponent).join('/');}
 function fromURL(input){
  const parsed=new URL(input);if(parsed.host!==new URL(origin).host||parsed.protocol!=='lt-preview:'||parsed.username||parsed.password)throw Error('Preview request leaves its origin.');
  const relative=decodeURIComponent(parsed.pathname).replace(/^\//,'');if(/[\\:\x00]/.test(relative))throw Error('Invalid preview resource path.');return checked(path.join(root,relative));
 }
 const entrySource=read(entry);if(!entrySource.exists)throw Error('Preview entry does not exist.');
 let watch;try{watch=watches.plan(entrySource.source,options.watches,options.watchFiles,entry,checked,undefined,(source,specs,key,tokens,file)=>require('./revival-html-watches.cjs').instrumentSource(source,specs,key,tokens,file,javascriptFile(file)?loaderFor(file):undefined),entrySource.loader);}catch(error){if(error.watchPath&&error.loc)error.location={path:error.watchPath,name:path.relative(root,error.watchPath),line:error.loc.line,column:error.loc.column+1,source:error.watchSource,sourceLine:error.watchSource.split(/\r?\n/)[error.loc.line-1]||'',sha256:hash(error.watchSource),...(javascriptFile(error.watchPath)?{loader:loaderFor(error.watchPath)}:{})};throw error;}
 for(const item of watch?.files||[]){
  if(!/\.(?:html?|[cm]?js|jsx|[cm]?ts|tsx)$/i.test(item.path))throw Error('Browser watches need HTML, JavaScript, JSX or TypeScript project files.');
  const key=item.path.toLowerCase(),value=Buffer.from(item.originalSource),existing=buffers.get(key);
  if(existing&&existing.toString('utf8')!==item.originalSource)throw Error('Watched preview buffer changed before startup: '+item.path);
  if(!existing){bufferBytes+=value.length;if(value.length>limits.fileBytes||bufferBytes>limits.totalBytes)throw Error('Watched preview buffers exceed 2 MiB / 8 MiB');buffers.set(key,value);}
  const source=read(item.path);if(source.source!==item.originalSource)throw Error('Watched preview source changed before startup: '+item.path);
 }
 const htmlSupport=require('./revival-html-watches.cjs'),htmlResponses=new Map(),inlineSources=new Map();
 function htmlResponse(item){
  if(htmlResponses.has(item.path))return htmlResponses.get(item.path);const base=watches.forFile(watch,item.path)||{source:item.source,edits:[]},annotated=htmlSupport.annotate(base,origin);
  if(inlineSources.size+annotated.scripts.length>256)throw Error('Preview exceeds 256 inline script sources');
  for(const script of annotated.scripts)inlineSources.set(script.url,{...script,path:item.path,instrument:annotated.instrument});htmlResponses.set(item.path,annotated.instrument.source);return annotated.instrument.source;
 }
 let html;
 if(/\.html?$/i.test(entry))html=htmlResponse(entrySource);
 else{
  let module=/\.(?:mjs|mts|cts)$/i.test(entry)||entrySource.loader!=='js';if(!module){try{require('acorn').parse(entrySource.source,{ecmaVersion:'latest',sourceType:'script'});}catch(_){module=true;}}
  html='<!doctype html><meta charset="utf-8"><title>'+path.basename(entry).replace(/[<&"]/g,'_')+'</title><body><script'+(module?' type="module"':'')+' src="'+url(entry)+'"></script></body>';
 }
 let compilation=null;
 function snapshot(){const captured=new Map([...sources.values()].map(({value,...item})=>[item.path.toLowerCase(),item]));for(const item of compilation?.metadata||[]){const key=item.path.toLowerCase(),loaded=captured.get(key);if(loaded){if(item.kind==='resolution-source'||item.exists===false&&loaded.exists)captured.set(key,{...loaded,resolutionSha256:item.sha256});}else captured.set(key,{...item,snapshotRole:'metadata',type:item.kind==='resolution-source'?typeFor(item.path):'application/json',origin:'disk',byteLength:Buffer.byteLength(item.source||'')});}const files=[...captured.values()].sort((a,b)=>a.name.localeCompare(b.name));return {root,entry,files,sha256:hash(JSON.stringify(files.map(({name,sha256,exists,loader,resolutionSha256})=>({name,sha256,exists,...(loader?{loader}:{}),...(resolutionSha256!==undefined?{resolutionSha256}:{})})))),...(compilation?.compiler?{compiler:compilation.compiler,packages:compilation.packages,outputs:compilation.outputs,warnings:compilation.warnings}:{})};}
 function response(file){const item=read(file);return item.exists&&/\.html?$/i.test(file)?Buffer.from(htmlResponse(item)):watch&&item.exists&&/\.(?:[cm]?js|jsx|[cm]?ts|tsx)$/i.test(file)?Buffer.from(watches.apply(watch,file,item.source)):item.value;}
 function mapLocation(address,line,column){const file=fromURL(address),mapped=compiler.mapLocation(file,line,column);if(mapped)return mapped;if(compiler.virtual(file)||compiler.resource(file)?.trace||compiler.resource(file)?.record?.classicTransform)return null;const inline=inlineSources.get(address),item=read(inline?.path||file);if(!item.exists)return null;let position;if(inline){const index=htmlSupport.inlineIndex(inline,line,column-1);position=htmlSupport.originalLocation(item.source,watches.offset(inline.instrument,index));}else if(/\.[cm]?js$/i.test(item.path)){const instrumented=watches.forFile(watch,item.path),index=require('./revival-js-locations.cjs').indexFromLocation(instrumented?.source||item.source,line,column-1);if(index<0)return null;position=htmlSupport.originalLocation(item.source,watches.offset(instrumented,index));}else position=watches.position(watches.forFile(watch,item.path),line,column-1,item.source||'');return {...item,line:position.line,column:position.column+1,sourceLine:item.source?.split(/\r?\n/)[position.line-1]||'',value:undefined};}
 const compiler=require('./revival-preview-packages.cjs').create({root,entry,origin,read,checked,url,fromURL,loaderFor,typeFor,onDiscovery:(file,source)=>chargeSource(checked(file),Buffer.byteLength(source)),instrument:file=>[...inlineSources.values()].find(item=>item.path===file)?.instrument||watches.forFile(watch,file)||{source:read(file).source,edits:[]},watch,buffers:[...buffers].map(([file,value])=>({path:file,source:value.toString('utf8')})),responseSource:file=>response(file).toString('utf8')});
 return {entry,root,get html(){return html;},get bootstrap(){return compilation?.bootstrap;},url:url(entry),urlFor:url,typeFor:file=>compiler.resource(file)?.type||read(file).type,read:file=>compiler.virtual(file)?compiler.resource(file)||read(file):read(file),response:file=>compiler.resource(file)?.value||response(file),fromURL,mapLocation,snapshot,watch,limits,compile:async()=>{compilation=await compiler.compile(html);html=compilation.html;},close:compiler.close};
}
module.exports={prepare,limits,reviewerFixtureRoot};
