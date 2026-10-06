'use strict';
const fs=require('fs'),path=require('path');
// Editor proofs must not reopen tabs and project trees from earlier proofs.
// Preserve only the test profile; the user's normal profile is never touched.
function create(){
 if(process.env.LT_REVIVAL_TEST!=='1')throw Error('Editor isolation is test-only');
 const policy=require('../../deploy/core/proof-policy.cjs'),projects=require('../../deploy/core/revival-projects.cjs');
 const cache=path.join(policy.user,'ltcache'),workspace=path.join(cache,'workspace');
 const originalProject=fs.existsSync(projects.statePath)?fs.readFileSync(projects.statePath):null;
 function files(dir){const result=new Map();if(fs.existsSync(dir))for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isSymbolicLink())throw Error('Test cache links forbidden');if(entry.isDirectory())for(const pair of files(file))result.set(...pair);else if(entry.isFile())result.set(file,fs.readFileSync(file));}return result;}
 const saved=files(cache);
 for(const file of saved.keys())if(path.dirname(file)===workspace&&path.extname(file)==='.clj')fs.unlinkSync(file);
 let restored=false;
 return {restore(){if(restored)return;restored=true;for(const file of files(cache).keys())if(!saved.has(file))fs.unlinkSync(file);for(const [file,bytes]of saved){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);}if(originalProject)fs.writeFileSync(projects.statePath,originalProject);else if(fs.existsSync(projects.statePath))fs.unlinkSync(projects.statePath);return {projectRestored:true,cacheRestored:true};}};
}
module.exports={create};
