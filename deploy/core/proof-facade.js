'use strict';
(()=>{
const b=window.ltProof, info=b.info;
window.ltDirname=info.core;
window.ltProcess={platform:info.platform,env:{LT_USER_DIR:info.user,USERPROFILE:info.user,LT_DEV_CLI:'true'},versions:info.versions,argv:[],execPath:'',cwd:()=>info.docs,nextTick:cb=>setTimeout(cb,0),on:()=>{}};
const unavailable=()=>{throw Error('Capability unavailable in bounded revival proof');};
let startupRead=null;
function readFile(path){
 if(startupRead&&norm(path).toLowerCase()===norm(startupRead.path).toLowerCase()){
  const source=startupRead.source;startupRead=null;return source;
 }
 return b.read(path);
}
const fs={existsSync:b.exists,readFileSync:readFile,readFile:(p,cb)=>{try{cb(readFile(p));}catch(e){console.error(e);}},writeFileSync:b.write,appendFileSync:b.append,mkdirSync:b.mkdir,unlinkSync:window.ltFileActions.unlink,renameSync:window.ltFileActions.rename,readdirSync:b.list,realpathSync:b.real,statSync:p=>{const s=b.stat(p);return {...s,mtime:new Date(s.mtime),isDirectory:()=>s.directory,isFile:()=>s.file};},watchFile:()=>{},unwatchFile:()=>{},createWriteStream:p=>({write:s=>b.append(p,String(s)),end:()=>{}})};
function norm(p){let v=String(p).replace(/\\/g,'/');const prefix=/^[A-Za-z]:/.test(v)?v.slice(0,2):'';v=v.slice(prefix.length);const parts=[];for(const seg of v.split('/')){if(!seg||seg==='.')continue;if(seg==='..')parts.pop();else parts.push(seg);}return (prefix+(v.startsWith('/')?'/':'')+parts.join('/')).replace(/\//g,'\\');}
const fpath={sep:'\\',join:(...s)=>norm(s.join('/')),resolve:(...s)=>{let base=info.docs;for(const part of s){base=/^[A-Za-z]:/.test(part)?part:base+'/'+part;}return norm(base);},dirname:p=>norm(p).replace(/\\[^\\]*$/,''),basename:(p,ext)=>{let v=norm(p).split('\\').pop();return ext&&v.endsWith(ext)?v.slice(0,-ext.length):v;},extname:p=>{const v=norm(p).split('\\').pop();return v.includes('.')?v.slice(v.lastIndexOf('.')):'';},relative:(a,p)=>{const aa=norm(a).split('\\'),bb=norm(p).split('\\');while(aa.length&&bb.length&&aa[0].toLowerCase()===bb[0].toLowerCase()){aa.shift();bb.shift();}return [...aa.map(()=>'..'),...bb].join('\\');}};
const desktop=window.ltDesktop,callbacks={app:new Map(),popup:new Map()};
desktop.onMenu(id=>callbacks[id.split(':')[0]]?.get(id)?.());
function menuItems(menu,kind){callbacks[kind].clear();let next=0;function convert(menu){return menu.items.map(item=>{const out={};for(const key of ['label','type','role','accelerator','enabled','checked'])if(item[key]!==undefined)out[key]=item[key];if(item.submenu)out.submenu=convert(item.submenu);if(typeof item.click==='function'){out.id=kind+':'+next++;callbacks[kind].set(out.id,item.click);}return out;});}return convert(menu);}
class MenuItem{constructor(opts){Object.assign(this,opts);}}
class Menu{constructor(){this.items=[];}append(i){this.items.push(i);}popup(){desktop.menu('popup',menuItems(this,'popup'));}static setApplicationMenu(menu){window.ltProofMenu=menu;desktop.menu('app',menuItems(menu,'app'));}}
const win={id:info.windowId,getSize:()=>b.window('size'),getPosition:()=>b.window('position'),isFullScreen:()=>b.window('fullscreen'),focus:()=>b.window('focus'),minimize:()=>b.window('minimize'),maximize:()=>b.window('maximize'),setSize:()=>{},setPosition:()=>{},setFullScreen:value=>b.window('set-fullscreen',value),close:()=>b.window('close'),destroy:()=>b.window('destroy')};
const remoteFacade={getCurrentWindow:()=>win,app:{getAppPath:()=>info.core},getGlobal:name=>name==='browserOpenFiles'?[]:{},process:{argv:['proof','core']},Menu,MenuItem,dialog:{showOpenDialog:(_window,opts)=>{if(window.ltProofOpenPath){const target=window.ltProofOpenPath;delete window.ltProofOpenPath;return [target];}return desktop.open(opts);},showSaveDialog:(_window,opts)=>desktop.save(opts)}};
let zoom=1;const electron={remote:remoteFacade,webFrame:{getZoomFactor:()=>zoom,setZoomFactor:v=>{zoom=v;document.body.style.zoom=String(v);}},ipcRenderer:{on:(channel,cb)=>{if(channel==='app')b.onApp(cb);},send:(channel)=>{if(channel==='initWindow')b.notifyInit();else if(channel==='createWindow')b.newWindow();else console.info('IPC feature unavailable',channel);}},shell:{openExternal:unavailable,openItem:unavailable,showItemInFolder:unavailable},clipboard:{writeText:desktop.clipboardWrite,readText:desktop.clipboardRead}};
const emitter={on:()=>emitter,send:()=>{},kill:()=>{},stdout:{on:()=>{}},stderr:{on:()=>{}}};
const cp={fork:()=>{console.info('Background worker disabled in bounded proof');return emitter;},spawn:unavailable,exec:(cmd,cb)=>{if(cmd==='wmic logicaldisk get name')cb(null,'Name\r\nE:\r\n','');else unavailable();}};
const shell={mkdir:(flag,p)=>b.mkdir(p||flag),cp:unavailable,rm:unavailable,exec:unavailable,test:(flag,p)=>flag==='-d'?fs.statSync(p).isDirectory():b.exists(p),which:()=>null};
window.ltRequire=name=>{const leaf=String(name).replace(/\\/g,'/').split('/node_modules/').pop();switch(leaf){case 'electron':return electron;case 'fs':return fs;case 'path':return fpath;case 'os':return {EOL:'\r\n',homedir:()=>info.user};case 'util':return {inspect:v=>{try{return JSON.stringify(v);}catch{return String(v);}}};case 'child_process':return cp;case 'net':return {createServer:unavailable,connect:unavailable};case 'shelljs':return shell;case 'request':return Object.assign(unavailable,{get:unavailable,defaults:()=>unavailable});case 'tar':case 'zlib':return {};case 'socket.io':return {listen:unavailable};default:throw Error('Module not allowed: '+name);}};
window.ltStartup=(()=>{
 let initialized=false,opening=false,again=false,count=0,last=null;
 const command=(name,...args)=>lt.objs.command.exec_BANG_(cljs.core.keyword(name),...args);
 function notice(message){const node=document.getElementById('proof-notice');if(node)node.textContent=message;else console.error(message);}
 function existing(path){const matches=cljs.core.to_array(lt.objs.editor.pool.by_path(path)),active=lt.objs.editor.pool.last_active();return matches.includes(active)?active:matches[0];}
 function focus(target,line){lt.objs.tabs.active_BANG_(target);const cm=ltProofUI.connect();if(!cm||lt.objs.editor.pool.last_active()!==target)throw Error('The requested file did not become active');cm.focus();if(line!==null)command('go-to-line',line);}
 function open(item){
  if(!['file','directory','new-file'].includes(item.kind)||typeof item.path!=='string')throw Error('Invalid authorized open target');
  if(item.kind==='directory'){
   if(!b.stat(item.path).directory)throw Error('The requested folder is no longer available');
   if(item.project){if(!ltProjects.openedFolder(item.project))throw Error('The requested project could not be opened');}
   else lt.objs.cli.open_paths(cljs.core.js__GT_clj([[item.path,null]]),item.add===true);
   command('workspace.show',true);return;
  }
  let target=existing(item.path);
  if(!target){
   const present=b.exists(item.path);
   if(item.kind==='file'&&!present)throw Error('The requested file is no longer available');
   if(present&&!b.stat(item.path).file)throw Error('The requested path is no longer a file');
   // Validate the bounded disk read before the legacy opener can register a
   // blank document on error. Its synchronous read consumes this exact source
   // once; the finally block releases it even if opening fails.
   if(present)startupRead={path:item.path,source:b.read(item.path)};
   try{lt.objs.cli.open_paths(cljs.core.js__GT_clj([[item.path,null]]),item.add===true);}
   finally{startupRead=null;}
   target=existing(item.path);if(!target)throw Error('The requested file could not be opened');
  }else if(item.add)lt.object.raise(lt.objs.workspace.current_ws,cljs.core.keyword('add.file!'),item.path);
  focus(target,item.line??null);
 }
 function drain(){
  if(!initialized)return;if(opening){again=true;return;}opening=true;
  try{do{again=false;for(const item of window.ltOpenTargets.take()){
   count++;last={id:item.id,path:item.path??null,kind:item.kind,origin:item.origin??null};
   if(item.kind==='error'){notice(item.message);continue;}
   try{open(item);}catch(error){notice('Could not open target: '+String(error.message).slice(0,1024));}
  }}while(again);}catch(error){notice('Could not receive open targets: '+String(error.message).slice(0,1024));}finally{opening=false;}
 }
 return {initialize(){if(initialized)return;initialized=true;window.ltOpenTargets.onAvailable(drain);drain();},diagnostics:()=>({initialized,delivered:count,last})};
})();
})();
