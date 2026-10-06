'use strict';
const fs=require('node:fs'),crypto=require('node:crypto');
const sleeper=new Int32Array(new SharedArrayBuffer(4));
// Windows sync/indexing software can hold a destination briefly. Retrying the
// rename keeps the previous complete checkpoint intact until replacement works.
function writeText(file,source,{io=fs,wait=ms=>Atomics.wait(sleeper,0,0,ms)}={}){
 const stage=file+'.'+crypto.randomUUID()+'.tmp',delays=[10,25,50,100,200];
 let primaryError;
 try{
  io.writeFileSync(stage,source,'utf8');
  for(let attempt=0;;attempt++)try{io.renameSync(stage,file);break;}catch(error){
   if(!['EPERM','EACCES','EBUSY'].includes(error.code)||attempt===delays.length)throw error;
   wait(delays[attempt]);
  }
 }catch(error){primaryError=error;throw error;}
 finally{try{io.unlinkSync(stage);}catch(error){if(error.code!=='ENOENT'&&!primaryError)throw error;}}
}
function write(file,value,options){return writeText(file,JSON.stringify(value,null,2),options);}
module.exports={write,writeText};
