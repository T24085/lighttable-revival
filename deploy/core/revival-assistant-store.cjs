'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
function create(directory){
 fs.mkdirSync(directory,{recursive:true});
 const valid=id=>{if(typeof id!=='string'||! /^[a-f0-9-]{36}$/.test(id))throw Error('Invalid conversation identity');return path.join(directory,id+'.json');};
 function write(file,value){const stage=file+'.'+crypto.randomUUID()+'.tmp';try{fs.writeFileSync(stage,JSON.stringify(value,null,2),'utf8');fs.renameSync(stage,file);}finally{if(fs.existsSync(stage))fs.unlinkSync(stage);}}
 function settings(value){const file=path.join(directory,'settings.json'),defaults={version:1,model:null,contextTokens:65536,thinking:false,dockWidth:340,dockTab:'chat'};if(value){if(Object.keys(value).some(key=>!Object.hasOwn(defaults,key)||key==='version'))throw Error('Unknown assistant setting');const next={...settings(),...value};if(next.model!==null&&typeof next.model!=='string')throw Error('Invalid model');if(!Number.isInteger(next.contextTokens)||next.contextTokens<2048||next.contextTokens>262144)throw Error('Context size must be between 2048 and 262144 tokens');if(typeof next.thinking!=='boolean')throw Error('Invalid thinking setting');next.dockWidth=Math.max(240,Math.min(800,Number(next.dockWidth)||340));next.dockTab=next.dockTab==='activity'?'activity':'chat';write(file,next);return next;}try{return {...defaults,...JSON.parse(fs.readFileSync(file,'utf8'))};}catch(error){if(error.code!=='ENOENT')throw Error('Assistant settings could not be read: '+error.message);return defaults;}}
 function save(session){session.updatedAt=new Date().toISOString();write(valid(session.id),session);return session;}
 function load(id){const session=JSON.parse(fs.readFileSync(valid(id),'utf8'));if(session.version!==1||session.id!==id||!Array.isArray(session.messages)||!Array.isArray(session.events)||!Array.isArray(session.journal))throw Error('Invalid conversation checkpoint');return session;}
 function list(root){return fs.readdirSync(directory).filter(name=>/^[a-f0-9-]{36}\.json$/.test(name)).map(name=>{try{const s=load(name.slice(0,-5));return {id:s.id,root:s.root,title:s.title,status:s.status,updatedAt:s.updatedAt};}catch(_){return null;}}).filter(s=>s&&(!root||path.resolve(s.root).toLowerCase()===path.resolve(root).toLowerCase())).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));}
 function conversation(root){return save({version:1,id:crypto.randomUUID(),root:path.resolve(root),title:'New chat',status:'idle',messages:[],events:[],journal:[],checkpoint:null});}
 function recover(){for(const item of list()){const s=load(item.id);let changed=false;if(['running','pausing'].includes(s.status)){s.status='paused';s.checkpoint={...s.checkpoint,reason:'Light Table restarted. Inspect the last action before resuming.'};changed=true;}for(const command of s.commands||[])if(['starting','running'].includes(command.status)){command.status='interrupted';command.reason='Not replayed after restart';changed=true;}if(changed)save(s);}}
 recover();return {settings,save,load,list,conversation,directory,hash};
}
module.exports={create,hash};
