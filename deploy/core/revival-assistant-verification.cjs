'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const normalized=value=>value.replace(/\r\n?/g,'\n');
const canonical=file=>path.resolve(file).toLowerCase();
const ignored=new Set(['node_modules','.git','.revival','__pycache__','.venv','venv','dist','build','coverage','.pytest_cache','.lt-ai']);
// Independent of preview startup. Generated outputs are excluded, source and
// test files are included. Incomplete inventories cannot establish a test pass.
function projectRevision(root,buffers=[],exclude=[]){
 try{
  root=fs.realpathSync(root);let count=0,bytes=0;const files=[];
  const excluded=exclude.map(canonical),open=new Map(buffers.filter(b=>b.path).map(b=>[canonical(b.path),b.source]));
  function visit(folder){for(const entry of fs.readdirSync(folder,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
   const file=path.join(folder,entry.name),key=canonical(file);
   if(ignored.has(entry.name)||excluded.some(p=>key===p||key.startsWith(p+path.sep))||/^\.lt-ai-.*\.tmp$/.test(entry.name))continue;
   if(++count>2048||entry.isSymbolicLink())throw Error('Incomplete source inventory');
   if(entry.isDirectory()){visit(file);continue;}if(!entry.isFile())throw Error('Unsupported source entry');
   const stat=fs.statSync(file);bytes+=stat.size;if(stat.size>16*1024*1024||bytes>64*1024*1024)throw Error('Source inventory exceeds its budget');
   const source=fs.readFileSync(file),buffer=open.get(key);
   if(buffer!==undefined&&normalized(buffer)!==normalized(source.toString('utf8')))throw Error('Unsaved source was not tested');
   files.push([path.relative(root,file).replace(/\\/g,'/'),hash(source)]);
  }}
  visit(root);for(const [file]of open){if(file.startsWith(canonical(root)+path.sep)&&!fs.existsSync(file))throw Error('Unsaved new file was not tested');}
  return hash(JSON.stringify({version:1,root:canonical(root),files}));
 }catch(_){return null;}
}
function occurrences(source,text){return text?source.split(text).length-1:0;}
function intendedAction(name,args,root,before){
 const target=typeof args?.path==='string'&&args.path.trim()?canonical(path.resolve(root,args.path)):null;
 const intent={name,path:target};
 if(name==='write_file'&&typeof args?.content==='string')intent.contentHash=hash(normalized(args.content));
 if(name==='rename_file'&&typeof args?.new_path==='string')intent.newPath=canonical(path.resolve(root,args.new_path));
 if(name==='create_project')intent.template=args?.template||'empty';
 if(name==='edit_file'&&typeof args?.old_text==='string'&&typeof args?.new_text==='string'){
  const oldText=normalized(args.old_text),newText=normalized(args.new_text),source=typeof before==='string'?normalized(before):null;
  if(source!==null&&oldText&&occurrences(source,oldText)===1)intent.contentHash=hash(source.replace(oldText,newText));
  if(source!==null&&oldText&&oldText.length+newText.length<=65536)Object.assign(intent,{oldText,newText,priorOld:occurrences(source,oldText),priorNew:occurrences(source,newText)});
 }
 return intent;
}
function resolves(pending,success,entry){
 const samePath=pending.path===success.path,unknownPath=pending.path===null;
 if(['write_file','edit_file'].includes(pending.name)&&['write_file','edit_file'].includes(success.name)){
  if(!entry||entry.status!=='saved'||entry.kind!=='write'||(!samePath&&!unknownPath))return false;
  const source=normalized(entry.after.source||'');
  if(pending.contentHash&&hash(source)===pending.contentHash)return true;
  if(pending.name==='write_file'&&pending.contentHash)return false;
  if(pending.oldText&&pending.newText!==undefined)return (pending.newText?occurrences(source,pending.newText)>pending.priorNew:pending.priorOld>0)&&(pending.priorOld===0||occurrences(source,pending.oldText)<pending.priorOld);
  if(pending.contentHash)return false;
  // Older checkpoints and invalid arguments have no reconstructable content.
  // A successful retry may resolve them, but only for their named file/tool.
  return samePath&&pending.name===success.name&&pending.path!==null;
 }
 if(!samePath||unknownPath||pending.name!==success.name)return false;
 if(pending.name==='rename_file')return entry?.status==='saved'&&entry.kind==='rename'&&pending.newPath===success.newPath;
 if(pending.name==='delete_file')return entry?.status==='saved'&&entry.kind==='delete';
 if(pending.name==='create_project')return pending.template===success.template;
 return pending.name==='create_directory';
}
module.exports={projectRevision,intendedAction,resolves};
