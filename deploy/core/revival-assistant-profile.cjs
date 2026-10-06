'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function directory(legacy,{test=process.env.LT_REVIVAL_TEST==='1',localAppData=process.env.LOCALAPPDATA}={}){
 if(test||!localAppData)return legacy;
 if(!path.isAbsolute(localAppData))throw Error('LOCALAPPDATA must be an absolute path');
 const identity=crypto.createHash('sha256').update(path.resolve(legacy).toLowerCase()).digest('hex').slice(0,16);
 const target=path.join(localAppData,'LightTableRevival/profiles',identity,'assistant');
 if(fs.existsSync(target))return target;
 fs.mkdirSync(path.dirname(target),{recursive:true});
 const stage=target+'.'+crypto.randomUUID()+'.tmp';fs.mkdirSync(stage);
 try{
  if(fs.existsSync(legacy))for(const item of fs.readdirSync(legacy,{withFileTypes:true})){
   if(!item.name.endsWith('.json'))continue;
   if(item.isSymbolicLink()||!item.isFile())throw Error('Unexpected assistant profile entry: '+item.name);
   fs.copyFileSync(path.join(legacy,item.name),path.join(stage,item.name));
  }
  fs.renameSync(stage,target);
 }finally{
  // Only remove the staging folder this migration created, never the original.
  if(fs.existsSync(stage)){for(const name of fs.readdirSync(stage))fs.unlinkSync(path.join(stage,name));fs.rmdirSync(stage);}
 }
 return target;
}
module.exports={directory};
