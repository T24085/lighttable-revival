'use strict';
const fs=require('fs'), path=require('path'), crypto=require('crypto'), vm=require('vm');
const root=path.resolve(__dirname,'../..','.revival'), deploy=path.resolve(__dirname,'..'), user=path.join(root,process.env.LT_REVIVAL_TEST==='1'?'test-user':'proof-user'), docs=path.join(root,process.env.LT_REVIVAL_TEST==='1'?'test-proof-files':'proof-files');
const selected=new Map();
for(const dir of [user,docs]) fs.mkdirSync(dir,{recursive:true});
function seed(from,to){if(fs.existsSync(to))return;const stat=fs.lstatSync(from);if(stat.isSymbolicLink())throw Error('Template links forbidden');if(stat.isDirectory()){fs.mkdirSync(to,{recursive:true});for(const name of fs.readdirSync(from))seed(path.join(from,name),path.join(to,name));}else fs.copyFileSync(from,to);}
seed(path.join(__dirname,'User'),path.join(user,'User'));
const behaviors=path.join(user,'User','user.behaviors');const original=fs.readFileSync(behaviors,'utf8');if(original.includes('[:app :lt.objs.plugins/load-js "user_compiled.js"]'))fs.writeFileSync(behaviors,original.replace('[:app :lt.objs.plugins/load-js "user_compiled.js"]',';; Legacy sample plugin omitted from bounded revival.'));
if(!fs.existsSync(path.join(docs,'calculation.js')))fs.writeFileSync(path.join(docs,'calculation.js'),'(12 + 30)');
seed(path.join(__dirname,'fixtures','order-report.js'),path.join(docs,'order-report.js'));
function inside(p,r){const rel=path.relative(r,p);return rel===''||(!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel));}
function noLinks(p){for(let cur=p;cur!==path.dirname(cur);cur=path.dirname(cur)){try{if(fs.lstatSync(cur).isSymbolicLink())throw Error('Links forbidden');}catch(error){if(error.code!=='ENOENT'&&error.code!=='ENOTDIR')throw error;}}}
function directory(input){if(typeof input!=='string'||input.length>1024||input.includes('\0'))throw Error('Invalid directory');const p=path.resolve(input);noLinks(p);if(!fs.statSync(p).isDirectory())throw Error('Expected a directory');return p;}
// Only main-process native selections and explicit launch/OS targets grant access
// outside the sample workspace; renderer-supplied paths cannot create grants.
function grantFile(input){const p=path.resolve(input);noLinks(p);if(!fs.statSync(path.dirname(p)).isDirectory())throw Error('Missing parent directory');if(fs.existsSync(p)&&!fs.statSync(p).isFile())throw Error('Expected a file');selected.set(p.toLowerCase(),{path:p,directory:false});return p;}
function grantDirectory(input){const p=directory(input);selected.set(p.toLowerCase(),{path:p,directory:true});return p;}
function checked(input,write=false){if(typeof input!=='string'||input.length>1024||input.includes('\0'))throw Error('Invalid path');const p=path.resolve(input),allowed=write?[user,docs]:[deploy,user,docs];const grant=[...selected.values()].find(g=>g.directory?inside(p,g.path):p.toLowerCase()===g.path.toLowerCase());if(!grant&&!allowed.some(r=>inside(p,r)))throw Error('Path outside proof roots: '+p);noLinks(p);let cur=p;while(!fs.existsSync(cur)){const next=path.dirname(cur);if(next===cur)throw Error('Invalid ancestor');cur=next;}if(!grant&&!allowed.some(r=>inside(fs.realpathSync(cur),fs.realpathSync(r))))throw Error('Resolved path outside proof roots');return p;}
function calculate(source){if(typeof source!=='string'||source.length>256||!/^\s*[0-9()+\-*/%.\s]+\s*$/.test(source)||!/[0-9]/.test(source))throw Error('Only numeric arithmetic is allowed');if(/\/\/|\/\*|\*\*/.test(source))throw Error('Comments/exponentiation forbidden');const hash=crypto.createHash('sha256').update(source,'utf8').digest('hex');const result=vm.runInNewContext('"use strict";('+source+')',Object.create(null),{timeout:50,contextCodeGeneration:{strings:false,wasm:false}});if(typeof result!=='number'||!Number.isFinite(result))throw Error('Expected finite number');return {source,sha256:hash,result};}
function fingerprints(files){
 if(!Array.isArray(files)||files.length>544)throw Error('Invalid snapshot file list');
 let total=0;const buffer=Buffer.alloc(65536);
 return files.map(input=>{
  const file=checked(input);if(!fs.existsSync(file))return null;
  let fd;try{
   fd=fs.openSync(file,'r');const stat=fs.fstatSync(fd);if(!stat.isFile()||stat.size>2*1024*1024)throw Error('Snapshot file exceeds 2 MiB');
   const digest=crypto.createHash('sha256');let size=0,count;
   while((count=fs.readSync(fd,buffer,0,buffer.length,null))>0){size+=count;total+=count;if(size>2*1024*1024||total>10*1024*1024)throw Error('Snapshot sources exceed the read budget');digest.update(buffer.subarray(0,count));}
   return digest.digest('hex');
  }finally{if(fd!==undefined)fs.closeSync(fd);}
 });
}
const fileLimit=8*1024*1024;
function writableTarget(file){
 noLinks(file);let stat;try{stat=fs.statSync(file);}catch(error){if(error.code!=='ENOENT')throw error;}
 if(stat&&!stat.isFile())throw Error('Expected a file');
 if(stat&&(stat.mode&0o222)===0){const error=Error('EACCES: permission denied, write '+file);error.code='EACCES';error.path=file;throw error;}
 return stat;
}
function write(file,source){
 const previous=writableTarget(file),stage=path.join(path.dirname(file),'.lt-save-'+crypto.randomBytes(16).toString('hex')+'.tmp');
 let fd,owned=false;
 try{
  fd=fs.openSync(stage,'wx',0o666);owned=true;
  fs.writeFileSync(fd,source,'utf8');fs.fsyncSync(fd);
  // Preserve an existing file's permissions without granting its parent or stage.
  if(previous)fs.fchmodSync(fd,previous.mode&0o777);
  fs.closeSync(fd);fd=undefined;
  const current=writableTarget(file);checked(file,true);
  if(!!previous!==!!current||previous&&['ino','dev','mtimeMs','ctimeMs','size','mode'].some(key=>previous[key]!==current[key])){
   const error=Error('The file changed while saving: '+file);error.code='ESTALE';error.path=file;throw error;
  }
  fs.renameSync(stage,file);owned=false;
 }finally{
  if(fd!==undefined)try{fs.closeSync(fd);}catch(_){}
  if(owned)fs.unlinkSync(stage);
 }
}
function append(file,source,bytes){
 const previous=writableTarget(file);
 if((previous?.size||0)+bytes>fileLimit)throw Error('Append exceeds 8 MiB file bound');
 return fs.appendFileSync(file,source,'utf8');
}
function operation(op,args){if(!Array.isArray(args)||args.length>8)throw Error('Invalid arguments');switch(op){case 'info':return {core:__dirname,deploy,user,docs,autoLiveView:process.env.LT_REVIVAL_AUTO_LIVE!=='0',platform:process.platform,versions:{electron:process.versions.electron},windowId:1};case 'exists':try{return fs.existsSync(checked(args[0]));}catch(e){return false;}case 'read':{const p=checked(args[0]);if(fs.statSync(p).size>fileLimit)throw Error('Read too large');return fs.readFileSync(p,'utf8');}case 'stat':{const s=fs.statSync(checked(args[0]));return {directory:s.isDirectory(),file:s.isFile(),mode:s.mode,mtime:s.mtime.toISOString(),size:s.size};}case 'list':return fs.readdirSync(checked(args[0]));case 'real':return fs.realpathSync(checked(args[0]));case 'mkdir':return fs.mkdirSync(checked(args[0],true),{recursive:true});case 'unlink':{const p=checked(args[0],true);if(!fs.statSync(p).isFile())throw Error('Only files can be removed');return fs.unlinkSync(p);}case 'rename':{const from=checked(args[0],true),to=checked(args[1],true);if(fs.existsSync(to)&&from.toLowerCase()!==to.toLowerCase())throw Error('The destination already exists');return fs.renameSync(from,to);}case 'write':case 'append':{const p=checked(args[0],true);if(typeof args[1]!=='string'||Buffer.byteLength(args[1],'utf8')>fileLimit)throw Error('Write exceeds 8 MiB bound');return op==='write'?write(p,args[1]):append(p,args[1],Buffer.byteLength(args[1],'utf8'));}case 'calculate':return calculate(args[0]);default:throw Error('Unsupported proof operation '+op);}}
module.exports={operation,calculate,fingerprints,checked,grantFile,grantDirectory,directory,root,deploy,user,docs};
