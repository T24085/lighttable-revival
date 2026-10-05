'use strict';
const fs=require('fs'),path=require('path');
const limits=Object.freeze({pending:32,arguments:64,argumentBytes:32768,argumentCharacters:2048,pathCharacters:1024,messageCharacters:1024});
const logging=value=>value==='--enable-logging'||value.startsWith('--enable-logging=');
const identity=file=>process.platform==='win32'?file.toLowerCase():file;
function argumentsBound(args,extra=0){
 if(!Array.isArray(args)||args.length>limits.arguments+extra)throw Error('Startup arguments exceed their bounded target list');
 let bytes=0;for(const value of args){if(typeof value!=='string'||value.length>limits.argumentCharacters||value.includes('\0'))throw Error('Invalid startup argument');bytes+=Buffer.byteLength(value)+1;if(bytes>limits.argumentBytes)throw Error('Startup arguments exceed 32 KiB');}
}
function launchArguments(argv,{defaultApp=false}={}){
 argumentsBound(argv,2);if(!argv.length||!argv[0])throw Error('Missing launch executable');
 if(typeof defaultApp!=='boolean')throw Error('Invalid Electron launch shape');
 let index=1;
 if(defaultApp){
  // Electron can retain its logging switch before the application entry.
  while(index<argv.length&&logging(argv[index]))index++;
  if(index>=argv.length||!argv[index]||argv[index].startsWith('-'))throw Error('Missing launch application entry');
  index++;
 }
 return argv.slice(index);
}
function commandLine(args,cwd){
 argumentsBound(args);if(typeof cwd!=='string'||!path.isAbsolute(cwd)||cwd.includes('\0')||cwd.length>limits.pathCharacters)throw Error('Invalid launch directory');
 let add=false,literal=false;const values=[];
 for(const raw of args){
  if(!literal&&raw==='--'){literal=true;continue;}
  if(!literal&&logging(raw))continue;
  if(!literal&&(raw==='--add'||raw==='-a')){add=true;continue;}
  if(!literal&&raw.startsWith('-'))throw Error('Unsupported startup option: '+raw.slice(0,80));
  values.push(raw);
 }
 if(values.length>limits.pending)throw Error('Startup exceeds 32 open targets');
 return values.map(raw=>{
  let suffix=/:(\d+)$/.exec(raw);
  // C:2026 is a drive-relative filename, not a line suffix on file C.
  if(suffix?.index===1&&/^[A-Za-z]:/.test(raw))suffix=null;
  const line=suffix?Number(suffix[1]):null;
  if(line!==null&&(!Number.isSafeInteger(line)||line<1))throw Error('Invalid startup line number');
  const name=suffix?raw.slice(0,suffix.index):raw;if(!name)throw Error('Invalid startup path');
  const file=path.resolve(cwd,name);if(file.length>limits.pathCharacters)throw Error('Startup path exceeds 1024 characters');
  return {path:file,line,add};
 });
}
function noLinks(file){
 for(let current=file;;current=path.dirname(current)){
  try{if(fs.lstatSync(current).isSymbolicLink())throw Error('Links forbidden');}catch(error){if(error.code!=='ENOENT'&&error.code!=='ENOTDIR')throw error;}
  if(current===path.dirname(current))break;
 }
}
function prepare(target,origin){
 if(!target||typeof target.path!=='string'||!path.isAbsolute(target.path)||target.path.length>limits.pathCharacters||target.path.includes('\0'))throw Error('Invalid open target');
 const file=path.resolve(target.path),line=target.line??null;
 if(line!==null&&(!Number.isSafeInteger(line)||line<1))throw Error('Invalid open target line');
 noLinks(file);let stat;try{stat=fs.statSync(file);}catch(error){if(error.code!=='ENOENT')throw error;}
 if(origin==='file-manager'&&(!stat||!stat.isFile()))throw Error('The file-manager target is not an existing file');
 const kind=stat?.isDirectory()?'directory':stat?.isFile()?'file':!stat?'new-file':null;
 if(!kind)throw Error('The open target is not a regular file or directory');
 if(kind==='directory'&&line!==null)throw Error('A directory cannot have a line number');
 if(kind!=='directory'&&!fs.statSync(path.dirname(file)).isDirectory())throw Error('Missing parent directory');
 return {kind,path:file,line,add:target.add===true,origin};
}
function create({policy,preferredOwner=()=>null,notify=()=>{}}={}){
 if(!policy||typeof policy.grantFile!=='function'||typeof policy.grantDirectory!=='function'||typeof preferredOwner!=='function'||typeof notify!=='function')throw Error('Invalid open-target transport');
 let primary=null,sequence=0,overflow=null;const owners=new Set(),queue=[];
 const ownerNow=()=>{let preferred;try{preferred=preferredOwner();}catch(_){}return owners.has(preferred)?preferred:primary;};
 const wake=owner=>{if(owner!==null)try{notify(owner);}catch(_){/* The payload stays queued until take. */}};
 const same=(a,b)=>a.owner===b.owner&&a.path&&b.path&&identity(a.path)===identity(b.path)&&a.line===b.line&&a.add===b.add;
 const record=(owner,value)=>{const item={id:String(++sequence),owner,...value};queue.push(item);wake(owner);return item.id;};
 const failed=(owner,error)=>{
  const message=String(error?.message||error).slice(0,limits.messageCharacters);
  if(queue.length>=limits.pending){overflow={owner,message:'Too many pending open targets; retry after the editor opens.'};wake(owner);return null;}
  return record(owner,{kind:'error',message});
 };
 const reserve=(owner,count)=>{if(queue.length+count<=limits.pending)return true;failed(owner,Error('Too many pending open targets; retry after the editor opens.'));return false;};
 function grant(item,owner){
  const selected=item.kind==='directory'?policy.grantDirectory(item.path):policy.grantFile(item.path);
  if(typeof selected!=='string'||!path.isAbsolute(selected)||identity(path.resolve(selected))!==identity(item.path))throw Error('The granted target differs from the selected path');
  return record(owner,item);
 }
 function seed(args,cwd){
  const owner=ownerNow();
  try{
   // Validate the full startup batch and capacity before registering grants.
   const unique=[];for(const target of commandLine(args,cwd)){const item=prepare(target,'command-line');if(!queue.some(old=>same(old,{owner,...item}))&&!unique.some(old=>same(old,{owner,...item})))unique.push({owner,...item});}
   if(!reserve(owner,unique.length))return;
   for(const {owner:ignored,...item} of unique)grant(item,owner);
  }catch(error){failed(owner,error);}
 }
 function seedLaunch(argv,{defaultApp=false,cwd}={}){try{seed(launchArguments(argv,{defaultApp}),cwd);}catch(error){failed(ownerNow(),error);}}
 function fileManager(file){
  const owner=ownerNow();
  try{
   // Capacity is checked before filesystem work or registering a new grant.
   if(typeof file!=='string'||!path.isAbsolute(file)||file.length>limits.pathCharacters||file.includes('\0'))throw Error('Invalid open target');
   if(queue.some(item=>same(item,{owner,path:path.resolve(file),line:null,add:false})))return null;
   if(!reserve(owner,1))return null;
   return grant(prepare({path:file,line:null,add:false},'file-manager'),owner);
  }catch(error){return failed(owner,error);}
 }
 function register(owner){
  if(!Number.isInteger(owner)||owner<=0)throw Error('Invalid target owner');owners.add(owner);
  if(primary===null){primary=owner;for(const item of queue)if(item.owner===null)item.owner=owner;if(overflow?.owner===null)overflow.owner=owner;}
  if(queue.some(item=>item.owner===owner)||overflow?.owner===owner)wake(owner);
 }
 function take(owner){
  if(!owners.has(owner))return [];
  const delivered=[];for(let index=0;index<queue.length;){if(queue[index].owner===owner){const [item]=queue.splice(index,1);const {owner:ignored,...safe}=item;delivered.push(safe);}else index++;}
  if(overflow?.owner===owner){delivered.push({id:String(++sequence),kind:'error',message:overflow.message});overflow=null;}return delivered;
 }
 function closed(owner){
  if(!owners.delete(owner))return false;if(primary===owner)primary=owners.values().next().value??null;
  const next=ownerNow();for(const item of queue)if(item.owner===owner)item.owner=next;if(overflow?.owner===owner)overflow.owner=next;wake(next);return true;
 }
 return {seed,seedLaunch,register,take,closed,fileManager,diagnostics:()=>({pending:queue.length,owners:owners.size,overflow:!!overflow})};
}
module.exports={create,commandLine,launchArguments,limits};
