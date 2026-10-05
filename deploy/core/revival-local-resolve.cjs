'use strict';
const fs=require('fs'),path=require('path');
const extensions=Object.freeze(['.js','.mjs','.cjs','.jsx','.ts','.tsx','.mts','.cts','.json']);
const browserExtensions=Object.freeze(['.tsx','.ts','.jsx','.js','.css','.json']);
const packageExtensions=Object.freeze(['.jsx','.js','.tsx','.ts','.css','.json']);
function inside(file,root){const relative=path.relative(root,file);return relative===''||!path.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith('..'+path.sep);}
function create({root,checked,buffers=new Map(),manifest,negative,aborted=()=>{}}){
 root=path.resolve(root);if(typeof checked!=='function'||typeof manifest!=='function'||typeof negative!=='function'||!(buffers instanceof Map))throw Error('Invalid local module resolver');
 function bounded(input){aborted();const file=path.resolve(input);if(!inside(file,root))throw Error('Module path leaves the project folder: '+input);return checked(file);}
 function stat(file){try{return fs.statSync(file);}catch(error){if(error.code==='ENOENT'||error.code==='ENOTDIR')return null;throw error;}}
 function candidate(input,diskOnly=false){const file=bounded(input),status=stat(file),key=file.toLowerCase();if(status?.isDirectory())return null;if(!status)negative(file);if(!diskOnly&&buffers.has(key)){const source=buffers.get(key);if(typeof source!=='string'&&!Buffer.isBuffer(source))throw Error('Invalid local module buffer');return file;}if(status?.isFile())return file;return null;}
 function virtualDirectory(file){const prefix=file.toLowerCase()+path.sep;for(const key of buffers.keys()){aborted();if(typeof key!=='string')throw Error('Invalid local module buffer path');if(key.toLowerCase().startsWith(prefix))return true;}return false;}
 function isDirectory(input){const file=bounded(input),status=stat(file);return !!status?.isDirectory()||!status&&virtualDirectory(file);}
 function files(file,infer){const exact=candidate(file);if(exact)return exact;if(infer)for(const extension of extensions){const found=candidate(file+extension);if(found)return found;}return null;}
 function index(file){for(const extension of extensions){const found=candidate(path.join(file,'index'+extension));if(found)return found;}return null;}
 function missing(file){const error=Error('Module not found: '+path.relative(root,file));error.code='LT_LOCAL_MODULE_NOT_FOUND';return error;}
 function resolve(input){
  const file=bounded(input),status=stat(file),directory=status?.isDirectory()||virtualDirectory(file),found=files(file,!path.extname(file)||directory);if(found)return found;
  // An explicitly named missing file keeps its established exact-file rule.
  // Dotted directories still take the directory entry-point path below.
  if(path.extname(file)&&!directory)throw missing(file);
  const info=manifest(file);if(info.exists&&Object.hasOwn(info.json,'main')&&info.json.main){
   const main=info.json.main;if(typeof main!=='string')throw Error('Invalid package.json main: '+path.relative(root,info.path));
   const entry=bounded(path.resolve(file,main)),target=files(entry,true)||index(entry);if(target)return target;
  }
  const fallback=index(file);if(fallback)return fallback;
  throw missing(file);
 }
 function trace(input){try{return resolve(input);}catch(error){if(error.code==='LT_LOCAL_MODULE_NOT_FOUND')return null;throw error;}}
 function browserDirectory(input){
  const file=bounded(input),status=stat(file);if(!status?.isDirectory()&&(status||!virtualDirectory(file)))return false;
  const info=manifest(file),browser=info.json?.browser;
  if(typeof browser==='string'&&browser||browser&&typeof browser==='object'&&!Array.isArray(browser))return true;
  const main=info.json?.main;if(typeof main!=='string'||!main)return false;
  const entry=bounded(path.resolve(file,main)),target=stat(entry);if(!target?.isDirectory()&&(target||!virtualDirectory(entry)))return false;
  const nested=manifest(entry).json?.browser;return !!nested&&typeof nested==='object'&&!Array.isArray(nested);
 }
 function browserFiles(file){
  const exact=candidate(file,true);if(exact)return exact;
  for(const extension of browserExtensions){const found=candidate(file+extension,true);if(found)return found;}
  // Native esbuild also substitutes authored JS extensions after file lookup.
  const extension=path.extname(file),substitutions={'.js':['.ts','.tsx'],'.jsx':['.ts','.tsx'],'.mjs':['.mts'],'.cjs':['.cts']}[extension];
  for(const replacement of substitutions||[]){const found=candidate(file.slice(0,-extension.length)+replacement,true);if(found)return found;}
  return null;
 }
 function browserMap(info,file){
  const map=info.json?.browser;if(!map||typeof map!=='object'||Array.isArray(map))return file;
  const relative='./'+path.relative(path.dirname(info.path),file).split(path.sep).join('/');
  if(!Object.hasOwn(map,relative))return file;
  const mapped=map[relative];return mapped===false?null:typeof mapped==='string'?/^\.\.?[\\/]/.test(mapped)?bounded(path.resolve(path.dirname(info.path),mapped)):null:file;
 }
 function browserIndex(file){
  if(!stat(bounded(file))?.isDirectory())return null;
  const info=manifest(file),entry=path.join(file,'index'),mapped=browserMap(info,entry);
  if(mapped===null)return null;
  if(mapped!==entry)return browserFiles(mapped)||browserIndexPlain(mapped);
  return browserIndexPlain(file);
 }
 function browserIndexPlain(file){for(const extension of browserExtensions){const found=candidate(path.join(file,'index'+extension),true);if(found)return found;}return null;}
 function traceNative(input){
  // Observe native browser candidates without selecting or serving them. The
  // legacy order differs, so native preferred missing TS files must be pinned.
  const file=bounded(input),direct=browserFiles(file);if(direct)return [direct];
  if(!stat(file)?.isDirectory())return [];
  const info=manifest(file),found=[];let moduleFound=false;
  for(const field of ['browser','module','main']){
   const value=info.json?.[field];if(typeof value!=='string'||!value)continue;
   const entry=browserMap(info,bounded(path.resolve(file,value)));if(entry===null)continue;
   const target=browserFiles(entry)||browserIndex(entry);if(target)found.push(target);if(target&&field==='module')moduleFound=true;
   // esbuild may keep both module and main alternatives for import/require.
   if(target&&field!=='module')break;
  }
  if(!found.length||moduleFound&&!Object.hasOwn(info.json||{},'main')){const fallback=browserIndex(file);if(fallback)found.push(fallback);}
  return found;
 }
 function nativeChoice(input,{kind='import-statement',map=()=>null,trailing=false,skipInputMap=false,fileExtensions=browserExtensions}={}){
  // Mirror browser file/field ordering with the editor buffers as an overlay.
  // The caller still delegates installed packages/exports to native esbuild.
  const candidates=new Set();let blockedIndex=false;
  function choose(input){const file=candidate(input);if(file)candidates.add(file);return file?{path:file}:null;}
  function directory(file){const status=stat(bounded(file));return status?.isDirectory()||!status&&virtualDirectory(file);}
  function fileChoice(file){
   let found=choose(file);if(found)return found;
   for(const extension of fileExtensions){found=choose(file+extension);if(found)return found;}
   const extension=path.extname(file),substitutions={'.js':['.ts','.tsx'],'.jsx':['.ts','.tsx'],'.mjs':['.mts'],'.cjs':['.cts']}[extension];
   for(const replacement of substitutions||[]){found=choose(file.slice(0,-extension.length)+replacement);if(found)return found;}
   return null;
  }
  function plainIndex(file){if(!directory(file))return null;for(const extension of fileExtensions){const found=choose(path.join(file,'index'+extension));if(found)return found;}return null;}
  function mappedIndex(file){
   if(!directory(file))return null;
   const entry=path.join(file,'index'),mapped=map(entry,{scopeDir:file});
   if(mapped){observe(mapped.file);if(mapped.value===false)return {disabled:true,path:entry,browser:true};const replacement=bounded(path.resolve(file,mapped.value)),found=fileChoice(replacement)||plainIndex(replacement);if(!found)blockedIndex=true;return found?{...found,browser:true}:null;}
   return plainIndex(file);
  }
  function observe(file){if(file)choose(file);}
  function field(file,value){
   const entry=bounded(path.resolve(file,value)),mapped=map(entry,{scopeDir:file});
   if(mapped){observe(mapped.file);if(mapped.value===false)return {disabled:true,path:entry,browser:true};const replacement=bounded(path.resolve(file,mapped.value)),found=fileChoice(replacement)||mappedIndex(replacement);return found?{...found,browser:true}:null;}
   return fileChoice(entry)||mappedIndex(entry);
  }
  function directoryChoice(file){
   if(!directory(file))return null;
   const info=manifest(file),json=info.json||{};
   if(json.main&&typeof json.main!=='string')throw Error('Invalid package.json main: '+path.relative(root,info.path));
   if(json.main)bounded(path.resolve(file,json.main));
   if(typeof json.browser==='string'&&json.browser){const found=field(file,json.browser);if(found)return {...found,browser:true};}
   const module=typeof json.module==='string'&&json.module?field(file,json.module):null;
   const main=typeof json.main==='string'&&json.main?field(file,json.main):null;
   if(module){const alternative=main||(!Object.hasOwn(json,'main')?mappedIndex(file):null);return kind==='require-call'&&alternative?alternative:module;}
   if(main)return main;blockedIndex=false;return mappedIndex(file);
  }
  function load(file,onlyDirectory=false){blockedIndex=false;return (!onlyDirectory&&fileChoice(file))||directoryChoice(file);}
  const file=bounded(input),mapped=skipInputMap?null:map(file);let result;
  if(mapped){
   observe(mapped.file);
   if(mapped.value===false)result={disabled:true,path:mapped.file};
   else if(/^\.\.?[\\/]/.test(mapped.value))result=load(bounded(path.resolve(mapped.owner,mapped.value)))||load(file,trailing);
   else result={bare:mapped.value,nativePath:mapped.file,owner:mapped.owner,fallback:()=>({result:load(file,trailing),candidates})};
  }else result=load(file,trailing);
  return {result,candidates,blocked:!result&&blockedIndex};
 }
 return {resolve,trace,traceNative,nativeChoice,browserDirectory,isDirectory};
}
module.exports={create,extensions,browserExtensions,packageExtensions};
